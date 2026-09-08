import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { yahooFinance } from '@/lib/yahoo-finance'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { tradeSchema, validationError } from '@/lib/schemas'
import { buildAccountPayload, computeHoldings } from '@/lib/simulator'

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
  return NextResponse.json(await buildAccountPayload(account))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)
  const body = await req.json()
  const parsed = tradeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const { ticker, action, quantity: qty, stopLoss } = parsed.data
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
  await prisma.simulatorTrade.create({
    data: {
      accountId: account.id, ticker, action, quantity: qty, price,
      stopLoss: action === 'buy' ? stopLoss ?? null : null,
    },
  })

  const fresh = await prisma.simulatorAccount.findUnique({
    where: { id: account.id },
    include: { trades: { orderBy: { timestamp: 'desc' } } },
  })
  return NextResponse.json(await buildAccountPayload(fresh!))
}
