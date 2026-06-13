import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { gemini, GEMINI_MODEL, FINANCIAL_ADVISOR_SYSTEM_PROMPT } from '@/lib/gemini'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmotionStat {
  emotion:     string
  count:       number
  successRate: number | null
}

interface Pattern {
  type:     string
  message:  string
  severity: 'warning' | 'danger' | 'info'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pl(closePrice: number, entryPrice: number, action: string): number {
  return (closePrice - entryPrice) / entryPrice * 100 * (action === 'buy' ? 1 : -1)
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const withAI = searchParams.get('ai') === 'true'

  const entries = await prisma.journalEntry.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  if (entries.length === 0) {
    return NextResponse.json({
      totalEntries: 0, closedEntries: 0,
      disciplineScore: 0,
      disciplineBreakdown: { documentationRate: 0, riskRate: 0, planAdherence: 0 },
      emotionStats: [], overallSuccessRate: null,
      patterns: [], aiInsights: null,
    })
  }

  // ── Closed entries ───────────────────────────────────────────────────────
  const closed = entries.filter((e) => e.status === 'closed' && e.closePrice != null)

  // ── Discipline score ─────────────────────────────────────────────────────
  const docRate       = entries.filter((e) => e.thesis.length > 20).length / entries.length
  const riskRate      = entries.filter((e) => e.risk.length > 10).length  / entries.length
  const planAdherence = closed.length > 0
    ? closed.filter((e) => pl(e.closePrice!, e.price, e.action) > 0).length / closed.length
    : 0.5

  const disciplineScore = Math.round((docRate * 0.25 + riskRate * 0.25 + planAdherence * 0.5) * 100)

  // ── Overall success rate ─────────────────────────────────────────────────
  const wins = closed.filter((e) => pl(e.closePrice!, e.price, e.action) > 0)
  const overallSuccessRate = closed.length > 0
    ? Math.round((wins.length / closed.length) * 100)
    : null

  // ── Emotion stats ────────────────────────────────────────────────────────
  const EMOTIONS = ['planned', 'FOMO', 'panic', 'other']
  const emotionStats: EmotionStat[] = EMOTIONS.map((emotion) => {
    const group       = entries.filter((e) => e.emotionTag === emotion)
    const groupClosed = group.filter((e) => e.status === 'closed' && e.closePrice != null)
    const groupWins   = groupClosed.filter((e) => pl(e.closePrice!, e.price, e.action) > 0)
    return {
      emotion,
      count:       group.length,
      successRate: groupClosed.length > 0
        ? Math.round((groupWins.length / groupClosed.length) * 100)
        : null,
    }
  }).filter((e) => e.count > 0)

  // ── Best emotion ─────────────────────────────────────────────────────────
  const bestEmotion = emotionStats
    .filter((e) => e.successRate != null)
    .sort((a, b) => (b.successRate ?? 0) - (a.successRate ?? 0))[0]?.emotion ?? null

  // ── Pattern alerts ───────────────────────────────────────────────────────
  const patterns: Pattern[] = []

  // FOMO streak (most recent entries)
  let fomoStreak = 0
  for (const e of entries) { // already sorted desc
    if (e.emotionTag === 'FOMO') fomoStreak++
    else break
  }
  if (fomoStreak >= 3) {
    patterns.push({
      type: 'fomo_streak',
      message: `${fomoStreak} עסקאות FOMO ברצף — שים לב לדפוס הזה`,
      severity: 'warning',
    })
  }

  // Panic sells
  const panicSells = entries.filter((e) => e.emotionTag === 'panic' && e.action === 'sell')
  if (panicSells.length >= 2) {
    patterns.push({
      type: 'panic_sell',
      message: `מכרת ${panicSells.length} פעמים מפאניקה — האם אתה מוכר מפחד?`,
      severity: 'warning',
    })
  }

  // Consecutive loss streak (closed entries)
  let lossStreak = 0
  for (const e of closed) { // sorted desc
    if (pl(e.closePrice!, e.price, e.action) < 0) lossStreak++
    else break
  }
  if (lossStreak >= 3) {
    patterns.push({
      type: 'loss_streak',
      message: `${lossStreak} עסקאות מפסידות ברצף — שקול להקטין גודל פוזיציות`,
      severity: 'danger',
    })
  }

  // Selling after every dip (2+ closed sells with loss where emotionTag !== planned)
  const panicClosedSells = closed.filter(
    (e) => e.action === 'sell' && pl(e.closePrice!, e.price, e.action) < 0 && e.emotionTag !== 'planned'
  )
  if (panicClosedSells.length >= 2) {
    patterns.push({
      type: 'sell_dip',
      message: `מכרת ב-${panicClosedSells.length} ירידות — מכירה לא מתוכננת נגד התוכנית`,
      severity: 'info',
    })
  }

  // ── AI Insights ──────────────────────────────────────────────────────────
  let aiInsights = null
  if (withAI && entries.length >= 3) {
    const rl = await rateLimit(userId, 'ai')
    if (rl.success) {
      try {
        const emotionSummary = emotionStats
          .map((e) => `${e.emotion}: ${e.count} עסקאות, הצלחה: ${e.successRate ?? 'אין נתון'}%`)
          .join(' | ')

        const recentTickers = entries.slice(0, 10)
          .map((e) => `${e.ticker}(${e.action},${e.emotionTag})`)
          .join(', ')

        const prompt = `נתוני המשתמש:
- סך עסקאות: ${entries.length} | סגורות: ${closed.length} | הצלחה: ${overallSuccessRate ?? 'אין'}%
- ציון משמעת: ${disciplineScore}/100
- רגשות: ${emotionSummary}
- דפוסים: ${patterns.map((p) => p.message).join(' | ') || 'ללא'}
- עסקאות אחרונות: ${recentTickers}

ספק תובנות פסיכולוגיות בדיוק בפורמט JSON:
{
  "commonMistake": "משפט אחד — הטעות הנפוצה ביותר שלך היא...",
  "fomoPattern": "משפט אחד — כשאתה מחליט מ-FOMO...",
  "bestPattern": "משפט אחד — הדפוס הכי מוצלח שלך הוא...",
  "tip": "טיפ מעשי אחד לשיפור מיידי"
}`

        const controller = new AbortController()
        const to = setTimeout(() => controller.abort(), 25_000)
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
        if (m) aiInsights = JSON.parse(m[0])
        else if (text.trim().startsWith('{')) aiInsights = JSON.parse(text.trim())
      } catch (err) {
        console.error('[psychology] AI error:', err instanceof Error ? err.message : err)
      }
    }
  }

  return NextResponse.json({
    totalEntries: entries.length,
    closedEntries: closed.length,
    disciplineScore,
    disciplineBreakdown: {
      documentationRate: Math.round(docRate      * 100),
      riskRate:          Math.round(riskRate      * 100),
      planAdherence:     Math.round(planAdherence * 100),
    },
    emotionStats,
    bestEmotion,
    overallSuccessRate,
    patterns,
    aiInsights,
  })
}
