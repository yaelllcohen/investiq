import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { LESSONS, WEEKLY_CHALLENGES, type Lesson } from '@/lib/lessons'

export const dynamic = 'force-dynamic'

// ─── Trigger detection ────────────────────────────────────────────────────────

interface TriggerContext {
  has_etf: boolean
  has_crypto: boolean
  no_bonds: boolean
  has_single_stock_over_30: boolean
  etfTicker?: string
  cryptoTicker?: string
  concentratedTicker?: string
  concentratedPct?: number
}

function detectTriggers(holdings: { assetType: string; ticker: string; quantity: number; avgPrice: number }[]): TriggerContext {
  const hasEtf = holdings.some(h => h.assetType === 'etf')
  const hasCrypto = holdings.some(h => h.assetType === 'crypto')
  const noBonds = !holdings.some(h => h.assetType === 'bond')

  const totalValue = holdings.reduce((s, h) => s + h.quantity * h.avgPrice, 0)
  let concentratedTicker: string | undefined
  let concentratedPct: number | undefined
  if (totalValue > 0) {
    for (const h of holdings) {
      const pct = (h.quantity * h.avgPrice) / totalValue * 100
      if (h.assetType === 'stock' && pct > 30) {
        concentratedTicker = h.ticker
        concentratedPct = Math.round(pct)
        break
      }
    }
  }

  return {
    has_etf: hasEtf,
    has_crypto: hasCrypto,
    no_bonds: noBonds,
    has_single_stock_over_30: !!concentratedTicker,
    etfTicker: holdings.find(h => h.assetType === 'etf')?.ticker,
    cryptoTicker: holdings.find(h => h.assetType === 'crypto')?.ticker,
    concentratedTicker,
    concentratedPct,
  }
}

function matchesTrigger(lesson: Lesson, ctx: TriggerContext): boolean {
  if (lesson.trigger === 'always') return true
  return !!ctx[lesson.trigger]
}

function personalNote(lesson: Lesson, ctx: TriggerContext): string {
  if (lesson.trigger === 'has_etf' && ctx.etfTicker)
    return `יש לך ${ctx.etfTicker} בתיק — שיעור זה רלוונטי ישירות להחזקה שלך.`
  if (lesson.trigger === 'has_crypto' && ctx.cryptoTicker)
    return `יש לך ${ctx.cryptoTicker} בתיק — חשוב להבין תנודתיות קריפטו.`
  if (lesson.trigger === 'no_bonds')
    return 'אין אג"ח בתיק שלך — שיעור זה ישלים את הפיזור.'
  if (lesson.trigger === 'has_single_stock_over_30' && ctx.concentratedTicker)
    return `${ctx.concentratedTicker} מהווה ~${ctx.concentratedPct}% מהתיק שלך — שיעור על ריכוזיות.`
  return ''
}

// ─── Weekly challenge check ───────────────────────────────────────────────────

async function checkChallenge(userId: string, challengeIdx: number) {
  const ch = WEEKLY_CHALLENGES[challengeIdx]
  if (!ch) return { challenge: WEEKLY_CHALLENGES[0], progress: '0', completed: false }

  if (ch.type === 'holdings_count') {
    const vp = await prisma.virtualPortfolio.findUnique({ where: { userId } })
    const holdings: unknown[] = JSON.parse(vp?.holdings ?? '[]')
    const count = holdings.length
    return {
      challenge: ch,
      progress: `${Math.min(count, ch.targetCount)}/${ch.targetCount}`,
      completed: count >= ch.targetCount,
    }
  }

  if (ch.type === 'dca_trades') {
    const trades = await prisma.virtualTrade.findMany({ where: { userId, action: 'buy' } })
    const bySymbol: Record<string, number> = {}
    for (const t of trades) bySymbol[t.symbol] = (bySymbol[t.symbol] ?? 0) + 1
    const maxCount = Math.max(0, ...Object.values(bySymbol))
    return {
      challenge: ch,
      progress: `${Math.min(maxCount, ch.targetCount)}/${ch.targetCount}`,
      completed: maxCount >= ch.targetCount,
    }
  }

  // positive_return: check if total trades cost is at most cashILS remaining
  const vp = await prisma.virtualPortfolio.findUnique({ where: { userId } })
  const holdings: { avgPriceILS: number; quantity: number }[] = JSON.parse(vp?.holdings ?? '[]')
  const totalHoldingsValue = holdings.reduce((s, h) => s + h.avgPriceILS * h.quantity, 0)
  const totalValue = (vp?.cashILS ?? 100000) + totalHoldingsValue
  const isPositive = totalValue > 100000
  return {
    challenge: ch,
    progress: isPositive ? '1/1' : '0/1',
    completed: isPositive,
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)

  // Load holdings + completed lessons in parallel
  const [holdings, completedRows] = await Promise.all([
    prisma.holding.findMany({ where: { userId }, select: { assetType: true, ticker: true, quantity: true, avgPrice: true } }),
    prisma.lessonProgress.findMany({ where: { userId, completed: true }, select: { lessonId: true } }),
  ])

  const completedIds = new Set(completedRows.map(r => r.lessonId))
  const ctx = detectTriggers(holdings)

  // יסודות first (strict order), then trigger-based non-יסודות lessons
  const nextLesson =
    LESSONS
      .filter(l => l.category === 'יסודות')
      .filter(l => !completedIds.has(l.id))
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))[0]
    ??
    LESSONS
      .filter(l => l.category !== 'יסודות')
      .filter(l => !completedIds.has(l.id))
      .filter(l => matchesTrigger(l, ctx))
      [0]
    ?? LESSONS[0]

  const lesson = nextLesson
  const note = personalNote(lesson, ctx)

  // Weekly challenge (rotates by week number)
  const weekIdx = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) % WEEKLY_CHALLENGES.length
  const challengeData = await checkChallenge(userId, weekIdx)

  return NextResponse.json({
    lesson,
    personalNote: note,
    completedIds: [...completedIds],
    completedCount: completedIds.size,
    totalCount: LESSONS.length,
    weeklyChallenge: challengeData,
  })
}
