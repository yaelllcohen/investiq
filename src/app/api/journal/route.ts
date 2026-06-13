import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { gemini, GEMINI_MODEL, FINANCIAL_ADVISOR_SYSTEM_PROMPT } from '@/lib/gemini'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { z } from 'zod'
import { validationError } from '@/lib/schemas'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const entrySchema = z.object({
  ticker:     z.string().min(1).max(15).trim().toUpperCase(),
  action:     z.enum(['buy', 'sell']),
  price:      z.number().positive(),
  thesis:     z.string().min(1).max(2000).trim(),
  risk:       z.string().min(1).max(1000).trim(),
  target:     z.number().positive(),
  reviewDate: z.string().datetime({ offset: true }).or(z.string().date()),
  emotionTag: z.enum(['FOMO', 'panic', 'planned', 'other']),
  currency:   z.enum(['USD', 'ILS', 'EUR']).default('USD'),
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const withAnalysis = searchParams.get('analysis') === 'true'

  const entries = await prisma.journalEntry.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  if (!withAnalysis || entries.length < 3) {
    return NextResponse.json({ entries, analysis: null })
  }

  const rl = await rateLimit(userId, 'ai')
  if (!rl.success) return NextResponse.json({ entries, analysis: null })

  // ── AI analysis ───────────────────────────────────────────────────────────
  const closed = entries.filter((e) => e.status === 'closed' && e.closePrice != null)
  const summary = entries.map((e) => {
    const pl = e.closePrice != null
      ? ((e.closePrice - e.price) / e.price * 100 * (e.action === 'buy' ? 1 : -1)).toFixed(1) + '%'
      : 'פתוח'
    const replay = e.status === 'closed'
      ? ` | פעל לפי תוכנית: ${e.followedPlan === true ? 'כן' : e.followedPlan === false ? 'לא' : 'לא צוין'} | הזיז סטופ: ${e.movedStop ?? 'לא צוין'} | סיבת יציאה: ${e.exitReason ?? 'לא צוין'}`
      : ''
    return `${e.ticker} | ${e.action} | רגש: ${e.emotionTag} | תזה: ${e.thesis.slice(0, 80)} | תוצאה: ${pl}${replay}`
  }).join('\n')

  const prompt = `להלן ${entries.length} החלטות השקעה של המשתמש (${closed.length} סגורות):
${summary}

נתח והחזר JSON בדיוק כך:
{
  "successRate": 72,
  "commonMistake": "משפט קצר על הטעות הנפוצה ביותר",
  "worstEmotion": "FOMO",
  "worstEmotionReason": "משפט קצר",
  "tip": "טיפ אחד מעשי לשיפור",
  "costliestMistake": "משפט אחד — הטעות שעולה למשתמש הכי הרבה כסף (לפי דפוסי הסגירה)"
}`

  let analysis = null
  try {
    const controller = new AbortController()
    const to = setTimeout(() => controller.abort(), 20_000)
    const res = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: FINANCIAL_ADVISOR_SYSTEM_PROMPT,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
      },
    })
    clearTimeout(to)
    const text = res.text ?? ''
    const m = text.match(/\{[\s\S]*\}/)
    if (m) analysis = JSON.parse(m[0])
    else if (text.trim().startsWith('{')) analysis = JSON.parse(text.trim())
  } catch (err) {
    console.error('[journal/analysis] AI error:', err instanceof Error ? err.message : err)
  }

  return NextResponse.json({ entries, analysis })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 })
  }

  const parsed = entrySchema.safeParse(body)
  if (!parsed.success) {
    console.error('[journal] validation:', JSON.stringify(parsed.error.flatten()))
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }

  const { ticker, action, price, thesis, risk, target, reviewDate, emotionTag, currency } = parsed.data

  const entry = await prisma.journalEntry.create({
    data: {
      userId, ticker, action, price, thesis, risk,
      target, reviewDate: new Date(reviewDate),
      emotionTag, currency, status: 'open',
    },
  })
  return NextResponse.json(entry)
}
