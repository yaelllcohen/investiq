import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { gemini, GEMINI_MODEL, FINANCIAL_ADVISOR_SYSTEM_PROMPT } from '@/lib/gemini'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { z } from 'zod'
import { validationError } from '@/lib/schemas'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const tradeCoachSchema = z.object({
  ticker:        z.string().min(1).max(15).trim().toUpperCase(),
  entryPrice:    z.number().positive(),
  stopLoss:      z.number().positive(),
  target:        z.number().positive(),
  portfolioSize: z.number().positive(),
  riskPercent:   z.number().positive().max(100),
  currency:      z.enum(['USD', 'ILS', 'EUR']).default('USD'),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const decisions = await prisma.tradeDecision.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json(decisions)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const rl = await rateLimit(userId, 'ai')
  if (!rl.success) return rateLimitResponse(rl.reset)

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 })
  }

  const parsed = tradeCoachSchema.safeParse(body)
  if (!parsed.success) {
    console.error('[trade-coach] validation:', JSON.stringify(parsed.error.flatten()))
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }

  const { ticker, entryPrice, stopLoss, target, portfolioSize, riskPercent, currency } = parsed.data

  // ── Calculations ────────────────────────────────────────────────────────────
  const riskPerShare  = entryPrice - stopLoss
  const rewardPerShare = target - entryPrice
  const rrRatio       = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0
  const maxRiskAmount = portfolioSize * (riskPercent / 100)
  const shares        = riskPerShare > 0 ? maxRiskAmount / riskPerShare : 0
  const positionSize  = shares * entryPrice
  const positionPct   = portfolioSize > 0 ? (positionSize / portfolioSize) * 100 : 0

  // ── Checks ──────────────────────────────────────────────────────────────────
  const checkSetup    = stopLoss < entryPrice && entryPrice < target
  const checkRR       = rrRatio >= 2
  const checkRisk     = riskPercent <= 5
  const checkPosition = positionPct <= 25
  const passed = checkSetup && checkRR && checkRisk && checkPosition

  // ── AI summary ──────────────────────────────────────────────────────────────
  const prompt = `אתה מאמן ניהול סיכונים. נתח את הפרמטרים הבאים של עסקה מתוכננת ב-${ticker} ותן סיכום קצר (3-4 משפטים) בעברית:

מחיר כניסה: ${entryPrice}
סטופ לוס: ${stopLoss}
יעד: ${target}
יחס סיכון/סיכוי: 1:${rrRatio.toFixed(2)}
גודל פוזיציה: ${positionSize.toFixed(0)} (${positionPct.toFixed(1)}% מהתיק)
סיכון בעסקה: ${riskPercent}% מהתיק (${maxRiskAmount.toFixed(0)})

בדיקות:
- הגדרת עסקה תקינה (SL < כניסה < יעד): ${checkSetup ? '✅' : '❌'}
- יחס R:R מינימום 1:2: ${checkRR ? '✅' : '❌'} (בפועל 1:${rrRatio.toFixed(2)})
- סיכון ≤ 5% מהתיק: ${checkRisk ? '✅' : '❌'} (${riskPercent}%)
- פוזיציה ≤ 25% מהתיק: ${checkPosition ? '✅' : '❌'} (${positionPct.toFixed(1)}%)

ציין מה טוב, מה צריך תיקון, ומה המלצתך. אל תעלה על 4 משפטים.`

  let aiSummary = ''
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25_000)
    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: FINANCIAL_ADVISOR_SYSTEM_PROMPT,
        maxOutputTokens: 512,
      },
    })
    clearTimeout(timeout)
    aiSummary = response.text?.trim() ?? ''
  } catch (err) {
    console.error('[trade-coach] AI error:', err instanceof Error ? err.message : err)
    aiSummary = 'לא ניתן היה לקבל ניתוח AI כרגע.'
  }

  // ── Save to DB ───────────────────────────────────────────────────────────────
  const decision = await prisma.tradeDecision.create({
    data: {
      userId, ticker, entryPrice, stopLoss, target,
      portfolioSize, riskPercent, currency,
      rrRatio, positionSize, positionPct,
      passed, aiSummary,
    },
  })

  return NextResponse.json({
    ...decision,
    checks: { checkSetup, checkRR, checkRisk, checkPosition },
    maxRiskAmount,
    shares,
  })
}
