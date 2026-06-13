import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { yahooFinance } from '@/lib/yahoo-finance'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { tradeSchema, validationError } from '@/lib/schemas'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)
  let account = await prisma.simulatorAccount.findUnique({
    where: { userId },
    include: { trades: { orderBy: { timestamp: 'desc' } } },
  })
  if (!account) {
    account = await prisma.simulatorAccount.create({
      data: { userId, balance: 10000 },
      include: { trades: { orderBy: { timestamp: 'desc' } } },
    })
  }
  const tradesWithNet = (account.trades || []).map(t => ({
    ...t,
    total: t.action === 'buy' ? -(t.price * t.quantity) : t.price * t.quantity,
  }))
  const holdings = computeHoldings(account.trades || [])
  const enriched = await Promise.all(
    Object.entries(holdings).map(async ([ticker, qty]) => {
      const avgPrice = computeAvgPrice(account!.trades || [], ticker)
      try {
        const qRaw = await yahooFinance.quote(ticker)
        const q = qRaw as { regularMarketPrice?: number }
        const currentPrice = q.regularMarketPrice ?? avgPrice
        return { ticker, quantity: qty, avgPrice, currentPrice, value: currentPrice * qty, pnl: (currentPrice - avgPrice) * qty }
      } catch {
        return { ticker, quantity: qty, avgPrice, currentPrice: avgPrice, value: avgPrice * qty, pnl: 0 }
      }
    })
  )
  return NextResponse.json({
    balance: account.balance,
    holdings: enriched.filter(h => h.quantity > 0) ?? [],
    trades: tradesWithNet ?? [],
  })
}

function computeHoldings(trades: Array<{ ticker: string; action: string; quantity: number }>) {
  const h: Record<string, number> = {}
  for (const t of trades) {
    if (!h[t.ticker]) h[t.ticker] = 0
    h[t.ticker] += t.action === 'buy' ? t.quantity : -t.quantity
  }
  return h
}

function computeAvgPrice(trades: Array<{ ticker: string; action: string; quantity: number; price: number }>, ticker: string) {
  const buys = trades.filter(t => t.ticker === ticker && t.action === 'buy')
  if (!buys.length) return 0
  const total = buys.reduce((sum, t) => sum + t.price * t.quantity, 0)
  const qty = buys.reduce((sum, t) => sum + t.quantity, 0)
  return qty > 0 ? total / qty : 0
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)
  const body = await req.json()
  console.log('[simulator] request body:', JSON.stringify(body))
  const parsed = tradeSchema.safeParse(body)
  if (!parsed.success) {
    console.error('[simulator] validation errors:', JSON.stringify(parsed.error.flatten(), null, 2))
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const { ticker, action, quantity: qty } = parsed.data
  const qRaw = await yahooFinance.quote(ticker)
  const q = qRaw as { regularMarketPrice?: number }
  const price = q.regularMarketPrice ?? 0
  let account = await prisma.simulatorAccount.findUnique({ where: { userId }, include: { trades: true } })
  if (!account) {
    account = await prisma.simulatorAccount.create({ data: { userId, balance: 10000 }, include: { trades: true } })
  }
  const cost = price * qty
  if (action === 'buy' && account.balance < cost) {
    return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
  }
  if (action === 'sell') {
    const holdings = computeHoldings(account.trades)
    if ((holdings[ticker] ?? 0) < qty) {
      return NextResponse.json({ error: 'Insufficient holdings' }, { status: 400 })
    }
  }
  const newBalance = action === 'buy' ? account.balance - cost : account.balance + cost
  await prisma.simulatorAccount.update({ where: { id: account.id }, data: { balance: newBalance } })
  const trade = await prisma.simulatorTrade.create({
    data: { accountId: account.id, ticker, action, quantity: qty, price },
  })
  return NextResponse.json({ trade, balance: newBalance })
}
