import { NextResponse } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { yahooFinance } from '@/lib/yahoo-finance'
import { anthropic, ANTHROPIC_MODEL, extractJson } from '@/lib/anthropic'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { tickerSchema, validationError } from '@/lib/schemas'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

const CACHE_TTL = 15 * 60 * 1000 // 15 minutes

const PATTERNS = ['bull_flag', 'cup_handle', 'head_shoulders', 'triangle', 'breakout', 'none'] as const
const PATTERN_LABELS: Record<(typeof PATTERNS)[number], string> = {
  bull_flag: 'דגל עולה',
  cup_handle: 'כוס וידית',
  head_shoulders: 'ראש וכתפיים',
  triangle: 'משולש',
  breakout: 'פריצת התנגדות',
  none: 'ללא תבנית ברורה',
}

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimit(session.user.id, 'ai')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const { ticker: rawTicker } = await params
  const tickerResult = tickerSchema.safeParse(rawTicker)
  if (!tickerResult.success) {
    return NextResponse.json(validationError(tickerResult.error), { status: 400 })
  }
  const sym = tickerResult.data

  // ── 15-minute cache check ─────────────────────────────────────────────────
  try {
    const cached = await prisma.aiScore.findUnique({
      where: { symbol_type: { symbol: sym, type: 'swing_pattern' } },
    })
    if (cached && Date.now() - cached.createdAt.getTime() < CACHE_TTL) {
      return NextResponse.json(JSON.parse(cached.scoreJson))
    }
  } catch { /* re-compute on cache miss */ }

  // ── Fetch quote + ~6 months history ───────────────────────────────────────
  const period1 = new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0]

  const [quoteRes, histRes] = await Promise.allSettled([
    yahooFinance.quote(sym, {}, { validateResult: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yahooFinance.chart(sym, { period1, interval: '1d' }, { validateResult: false }) as Promise<any>,
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quote: any = quoteRes.status === 'fulfilled' ? quoteRes.value : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const histRaw: any[] = histRes.status === 'fulfilled' ? (histRes.value as any)?.quotes ?? [] : []

  if (!quote || histRaw.length < 30) {
    return NextResponse.json({ error: 'אין מספיק נתונים היסטוריים לניתוח תבניות' }, { status: 422 })
  }

  const closes: number[] = histRaw
    .filter((q) => typeof q.close === 'number' && isFinite(q.close))
    .map((q) => q.close)
  const volumes: number[] = histRaw
    .filter((q) => typeof q.volume === 'number' && isFinite(q.volume))
    .map((q) => q.volume)

  const curPrice: number = quote.regularMarketPrice ?? (closes.at(-1) ?? 0)
  const sma20 = sma(closes, 20)
  const sma50 = sma(closes, 50)
  const sma200 = sma(closes, 200)
  const rsiVal = rsi14(closes)
  const avgVol20 = volumes.length >= 20 ? volumes.slice(-20).reduce((s, v) => s + v, 0) / 20 : null
  const lastVol = volumes.at(-1) ?? null

  // Sample last ~60 trading days of closes (thin out if longer) for pattern shape
  const recentCloses = closes.slice(-60)
  const closesStr = recentCloses.map(c => c.toFixed(2)).join(',')

  const f = (v: number | null) => v != null ? v.toFixed(2) : 'N/A'

  const prompt = `החזר JSON בלבד. אסור טקסט לפני או אחרי. אסור markdown. אסור backticks.

You are a technical swing-trading analyst. Based ONLY on the price series and indicators below, identify the SINGLE most likely chart pattern for ${sym} from this exact list:
- "bull_flag" (דגל עולה)
- "cup_handle" (כוס וידית)
- "head_shoulders" (ראש וכתפיים)
- "triangle" (משולש - עולה או יורד)
- "breakout" (פריצת התנגדות)
- "none" (אין תבנית ברורה)

DATA (last ${recentCloses.length} daily closes, oldest→newest, comma-separated):
${closesStr}

CURRENT MARKET DATA:
current_price=${f(curPrice)}
SMA_20=${f(sma20)} | SMA_50=${f(sma50)} | SMA_200=${f(sma200)}
RSI_14=${rsiVal != null ? rsiVal.toFixed(1) : 'N/A'}
avg_volume_20d=${avgVol20 != null ? Math.round(avgVol20) : 'N/A'} | last_volume=${lastVol ?? 'N/A'}

IRON RULE — MINIMUM RISK/REWARD: if pattern is not "none", target MUST be at least 1.5× the risk from entry.
If no realistic target meets this rule, WIDEN the stop OR move entry closer until R:R ≥ 1:1.5.

INSTRUCTIONS:
- pattern: one of the exact keys above
- confidence: integer 0-100, how confident you are in the identification
- entry: logical entry price near current price or breakout level (0 if pattern is "none")
- stop: logical stop-loss price below support/pattern low (0 if pattern is "none")
- target: price target based on pattern measured move or resistance (0 if pattern is "none")
- riskReward: "1:X" where X = (target − entry) / (entry − stop), rounded to 1 decimal (or "—" if pattern is "none")
- expectedDays: integer, typical number of trading days for this swing to play out (0 if pattern is "none")
- reasoning: ONE Hebrew sentence ≤ 20 words explaining the identification

REQUIRED JSON:
{"pattern":"bull_flag","confidence":0,"entry":0,"stop":0,"target":0,"riskReward":"1:2.0","expectedDays":0,"reasoning":"הסבר בעברית"}`

  // ── Call Anthropic ─────────────────────────────────────────────────────────
  let aiData: Record<string, unknown>
  try {
    const res = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: 'You are a JSON-only API. Output valid JSON and nothing else.',
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: prompt }],
    })
    const textBlock = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    aiData = extractJson(textBlock?.text ?? '') as Record<string, unknown>
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 429) {
      return NextResponse.json({ error: 'הגעת למגבלת השימוש היומית של AI. נסי שוב מחר.', rateLimited: true }, { status: 429 })
    }
    console.error('[swing-analysis] Anthropic error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'שגיאת AI — נסה שוב מאוחר יותר' }, { status: 503 })
  }

  // ── Validate ───────────────────────────────────────────────────────────────
  const patternKey = PATTERNS.includes(aiData.pattern as (typeof PATTERNS)[number])
    ? (aiData.pattern as (typeof PATTERNS)[number])
    : 'none'
  const confidence = typeof aiData.confidence === 'number' ? Math.max(0, Math.min(100, aiData.confidence)) : 0

  let entry  = typeof aiData.entry  === 'number' && isFinite(aiData.entry)  ? aiData.entry  : 0
  let stop   = typeof aiData.stop   === 'number' && isFinite(aiData.stop)   ? aiData.stop   : 0
  let target = typeof aiData.target === 'number' && isFinite(aiData.target) ? aiData.target : 0
  const expectedDays = typeof aiData.expectedDays === 'number' && isFinite(aiData.expectedDays) ? Math.round(aiData.expectedDays) : 0

  let rrString = '—'
  if (patternKey !== 'none' && entry > 0 && stop > 0 && target > 0) {
    const risk = Math.abs(entry - stop)
    let reward = Math.abs(target - entry)
    let rr = risk > 0 ? reward / risk : 0
    if (rr < 1.4 && risk > 0) {
      const dir = target > entry ? 1 : -1
      target = entry + dir * risk * 1.8
      reward = Math.abs(target - entry)
      rr = reward / risk
    }
    rrString = `1:${rr.toFixed(1)}`
  } else {
    entry = 0; stop = 0; target = 0
  }

  const result = {
    symbol: sym,
    pattern: patternKey,
    patternLabel: PATTERN_LABELS[patternKey],
    confidence,
    entry, stop, target,
    riskReward: rrString,
    expectedDays,
    reasoning: typeof aiData.reasoning === 'string' ? aiData.reasoning : '',
    context: { curPrice, sma20, sma50, sma200, rsi: rsiVal != null ? parseFloat(rsiVal.toFixed(1)) : null },
  }

  try {
    await prisma.aiScore.upsert({
      where:  { symbol_type: { symbol: sym, type: 'swing_pattern' } },
      create: { symbol: sym, type: 'swing_pattern', scoreJson: JSON.stringify(result) },
      update: { scoreJson: JSON.stringify(result), createdAt: new Date() },
    })
  } catch { /* ignore cache write errors */ }

  return NextResponse.json(result)
}
