import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

interface CategoryScore {
  score: number
  max: number
  label: string
  detail: string
}

export interface InvestmentScoreData {
  total: number
  categories: {
    diversification: CategoryScore
    risk: CategoryScore
    costs: CategoryScore
    discipline: CategoryScore
    goals: CategoryScore
  }
  tip: string
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const [holdings, journalEntries, goals] = await Promise.all([
    prisma.holding.findMany({ where: { userId } }),
    prisma.journalEntry.findMany({ where: { userId } }),
    prisma.goal.findMany({ where: { userId } }),
  ])

  // ── 1. Diversification (20 pts) ──────────────────────────────────────────
  const tickerCount  = holdings.length
  const assetTypes   = new Set(holdings.map((h) => h.assetType))
  const currencies   = new Set(holdings.map((h) => h.currency ?? 'USD'))

  // Ticker variety (0–8 pts)
  const tickerPts =
    tickerCount >= 8 ? 8 :
    tickerCount >= 5 ? 6 :
    tickerCount >= 3 ? 4 :
    tickerCount >= 2 ? 2 :
    tickerCount === 1 ? 1 : 0

  // Asset type variety (0–6 pts)
  const typePts = assetTypes.size >= 3 ? 6 : assetTypes.size === 2 ? 3 : 0

  // Currency diversity (0–6 pts)
  const currencyPts = currencies.size >= 2 ? 6 : currencies.size === 1 ? 1 : 0

  const divScore = Math.min(tickerPts + typePts + currencyPts, 20)

  const diversification: CategoryScore = {
    score: divScore,
    max: 20,
    label: 'פיזור',
    detail: `${tickerCount} ני"ע · ${assetTypes.size} סוגי נכס · ${currencies.size} מטבעות`,
  }

  // ── 2. Risk (20 pts) ─────────────────────────────────────────────────────
  const totalCost = holdings.reduce((s, h) => s + h.avgPrice * h.quantity, 0)
  const maxWeight = holdings.reduce((max, h) => {
    const w = totalCost > 0 ? (h.avgPrice * h.quantity) / totalCost : 0
    return Math.max(max, w)
  }, 0)

  // Concentration (0–12 pts)
  const concPts =
    maxWeight > 0.5  ? 0  :
    maxWeight > 0.4  ? 4  :
    maxWeight > 0.25 ? 8  : 12

  // ETF ratio as risk cushion (0–8 pts)
  const etfCount = holdings.filter((h) => h.assetType === 'etf').length
  const etfRatio = holdings.length > 0 ? etfCount / holdings.length : 0
  const etfRiskPts = etfRatio >= 0.5 ? 8 : etfRatio >= 0.25 ? 5 : etfRatio > 0 ? 3 : 0

  const riskScore = Math.min(concPts + etfRiskPts, 20)

  const risk: CategoryScore = {
    score: riskScore,
    max: 20,
    label: 'סיכון',
    detail: `ריכוז מקסימלי ${Math.round(maxWeight * 100)}% · ${etfCount} ETF`,
  }

  // ── 3. Costs (20 pts) ────────────────────────────────────────────────────
  // ETF ratio is the best proxy for low-cost investing we have without expense ratio data.
  // Base of 3 pts because individual stocks have no management fee either.
  const costsScore = Math.min(Math.round(3 + etfRatio * 17), 20)

  const costs: CategoryScore = {
    score: costsScore,
    max: 20,
    label: 'עלויות',
    detail: etfCount > 0
      ? `${etfCount} ETF בתיק — עלות ניהול נמוכה`
      : 'אין ETF — שקול קרנות מחקות זולות',
  }

  // ── 4. Discipline (20 pts) ───────────────────────────────────────────────
  const entryCount = journalEntries.length

  // Documentation coverage (0–10 pts)
  const docPts =
    entryCount >= 10 ? 10 :
    entryCount >= 5  ?  7 :
    entryCount >= 3  ?  5 :
    entryCount >= 1  ?  3 : 0

  // Planned vs emotional ratio (0–10 pts) — only if there are entries
  let plannedPts = 0
  if (entryCount > 0) {
    const plannedCount = journalEntries.filter((e) => e.emotionTag === 'planned').length
    const plannedRatio = plannedCount / entryCount
    plannedPts =
      plannedRatio >= 0.7 ? 10 :
      plannedRatio >= 0.5 ?  7 :
      plannedRatio >= 0.3 ?  4 : 1
  }

  const disciplineScore = Math.min(docPts + plannedPts, 20)
  const plannedCount = journalEntries.filter((e) => e.emotionTag === 'planned').length

  const discipline: CategoryScore = {
    score: disciplineScore,
    max: 20,
    label: 'משמעת',
    detail: entryCount > 0
      ? `${entryCount} רשומות יומן · ${plannedCount} מתוכננות (${Math.round(plannedCount / entryCount * 100)}%)`
      : 'אין רשומות ביומן ההחלטות',
  }

  // ── 5. Goal Alignment (20 pts) ───────────────────────────────────────────
  const activeGoals = goals.filter((g) => g.status === 'active')
  let goalsScore = 0

  if (activeGoals.length >= 2) {
    goalsScore = 15
  } else if (activeGoals.length === 1) {
    goalsScore = 10
  }

  // Bonus: any goal has meaningful progress
  const hasProgress = activeGoals.some(
    (g) => g.targetAmount > 0 && g.currentAmount / g.targetAmount >= 0.1
  )
  if (hasProgress) goalsScore += 5

  goalsScore = Math.min(goalsScore, 20)

  const goalsCategory: CategoryScore = {
    score: goalsScore,
    max: 20,
    label: 'התאמה למטרות',
    detail: activeGoals.length > 0
      ? `${activeGoals.length} מטרות פעילות${hasProgress ? ' · יש התקדמות' : ''}`
      : 'אין מטרות פיננסיות מוגדרות',
  }

  // ── Total ─────────────────────────────────────────────────────────────────
  const total =
    diversification.score + risk.score + costs.score + discipline.score + goalsCategory.score

  // ── Tip — weakest category ───────────────────────────────────────────────
  const TIPS: Record<string, string> = {
    diversification: 'הוסף נכסים ממגוון סקטורים ומטבעות לשיפור הפיזור הגיאוגרפי',
    risk:            'הפחת את ריכוז האחזקה הגדולה ביותר או הוסף ETF להורדת הסיכון',
    costs:           'הוסף קרנות מחקות (ETF) עם דמי ניהול נמוכים להורדת עלות התיק',
    discipline:      'תעד את החלטות ההשקעה שלך ביומן עם תכנון מוקדם לשיפור הציון',
    goals:           'הגדר מטרות פיננסיות ב-/goals ועקוב אחר קצב ההחיסכון שלך',
  }

  const categoriesArr = [
    { key: 'diversification', pct: diversification.score / 20 },
    { key: 'risk',            pct: risk.score / 20            },
    { key: 'costs',           pct: costs.score / 20           },
    { key: 'discipline',      pct: discipline.score / 20      },
    { key: 'goals',           pct: goalsCategory.score / 20   },
  ]
  const weakest = categoriesArr.sort((a, b) => a.pct - b.pct)[0]
  const tip = TIPS[weakest.key]

  return NextResponse.json({
    total,
    categories: {
      diversification,
      risk,
      costs,
      discipline,
      goals: goalsCategory,
    },
    tip,
  } satisfies InvestmentScoreData)
}
