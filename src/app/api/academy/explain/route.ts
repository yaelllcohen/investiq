import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { gemini, GEMINI_MODEL } from '@/lib/gemini'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface ExplainItem {
  question: string
  options: string[]
  selectedIdx: number
  correctIdx: number
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimit(session.user.id, 'ai')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const body = await req.json() as { lessonTitle?: string; items?: ExplainItem[] }
  const { lessonTitle = '', items = [] } = body

  if (!items.length) return NextResponse.json({ explanations: [] })

  const questionsBlock = items.map((item, i) => {
    const isCorrect = item.selectedIdx === item.correctIdx
    return `שאלה ${i + 1}: ${item.question}
אפשרויות: ${item.options.join(' | ')}
תשובה שנבחרה: "${item.options[item.selectedIdx] ?? '?'}"
תשובה נכונה: "${item.options[item.correctIdx] ?? '?'}"
נכון? ${isCorrect ? 'כן' : 'לא'}`
  }).join('\n\n')

  const prompt = `אתה מדריך פיננסי. שיעור: "${lessonTitle}".
לכל שאלה כתוב בדיוק 2 משפטים בעברית פשוטה.
אם נכון — אשר ותסביר למה. אם שגוי — הסבר בעדינות מה הנכון ולמה.
החזר JSON בלבד ללא backticks.

${questionsBlock}

JSON: {"explanations":["הסבר שאלה 1","הסבר שאלה 2"]}`

  try {
    const res = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        maxOutputTokens: 1000,
        responseMimeType: 'application/json',
        temperature: 0.1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thinkingConfig: { thinkingBudget: 0 } as any,
      },
    })

    const raw = (res.text ?? '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
    const parsed = JSON.parse(raw) as { explanations: string[] }
    return NextResponse.json({ explanations: parsed.explanations ?? [] })
  } catch (err) {
    console.error('[academy/explain] error:', err instanceof Error ? err.message : err)
    return NextResponse.json({
      explanations: items.map(item =>
        item.selectedIdx === item.correctIdx
          ? 'נכון! כל הכבוד.'
          : `התשובה הנכונה היא: "${item.options[item.correctIdx] ?? '?'}".`
      ),
    })
  }
}
