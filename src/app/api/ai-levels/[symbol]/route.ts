import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { yahooFinance } from '@/lib/yahoo-finance'
import { gemini, GEMINI_MODEL } from '@/lib/gemini'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

// ─── Indicator helpers ────────────────────────────────────────────────────────

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null
  return closes.slice(-period).reduce((s, v) => s + v, 0) / period
}

function rsi14(closes: number[]): number | null {
  if (closes.length < 15) return null
  const diffs = closes.slice(1).map((v, i) => v - closes[i])
  const recent = diffs.slice(-14)
  let ag = 0, al = 0
  for (const d of recent) { ag += d > 0 ? d : 0; al += d < 0 ? -d : 0 }
  ag /= 14; al /= 14
  if (al === 0) return 100
  return 100 - 100 / (1 + ag / al)
}

function localExtremes(closes: number[], lookback = 20): { support: number | null; resistance: number | null } {
  const slice = closes.slice(-lookback)
  if (slice.length === 0) return { support: null, resistance: null }
  return {
    support:    Math.min(...slice),
    resistance: Math.max(...slice),
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimit(session.user.id, 'ai')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const { symbol: rawSym } = await params
  const sym = rawSym.toUpperCase()

  // ── Fetch quote + 200-day history in parallel ─────────────────────────────
  const period1 = new Date(Date.now() - 210 * 86400000).toISOString().split('T')[0]

  const [quoteRes, histRes, levelsRes] = await Promise.allSettled([
    yahooFinance.quote(sym, {}, { validateResult: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yahooFinance.chart(sym, { period1, interval: '1d' }, { validateResult: false }) as Promise<any>,
    prisma.chartLevel.findMany({
      where: { userId: session.user.id, symbol: sym },
    }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quote: any = quoteRes.status === 'fulfilled' ? quoteRes.value : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const histRaw    = histRes.status  === 'fulfilled' ? (histRes.value as any)?.quotes ?? [] : []
  const dbLevels   = levelsRes.status === 'fulfilled' ? levelsRes.value : []

  if (!quote) {
    return NextResponse.json({ error: 'לא נמצאו נתוני מחיר לסימבול זה' }, { status: 422 })
  }

  const closes: number[] = histRaw
    .filter((q: { close?: unknown }) => typeof q.close === 'number' && isFinite(q.close as number))
    .map((q: { close: number }) => q.close)

  const curPrice:  number = quote.regularMarketPrice ?? (closes.at(-1) ?? 0)
  const week52High: number | null = quote.fiftyTwoWeekHigh  ?? null
  const week52Low:  number | null = quote.fiftyTwoWeekLow   ?? null

  const sma20  = sma(closes, 20)
  const sma50  = sma(closes, 50)
  const sma200 = sma(closes, 200)
  const rsiVal = rsi14(closes)
  const { support, resistance } = localExtremes(closes, 20)

  // Existing user levels
  const existingEntry  = dbLevels.find(l => l.type === 'entry')?.price  ?? null
  const existingStop   = dbLevels.find(l => l.type === 'stop')?.price   ?? null
  const existingTarget = dbLevels.find(l => l.type === 'target')?.price ?? null

  const f = (v: number | null) => v != null ? v.toFixed(2) : 'N/A'

  const prompt = `החזר JSON בלבד. אסור טקסט לפני או אחרי. אסור markdown. אסור backticks.

You are a technical analyst. Based ONLY on the market data below, recommend trade levels for ${sym}.
Do NOT invent news, events, or fundamental reasons. Use ONLY the provided technical indicators.

IRON RULE — MINIMUM RISK/REWARD: target1 MUST be at least 2× the risk from entry.
Example: entry=100, stop=97 → risk=3 → target1 must be ≥ 106 (reward ≥ 6, R:R ≥ 1:2).
If no realistic target meets this rule, WIDEN the stop OR move entry closer until R:R ≥ 1:2.
NEVER return R:R below 1:2. This is non-negotiable.

CURRENT MARKET DATA:
symbol=${sym}
current_price=${f(curPrice)}
52w_high=${f(week52High)} | 52w_low=${f(week52Low)}
SMA_20=${f(sma20)} | SMA_50=${f(sma50)} | SMA_200=${f(sma200)}
RSI_14=${rsiVal != null ? rsiVal.toFixed(1) : 'N/A'}
local_resistance_20d=${f(resistance)} | local_support_20d=${f(support)}
${existingEntry || existingStop || existingTarget ? `\nEXISTING USER LEVELS (context only):\nentry=${f(existingEntry)} | stop=${f(existingStop)} | target=${f(existingTarget)}` : ''}

INSTRUCTIONS:
- entry: logical entry near current price or at a support/MA level
- stop: below nearest support or MA — short Hebrew reason
- target1: MUST satisfy (target1 − entry) ≥ 2 × (entry − stop). Near resistance or previous high.
- target2: more ambitious second target, further from entry
- riskReward: "1:X" where X = (target1 − entry) / (entry − stop), rounded to 1 decimal. Must be ≥ 2.0.
- All prices as numbers. All reason fields: ONE Hebrew sentence ≤ 12 words.

REQUIRED JSON:
{"entry":0,"stop":0,"target1":0,"target2":0,"riskReward":"1:2.0","stopReason":"הסבר בעברית","entryReason":"הסבר בעברית","targetReason":"הסבר בעברית"}`

  // ── Call Gemini ───────────────────────────────────────────────────────────
  let aiData: Record<string, unknown>
  try {
    const res = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: 'You are a JSON-only API. Output valid JSON and nothing else.',
        maxOutputTokens: 1000,
        responseMimeType: 'application/json',
        temperature: 0.2,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thinkingConfig: { thinkingBudget: 0 } as any,
      },
    })

    const raw = (res.text ?? '').trim()
    console.log(`[ai-levels] raw first 150: ${raw.slice(0, 150)}`)
    const clean = raw
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    try {
      aiData = JSON.parse(clean)
    } catch {
      const match = clean.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('no JSON in response')
      aiData = JSON.parse(match[0])
    }
  } catch (err) {
    console.error('[ai-levels] Gemini error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'שגיאת AI — נסה שוב מאוחר יותר' }, { status: 503 })
  }

  // ── Validate numbers ──────────────────────────────────────────────────────
  for (const field of ['entry', 'stop', 'target1', 'target2']) {
    if (typeof aiData[field] !== 'number' || !isFinite(aiData[field] as number) || (aiData[field] as number) <= 0) {
      return NextResponse.json({ error: 'AI החזיר נתונים לא תקינים — נסה שוב' }, { status: 503 })
    }
  }

  // ── Server-side R:R enforcement ────────────────────────────────────────────
  let entry   = aiData.entry   as number
  let stop    = aiData.stop    as number
  let target1 = aiData.target1 as number
  let target2 = aiData.target2 as number

  const risk   = Math.abs(entry - stop)
  const reward = Math.abs(target1 - entry)
  const rr     = risk > 0 ? reward / risk : 0

  if (rr < 1.8 && risk > 0) {
    const dir = target1 > entry ? 1 : -1
    const adjustedTarget1 = entry + dir * risk * 2.2
    const adjustedTarget2 = entry + dir * risk * 3.5
    console.log(`[ai-levels] R:R was ${rr.toFixed(2)} — auto-adjusted target1 from ${target1.toFixed(2)} to ${adjustedTarget1.toFixed(2)}`)
    target1 = adjustedTarget1
    target2 = adjustedTarget2
  }

  const finalRr   = risk > 0 ? Math.abs(target1 - entry) / risk : 0
  const rrString  = `1:${finalRr.toFixed(1)}`

  return NextResponse.json({
    symbol: sym,
    entry,
    stop,
    target1,
    target2,
    riskReward:   rrString,
    stopReason:   typeof aiData.stopReason   === 'string' ? aiData.stopReason   : '',
    entryReason:  typeof aiData.entryReason  === 'string' ? aiData.entryReason  : '',
    targetReason: typeof aiData.targetReason === 'string' ? aiData.targetReason : '',
    autoAdjusted: rr < 1.8,
    context: {
      curPrice, sma20, sma50, sma200,
      rsi: rsiVal != null ? parseFloat(rsiVal.toFixed(1)) : null,
      support, resistance,
    },
  })
}
