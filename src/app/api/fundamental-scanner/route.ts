import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { yahooFinance } from '@/lib/yahoo-finance'
import { gemini, GEMINI_MODEL } from '@/lib/gemini'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { US_UNIVERSE } from '@/lib/swing-universe'
import { chunk, runBatched } from '@/lib/scan-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

const IL_TZ = 'Asia/Jerusalem'
// Both the full scan and the per-ticker AI verdicts are cached only for the
// rest of the calendar day they were generated on (Israel time) — a new day
// means a fresh scan on the first visit. Matches the swing scanner.
const ilDateStr = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: IL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const isSameIlDay = (d: Date) => ilDateStr(d) === ilDateStr(new Date())

const QUOTE_CHUNK_SIZE = 40
const SUMMARY_BATCH_SIZE = 15
const AI_BATCH_SIZE = 5
const TOP_N = 20

// Basic pre-filter thresholds — kept fixed rather than user-adjustable,
// since the expensive AI+search stage is cached per scan and changing a
// threshold on every request would defeat that cache.
const MIN_EPS_GROWTH_QOQ_PCT = 10
const MIN_REVENUE_GROWTH_YOY_PCT = 10

// GICS "sector" as returned by Yahoo has no distinct "AI" category — AI-theme
// names mostly fall under Technology already, so it's folded in here rather
// than tracked separately. Biotech isn't its own sector either (it's an
// industry under Healthcare), so it's matched on industry text instead.
const HYPE_SECTORS = new Set(['Technology', 'Energy'])
function isHypeSector(sector: string | null, industry: string | null): boolean {
  if (sector && HYPE_SECTORS.has(sector)) return true
  if (sector === 'Healthcare' && industry && /biotech/i.test(industry)) return true
  return false
}

interface FundamentalScanRow {
  symbol: string
  companyName: string | null
  sector: string | null
  price: number
  marketCap: number | null
  epsGrowthQoQPct: number | null
  revenueGrowthYoYPct: number | null
  isHypeSector: boolean
  isRecentIPO: boolean
  ipoYear: number | null
  earningsSoon: boolean
  nextEarningsDate: string | null
  fcfPositive: boolean | null
  trailingPE: number | null
  peReasonable: boolean
  baseScore: number
  score: number
  aiReasoning: string | null
  aiScored: boolean
}

function computeBaseScore(row: Pick<FundamentalScanRow,
  'epsGrowthQoQPct' | 'revenueGrowthYoYPct' | 'isHypeSector' | 'isRecentIPO' | 'earningsSoon' | 'fcfPositive' | 'peReasonable'>
): number {
  let score = 0
  score += Math.max(0, Math.min(25, (row.epsGrowthQoQPct ?? 0) / 2))
  score += Math.max(0, Math.min(25, (row.revenueGrowthYoYPct ?? 0) / 2))
  score += row.isHypeSector ? 15 : 0
  score += row.isRecentIPO ? 10 : 0
  score += row.earningsSoon ? 10 : 0
  score += row.fcfPositive === true ? 10 : row.fcfPositive === false ? 0 : 5
  score += row.peReasonable ? 5 : 0
  return Math.round(score)
}

async function fetchAiScore(row: FundamentalScanRow): Promise<{ score: number; reasoning: string } | null> {
  try {
    const cached = await prisma.aiScore.findUnique({
      where: { symbol_type: { symbol: row.symbol, type: 'fundamental_scan_ai' } },
    })
    if (cached && isSameIlDay(cached.createdAt)) {
      return JSON.parse(cached.scoreJson)
    }
  } catch { /* re-compute on cache miss */ }

  const prompt = `החזר JSON בלבד. אסור טקסט לפני או אחרי. אסור markdown. אסור backticks.

חפש בגוגל נתונים עדכניים על המניה ${row.symbol} (${row.companyName ?? row.symbol}):
- דוחות רבעוניים אחרונים
- ציפיות אנליסטים
- חדשות sector hype
- האם זו IPO חדשה
- תחזית צמיחה

נתונים ידועים מראש (מ-Yahoo Finance): סקטור=${row.sector ?? 'N/A'}, צמיחת EPS רבעונית=${row.epsGrowthQoQPct ?? 'N/A'}%, צמיחת הכנסות שנתית=${row.revenueGrowthYoYPct ?? 'N/A'}%, P/E=${row.trailingPE ?? 'N/A'}, FCF חיובי=${row.fcfPositive ?? 'N/A'}.

תן ציון פונדמנטלי 0-100 ונמק בקצרה בעברית (עד 2 משפטים, עד 40 מילים).

REQUIRED JSON (בדיוק הצורה הזו, בלי שום דבר אחר):
{"score":0,"reasoning":"הסבר בעברית"}`

  try {
    const res = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: 'You are a JSON-only API. Output valid JSON and nothing else.',
        // responseMimeType can't combine with tool use; capped thinking so
        // grounded search + reasoning can't silently eat the whole budget
        // and leave no text (MAX_TOKENS with an empty response).
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingBudget: 512 },
        temperature: 0.2,
        tools: [{ googleSearch: {} }],
      },
    })
    const raw = (res.text ?? '').trim()
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    let data: { score?: unknown; reasoning?: unknown }
    try {
      data = JSON.parse(clean)
    } catch {
      const match = clean.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('no JSON in response')
      data = JSON.parse(match[0])
    }
    const score = typeof data.score === 'number' && isFinite(data.score) ? Math.max(0, Math.min(100, Math.round(data.score))) : row.baseScore
    const reasoning = typeof data.reasoning === 'string' ? data.reasoning : ''
    const result = { score, reasoning }

    try {
      await prisma.aiScore.upsert({
        where:  { symbol_type: { symbol: row.symbol, type: 'fundamental_scan_ai' } },
        create: { symbol: row.symbol, type: 'fundamental_scan_ai', scoreJson: JSON.stringify(result) },
        update: { scoreJson: JSON.stringify(result), createdAt: new Date() },
      })
    } catch { /* ignore cache write errors */ }

    return result
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimit(session.user.id, 'scanner')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const { searchParams } = new URL(req.url)
  const force = searchParams.get('force') === '1'

  // ── Cache check — valid until midnight of the day it was generated ────────
  if (!force) {
    try {
      const cached = await prisma.aiScore.findUnique({
        where: { symbol_type: { symbol: 'FUNDAMENTAL_SCAN', type: 'universe_scan' } },
      })
      if (cached && isSameIlDay(cached.createdAt)) {
        return NextResponse.json({ ...JSON.parse(cached.scoreJson), cached: true })
      }
    } catch { /* re-compute on cache miss */ }
  }

  // ── Stage 1: batched quote() over the full S&P 500 ──────────────────────────
  const universe = [...US_UNIVERSE]
  const quoteChunks = chunk(universe, QUOTE_CHUNK_SIZE)
  const quoteResults = await Promise.allSettled(
    quoteChunks.map(syms => yahooFinance.quote(syms, {}, { validateResult: false }))
  )

  interface Coarse {
    price: number; marketCap: number | null; trailingPE: number | null
    companyName: string | null; firstTradeMs: number | null; nextEarningsMs: number | null
  }
  const coarse = new Map<string, Coarse>()
  for (const r of quoteResults) {
    if (r.status !== 'fulfilled') continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: any[] = Array.isArray(r.value) ? r.value : []
    for (const q of arr) {
      const price = q?.regularMarketPrice
      if (typeof price !== 'number' || !isFinite(price) || price <= 0) continue
      coarse.set(q.symbol, {
        price,
        marketCap: typeof q.marketCap === 'number' ? q.marketCap : null,
        trailingPE: typeof q.trailingPE === 'number' ? q.trailingPE : null,
        companyName: q.longName ?? q.shortName ?? null,
        firstTradeMs: typeof q.firstTradeDateMilliseconds === 'number' ? q.firstTradeDateMilliseconds : null,
        nextEarningsMs: typeof q.earningsTimestampStart === 'number' ? q.earningsTimestampStart * 1000 : null,
      })
    }
  }

  // ── Stage 2: per-ticker growth / sector / FCF via quoteSummary ──────────────
  const targets = [...coarse.keys()]
  const summarySettled = await runBatched(targets, SUMMARY_BATCH_SIZE, async (sym) => {
    const s = await yahooFinance.quoteSummary(
      sym,
      { modules: ['financialData', 'defaultKeyStatistics', 'assetProfile'] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { validateResult: false } as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any
    const fd = s?.financialData ?? {}
    const ks = s?.defaultKeyStatistics ?? {}
    const ap = s?.assetProfile ?? {}
    return {
      sym,
      revenueGrowth: typeof fd.revenueGrowth === 'number' ? fd.revenueGrowth : null,
      // Yahoo's own "earningsQuarterlyGrowth" compares a quarter to the same
      // quarter a year ago (YoY-by-quarter), not the prior sequential
      // quarter — it's the closest available proxy for "EPS growth QoQ".
      epsGrowthQuarterly: typeof ks.earningsQuarterlyGrowth === 'number' ? ks.earningsQuarterlyGrowth : null,
      freeCashflow: typeof fd.freeCashflow === 'number' ? fd.freeCashflow : null,
      sector: typeof ap.sector === 'string' ? ap.sector : null,
      industry: typeof ap.industry === 'string' ? ap.industry : null,
    }
  })

  const now = Date.now()
  const rows: FundamentalScanRow[] = []
  for (const r of summarySettled) {
    if (r.status !== 'fulfilled') continue
    const { sym, revenueGrowth, epsGrowthQuarterly, freeCashflow, sector, industry } = r.value
    const c = coarse.get(sym)
    if (!c) continue

    const epsGrowthQoQPct = epsGrowthQuarterly != null ? epsGrowthQuarterly * 100 : null
    const revenueGrowthYoYPct = revenueGrowth != null ? revenueGrowth * 100 : null
    const hype = isHypeSector(sector, industry)
    const ipoYear = c.firstTradeMs != null ? new Date(c.firstTradeMs).getUTCFullYear() : null
    const isRecentIPO = c.firstTradeMs != null && (now - c.firstTradeMs) < 2 * 365.25 * 86_400_000
    const nextEarningsDate = c.nextEarningsMs != null ? new Date(c.nextEarningsMs).toISOString().slice(0, 10) : null
    const earningsSoon = c.nextEarningsMs != null
      && (c.nextEarningsMs - now) <= 14 * 86_400_000 && (c.nextEarningsMs - now) >= 0
    const fcfPositive = freeCashflow != null ? freeCashflow > 0 : null
    const peReasonable = c.trailingPE != null && c.trailingPE > 0 && c.trailingPE <= 100

    const base = {
      epsGrowthQoQPct, revenueGrowthYoYPct, isHypeSector: hype,
      isRecentIPO, earningsSoon, fcfPositive, peReasonable,
    }
    const baseScore = computeBaseScore(base)

    rows.push({
      symbol: sym,
      companyName: c.companyName,
      sector,
      price: c.price,
      marketCap: c.marketCap,
      epsGrowthQoQPct: epsGrowthQoQPct != null ? parseFloat(epsGrowthQoQPct.toFixed(1)) : null,
      revenueGrowthYoYPct: revenueGrowthYoYPct != null ? parseFloat(revenueGrowthYoYPct.toFixed(1)) : null,
      isHypeSector: hype,
      isRecentIPO, ipoYear,
      earningsSoon, nextEarningsDate,
      fcfPositive,
      trailingPE: c.trailingPE,
      peReasonable,
      baseScore, score: baseScore,
      aiReasoning: null,
      aiScored: false,
    })
  }

  // ── Basic pre-filter (EPS/Revenue growth) — only survivors are worth an
  // expensive Google-Search-grounded AI call ──────────────────────────────────
  const filtered = rows.filter(r =>
    r.epsGrowthQoQPct != null && r.epsGrowthQoQPct >= MIN_EPS_GROWTH_QOQ_PCT &&
    r.revenueGrowthYoYPct != null && r.revenueGrowthYoYPct >= MIN_REVENUE_GROWTH_YOY_PCT
  )

  // ── Take the top N by deterministic score, then AI-score only those ────────
  const topCandidates = filtered
    .sort((a, b) => b.baseScore - a.baseScore)
    .slice(0, TOP_N)

  const aiSettled = await runBatched(topCandidates, AI_BATCH_SIZE, async (row) => {
    const ai = await fetchAiScore(row)
    return { symbol: row.symbol, ai }
  })
  const aiBySymbol = new Map<string, { score: number; reasoning: string } | null>()
  for (const r of aiSettled) {
    if (r.status === 'fulfilled') aiBySymbol.set(r.value.symbol, r.value.ai)
  }

  const finalRows = topCandidates.map(row => {
    const ai = aiBySymbol.get(row.symbol)
    if (ai) {
      return { ...row, score: ai.score, aiReasoning: ai.reasoning, aiScored: true }
    }
    return { ...row, aiReasoning: 'ניתוח AI לא זמין כרגע — מוצג ציון מבוסס נתונים בלבד', aiScored: false }
  }).sort((a, b) => b.score - a.score)

  const result = {
    results: finalRows,
    scannedCount: universe.length,
    filteredCount: filtered.length,
    generatedAt: new Date().toISOString(),
  }

  try {
    await prisma.aiScore.upsert({
      where:  { symbol_type: { symbol: 'FUNDAMENTAL_SCAN', type: 'universe_scan' } },
      create: { symbol: 'FUNDAMENTAL_SCAN', type: 'universe_scan', scoreJson: JSON.stringify(result) },
      update: { scoreJson: JSON.stringify(result), createdAt: new Date() },
    })
  } catch { /* ignore cache write errors */ }

  return NextResponse.json({ ...result, cached: false })
}
