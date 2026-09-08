import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { yahooFinance } from '@/lib/yahoo-finance'
import { gemini, GEMINI_MODEL } from '@/lib/gemini'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

const CACHE_TTL = 15 * 60 * 1000 // 15 minutes
const DIRECTIONS = ['buy', 'sell', 'wait'] as const
type Direction = (typeof DIRECTIONS)[number]

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

  // ── 15-minute cache check ─────────────────────────────────────────────────
  try {
    const cached = await prisma.aiScore.findUnique({
      where: { symbol_type: { symbol: sym, type: 'ai_levels' } },
    })
    if (cached && Date.now() - cached.createdAt.getTime() < CACHE_TTL) {
      return NextResponse.json(JSON.parse(cached.scoreJson))
    }
  } catch { /* re-compute on cache miss */ }

  // ── Fetch quote + 200-day history ─────────────────────────────────────────
  const period1 = new Date(Date.now() - 210 * 86400000).toISOString().split('T')[0]

  const [quoteRes, histRes] = await Promise.allSettled([
    yahooFinance.quote(sym, {}, { validateResult: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yahooFinance.chart(sym, { period1, interval: '1d' }, { validateResult: false }) as Promise<any>,
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quote: any = quoteRes.status === 'fulfilled' ? quoteRes.value : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const histRaw = histRes.status === 'fulfilled' ? (histRes.value as any)?.quotes ?? [] : []

  if (!quote) {
    return NextResponse.json({ error: 'לא נמצאו נתוני מחיר לסימבול זה' }, { status: 422 })
  }

  const closes: number[] = histRaw
    .filter((q: { close?: unknown }) => typeof q.close === 'number' && isFinite(q.close as number))
    .map((q: { close: number }) => q.close)

  const curPrice: number = quote.regularMarketPrice ?? (closes.at(-1) ?? 0)
  const week52High: number | null = quote.fiftyTwoWeekHigh ?? null
  const week52Low: number | null = quote.fiftyTwoWeekLow ?? null

  const sma20  = sma(closes, 20)
  const sma50  = sma(closes, 50)
  const sma200 = sma(closes, 200)
  const rsiVal = rsi14(closes)
  const { support, resistance } = localExtremes(closes, 20)

  const f = (v: number | null) => v != null ? v.toFixed(2) : 'N/A'

  const prompt = `החזר JSON בלבד. אסור טקסט לפני או אחרי. אסור markdown. אסור backticks.

You are a technical analyst. Based ONLY on the market data below, decide whether ${sym} currently
presents a BUY setup, a SELL setup, or is a WAIT (no clear technical edge right now).
Do NOT invent news, events, or fundamental reasons. Use ONLY the provided technical indicators.

CURRENT MARKET DATA:
symbol=${sym}
current_price=${f(curPrice)}
52w_high=${f(week52High)} | 52w_low=${f(week52Low)}
SMA_20=${f(sma20)} | SMA_50=${f(sma50)} | SMA_200=${f(sma200)}
RSI_14=${rsiVal != null ? rsiVal.toFixed(1) : 'N/A'}
local_resistance_20d=${f(resistance)} | local_support_20d=${f(support)}

INSTRUCTIONS:
- direction: "buy" if trend/momentum favor a long entry, "sell" if they favor a short, "wait" if there's no clear edge
- If direction is "buy": entry near current price or a support/MA level; stop below nearest support/MA; target above, near resistance or a previous high
- If direction is "sell": entry near current price or a resistance/MA level; stop above nearest resistance/MA; target below, near support or a previous low
- If direction is "wait": set entry, stop, target all to 0
- IRON RULE (buy/sell only): target MUST be at least 2× the risk from entry. risk = |entry-stop|, reward = |target-entry|. If not, widen the stop or move entry until reward/risk ≥ 2. Never return R:R below 1:2 for a buy/sell call.
- riskReward: "1:X" (X = reward/risk, rounded to 1 decimal) for buy/sell, or "—" for wait
- reasoning: ONE Hebrew sentence ≤ 20 words explaining the call

REQUIRED JSON:
{"direction":"buy","entry":0,"stop":0,"target":0,"riskReward":"1:2.0","reasoning":"הסבר בעברית"}`

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
    const status = (err as { status?: number }).status
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
    if (status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('resource_exhausted')) {
      return NextResponse.json({ error: 'הגעת למגבלת השימוש היומית של AI. נסי שוב מחר.', rateLimited: true }, { status: 429 })
    }
    console.error('[ai-levels] Gemini error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'שגיאת AI — נסה שוב מאוחר יותר' }, { status: 503 })
  }

  // ── Validate ───────────────────────────────────────────────────────────────
  const direction: Direction = DIRECTIONS.includes(aiData.direction as Direction)
    ? (aiData.direction as Direction)
    : 'wait'

  let entry  = typeof aiData.entry  === 'number' && isFinite(aiData.entry)  ? aiData.entry  : 0
  let stop   = typeof aiData.stop   === 'number' && isFinite(aiData.stop)   ? aiData.stop   : 0
  let target = typeof aiData.target === 'number' && isFinite(aiData.target) ? aiData.target : 0

  let rrString = '—'
  if (direction !== 'wait' && entry > 0 && stop > 0 && target > 0) {
    const risk = Math.abs(entry - stop)
    let reward = Math.abs(target - entry)
    let rr = risk > 0 ? reward / risk : 0
    if (rr < 1.8 && risk > 0) {
      const dir = target > entry ? 1 : -1
      target = entry + dir * risk * 2.2
      reward = Math.abs(target - entry)
      rr = reward / risk
    }
    rrString = `1:${rr.toFixed(1)}`
  } else if (direction === 'wait') {
    entry = 0; stop = 0; target = 0
  } else {
    // buy/sell but AI returned invalid levels — fall back to wait rather than showing garbage
    return NextResponse.json({ error: 'AI החזיר נתונים לא תקינים — נסה שוב' }, { status: 503 })
  }

  const result = {
    symbol: sym,
    direction,
    entry, stop, target,
    riskReward: rrString,
    reasoning: typeof aiData.reasoning === 'string' ? aiData.reasoning : '',
    context: {
      curPrice, sma20, sma50, sma200,
      rsi: rsiVal != null ? parseFloat(rsiVal.toFixed(1)) : null,
      support, resistance,
    },
  }

  // ── Cache for 15 minutes ─────────────────────────────────────────────────
  try {
    await prisma.aiScore.upsert({
      where:  { symbol_type: { symbol: sym, type: 'ai_levels' } },
      create: { symbol: sym, type: 'ai_levels', scoreJson: JSON.stringify(result) },
      update: { scoreJson: JSON.stringify(result), createdAt: new Date() },
    })
  } catch { /* ignore cache write errors */ }

  return NextResponse.json(result)
}
