import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { yahooFinance } from '@/lib/yahoo-finance'
import { isTasePaperNumber } from '@/lib/tase'
import { getBizportalPrice } from '@/lib/bizportal'
import { z } from 'zod'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { holdingSchema, validationError } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const rows = await prisma.holding.findMany({ where: { userId }, orderBy: { purchaseDate: 'desc' } })

  const holdings = await Promise.all(
    rows.map(async (h) => {
      // Priority: manualPrice > Bizportal (paper numbers) > Yahoo Finance > avgPrice
      let currentPrice = h.avgPrice
      let priceSource: 'manual' | 'tase' | 'yahoo' | 'cost' = 'cost'
      let dailyChange        = 0
      let dailyChangePercent = 0

      if (h.manualPrice != null && h.manualPrice > 0) {
        currentPrice = h.manualPrice
        priceSource = 'manual'
      } else {
        // Only attempt live prices for market-traded assets
        const isMarket = ['stock','etf','mutual_fund','bond','crypto','forex'].includes(h.assetType)
        if (isMarket) {
          try {
            if (isTasePaperNumber(h.ticker)) {
              const biz = await getBizportalPrice(h.ticker)
              if (biz?.price) {
                currentPrice = biz.price
                priceSource  = 'tase'
                if (biz.changePercent != null) {
                  dailyChangePercent = biz.changePercent
                  // Derive absolute per-unit change: price × pct / (100 + pct)
                  dailyChange = currentPrice * biz.changePercent / (100 + biz.changePercent)
                }
              }
            } else {
              const qRaw = await yahooFinance.quote(h.ticker, {}, { validateResult: false }) as {
                regularMarketPrice?: number
                regularMarketChange?: number
                regularMarketChangePercent?: number
              }
              if (qRaw?.regularMarketPrice) { currentPrice = qRaw.regularMarketPrice; priceSource = 'yahoo' }
              if (qRaw?.regularMarketChange != null)        dailyChange        = qRaw.regularMarketChange
              if (qRaw?.regularMarketChangePercent != null) dailyChangePercent = qRaw.regularMarketChangePercent
            }
          } catch { /* keep avgPrice */ }
        }
      }

      const value     = currentPrice * h.quantity
      const cost      = h.avgPrice   * h.quantity
      const plAmount  = value - cost
      const plPercent = cost > 0 ? (plAmount / cost) * 100 : 0

      return { ...h, currentPrice, priceSource, value, plAmount, plPercent, dailyChange, dailyChangePercent }
    })
  )

  // Totals grouped by currency — never mix ILS with USD
  const byCurrency: Record<string, { totalValue: number; totalCost: number; totalPL: number; totalPLPercent: number }> = {}
  for (const h of holdings) {
    const c = h.currency ?? 'USD'
    if (!byCurrency[c]) byCurrency[c] = { totalValue: 0, totalCost: 0, totalPL: 0, totalPLPercent: 0 }
    byCurrency[c].totalValue += h.value
    byCurrency[c].totalCost  += h.avgPrice * h.quantity
  }
  for (const c of Object.keys(byCurrency)) {
    const g = byCurrency[c]
    g.totalPL         = g.totalValue - g.totalCost
    g.totalPLPercent  = g.totalCost > 0 ? (g.totalPL / g.totalCost) * 100 : 0
  }

  return NextResponse.json({ holdings, byCurrency })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)

  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 }) }

  const parsed = holdingSchema.safeParse(body)
  if (!parsed.success) {
    console.warn('[portfolio] validation failed:', JSON.stringify(parsed.error.flatten()))
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }

  const {
    ticker, name, quantity, avgPrice, purchaseDate, assetType, currency,
    managingBody, accountNumber, track, monthlyDeposit, depositFrequency, interestRate, maturityDate,
  } = parsed.data
  try {
    const holding = await prisma.holding.create({
      data: {
        userId, ticker, name, quantity, avgPrice,
        purchaseDate: new Date(purchaseDate),
        assetType, currency,
        managingBody:     managingBody     ?? null,
        accountNumber:    accountNumber    ?? null,
        track:            track            ?? null,
        monthlyDeposit:   monthlyDeposit   ?? null,
        depositFrequency: depositFrequency ?? null,
        interestRate:     interestRate     ?? null,
        maturityDate:     maturityDate ? new Date(maturityDate) : null,
      },
    })
    return NextResponse.json(holding)
  } catch (e) {
    console.error('[portfolio] create failed:', e)
    const msg = e instanceof Error ? e.message : 'שגיאת מסד נתונים'
    return NextResponse.json({ error: `יצירת האחזקה נכשלה: ${msg}` }, { status: 500 })
  }
}

const deleteSchema = z.object({ id: z.string().min(1) })

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)
  const body = await req.json()
  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const { id } = parsed.data
  const holding = await prisma.holding.findFirst({ where: { id, userId } })
  if (!holding) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.holding.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
