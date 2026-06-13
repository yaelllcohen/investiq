import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { yahooFinance } from '@/lib/yahoo-finance'
import { isTasePaperNumber } from '@/lib/tase'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// ─── Sector label mapping ─────────────────────────────────────────────────────

const YF_SECTOR_HE: Record<string, string> = {
  'Technology':             'טכנולוגיה',
  'Healthcare':             'בריאות',
  'Financial Services':     'פיננסים',
  'Financials':             'פיננסים',
  'Energy':                 'אנרגיה',
  'Real Estate':            'נדל"ן',
  'Industrials':            'תעשייה',
  'Consumer Cyclical':      'צרכנות',
  'Consumer Defensive':     'מזון ומשקאות',
  'Basic Materials':        'חומרי גלם',
  'Communication Services': 'תקשורת',
  'Utilities':              'תשתיות',
}

function assetTypeToSector(assetType: string): string | null {
  const MAP: Record<string, string> = {
    etf:          'קרן סל',
    mutual_fund:  'קרן נאמנות',
    bond:         'אג"ח',
    crypto:       'קריפטו',
    forex:        'מטבע חוץ',
    gemel:        'חיסכון ארוך טווח',
    hishtalmut:   'חיסכון ארוך טווח',
    pension:      'חיסכון ארוך טווח',
    deposit:      'פיקדון',
    real_estate:  'נדל"ן',
    gold:         'זהב / קומודיטי',
    p2p:          'P2P',
    cash:         'מזומן',
    other:        'אחר',
  }
  return MAP[assetType] ?? null
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const rl = await rateLimit(userId, 'stock')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const rows = await prisma.holding.findMany({
    where: { userId },
    select: { id: true, ticker: true, assetType: true, avgPrice: true, quantity: true },
  })

  // Build sector → total value map
  const sectorValue: Record<string, number> = {}

  await Promise.allSettled(
    rows.map(async (h) => {
      const value = h.avgPrice * h.quantity

      // Non-stock: use static mapping
      const staticSector = assetTypeToSector(h.assetType)
      if (staticSector) {
        sectorValue[staticSector] = (sectorValue[staticSector] ?? 0) + value
        return
      }

      // stock — fetch from Yahoo Finance
      if (h.assetType === 'stock' && !isTasePaperNumber(h.ticker)) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const summary = await yahooFinance.quoteSummary(
            h.ticker,
            { modules: ['assetProfile'] },
            { validateResult: false } as never,
          ) as any
          const rawSector = summary?.assetProfile?.sector as string | undefined
          const sector = rawSector ? (YF_SECTOR_HE[rawSector] ?? 'אחר') : 'מניות'
          sectorValue[sector] = (sectorValue[sector] ?? 0) + value
        } catch {
          sectorValue['מניות'] = (sectorValue['מניות'] ?? 0) + value
        }
        return
      }

      // Israeli stock (paper number or .TA) — no sector data available
      if (h.assetType === 'stock') {
        sectorValue['מניות ישראלי'] = (sectorValue['מניות ישראלי'] ?? 0) + value
        return
      }

      // Fallback
      sectorValue['אחר'] = (sectorValue['אחר'] ?? 0) + value
    })
  )

  const total = Object.values(sectorValue).reduce((s, v) => s + v, 0)

  const sectorData = Object.entries(sectorValue)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({
      name,
      value: Math.round(value * 100) / 100,
      percentage: total > 0 ? Math.round(value / total * 1000) / 10 : 0,
    }))

  return NextResponse.json({ sectorData, total })
}
