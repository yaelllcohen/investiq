import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { yahooFinance } from '@/lib/yahoo-finance'
import { gemini, GEMINI_MODEL } from '@/lib/gemini'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { tickerSchema, validationError } from '@/lib/schemas'
import { buildFundamentalAnalysis, FUNDAMENTAL_MODULES } from '@/lib/fundamentals'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

const CACHE_TTL = 15 * 60 * 1000 // 15 minutes
const OUTLOOKS = ['positive', 'negative', 'neutral'] as const
type Outlook = (typeof OUTLOOKS)[number]

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
      where: { symbol_type: { symbol: sym, type: 'fundamental_analysis' } },
    })
    if (cached && Date.now() - cached.createdAt.getTime() < CACHE_TTL) {
      return NextResponse.json(JSON.parse(cached.scoreJson))
    }
  } catch { /* re-compute on cache miss */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let summary: any = null
  try {
    summary = await yahooFinance.quoteSummary(
      sym,
      { modules: ['summaryDetail', ...FUNDAMENTAL_MODULES] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { validateResult: false } as any
    )
  } catch { /* handled below */ }

  if (!summary) {
    return NextResponse.json({ error: 'אין מספיק נתונים פונדמנטליים לניתוח' }, { status: 422 })
  }

  const { rows, facts, quarterlyEarnings, nextEarningsDate, earningsSoon } = buildFundamentalAnalysis(summary)

  const f = (v: number | null, suffix = '') => v != null ? `${v.toFixed(1)}${suffix}` : 'N/A'

  const prompt = `החזר JSON בלבד. אסור טקסט לפני או אחרי. אסור markdown. אסור backticks.

You are a fundamental equity analyst. Use Google Search to verify and enrich the data below for ${sym} — check for its latest earnings report, recent news, and current analyst estimates — then assess whether the company is fundamentally strengthening or weakening.

FUNDAMENTAL DATA (from Yahoo Finance, may be a few minutes to a few hours stale — prefer fresher data found via search when they conflict):
revenue_growth_yoy=${f(facts.revenueYoYPct, '%')} | revenue_growth_qoq=${f(facts.revenueQoQPct, '%')}
net_income_growth_yoy=${f(facts.netIncomeYoYPct, '%')}
trailing_eps=${f(facts.trailingEps)} | eps_surprise_last_quarter=${f(facts.epsSurprisePct, '%')}
gross_margin=${f(facts.grossMarginPct, '%')} | operating_margin=${f(facts.operatingMarginPct, '%')} | net_margin=${f(facts.netMarginPct, '%')}
free_cash_flow=${facts.freeCashflow ?? 'N/A'}
debt_to_equity=${f(facts.debtToEquity)}
analyst_buy=${facts.analystBuy ?? 'N/A'} | analyst_hold=${facts.analystHold ?? 'N/A'} | analyst_sell=${facts.analystSell ?? 'N/A'}
trailing_pe=${f(facts.trailingPE)} | forward_pe=${f(facts.forwardPE)}
next_quarter_earnings_growth_estimate=${f(facts.nextQuarterGrowthPct, '%')} | next_year_earnings_growth_estimate=${f(facts.nextYearGrowthPct, '%')}
shares_outstanding_trend=${facts.sharesTrend}
next_earnings_date=${nextEarningsDate ?? 'N/A'}
last_4_quarters=${JSON.stringify(quarterlyEarnings)}

INSTRUCTIONS:
- trend: "strengthening" or "weakening" or "mixed" — is the company fundamentally strengthening or weakening?
- risks: array of 2-4 short Hebrew strings (each under 15 words), the main fundamental risks (incorporate anything material you find via search — e.g. pending litigation, guidance cuts, competitive threats)
- outlook: one of "positive", "negative", "neutral"
- reasoning: AT MOST 3 short Hebrew sentences (under 60 words total) explaining the outlook — be concise, do not list every search finding
- score: integer 0-100, overall fundamental health score

REQUIRED JSON (output exactly this shape, nothing else):
{"trend":"strengthening","risks":["הסבר בעברית"],"outlook":"positive","reasoning":"הסבר בעברית","score":0}`

  // ── Call Gemini (Google Search grounding) ──────────────────────────────────
  // responseMimeType can't be combined with tool use, so JSON-only output is
  // enforced purely through the prompt instructions above (with a regex
  // fallback below in case the model still wraps it in prose/markdown).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let aiData: Record<string, any>
  try {
    const res = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: 'You are a JSON-only API. Output valid JSON and nothing else.',
        // Search-grounded thinking can otherwise consume the entire output
        // budget on invisible "thoughts" and leave nothing for the actual
        // JSON (finishReason MAX_TOKENS with empty text) — cap thinking and
        // give the total plenty of headroom so that can't happen.
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 1024 },
        temperature: 0.2,
        tools: [{ googleSearch: {} }],
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
    console.error('[fundamental-analysis] Gemini error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'שגיאת AI — נסה שוב מאוחר יותר' }, { status: 503 })
  }

  const outlook: Outlook = OUTLOOKS.includes(aiData.outlook) ? aiData.outlook : 'neutral'
  const trend = ['strengthening', 'weakening', 'mixed'].includes(aiData.trend) ? aiData.trend : 'mixed'
  const risks = Array.isArray(aiData.risks) ? aiData.risks.filter((r: unknown) => typeof r === 'string').slice(0, 4) : []
  const score = typeof aiData.score === 'number' ? Math.max(0, Math.min(100, Math.round(aiData.score))) : 0

  const result = {
    symbol: sym,
    rows,
    quarterlyEarnings,
    nextEarningsDate,
    earningsSoon,
    trend,
    risks,
    outlook,
    reasoning: typeof aiData.reasoning === 'string' ? aiData.reasoning : '',
    score,
  }

  try {
    await prisma.aiScore.upsert({
      where:  { symbol_type: { symbol: sym, type: 'fundamental_analysis' } },
      create: { symbol: sym, type: 'fundamental_analysis', scoreJson: JSON.stringify(result) },
      update: { scoreJson: JSON.stringify(result), createdAt: new Date() },
    })
  } catch { /* ignore cache write errors */ }

  return NextResponse.json(result)
}
