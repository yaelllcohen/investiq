import { prisma } from '@/lib/prisma'
import { yahooFinance } from '@/lib/yahoo-finance'

export interface TradeRow {
  id: string
  accountId: string
  ticker: string
  action: string
  quantity: number
  price: number
  stopLoss: number | null
  autoStopLoss: boolean
  timestamp: Date
}

export interface AccountRow {
  id: string
  balance: number
  trades: TradeRow[]
}

export function computeHoldings(trades: TradeRow[]) {
  const h: Record<string, number> = {}
  for (const t of trades) {
    if (!h[t.ticker]) h[t.ticker] = 0
    h[t.ticker] += t.action === 'buy' ? t.quantity : -t.quantity
  }
  return h
}

export function computeAvgPrice(trades: TradeRow[], ticker: string) {
  const buys = trades.filter(t => t.ticker === ticker && t.action === 'buy')
  if (!buys.length) return 0
  const total = buys.reduce((sum, t) => sum + t.price * t.quantity, 0)
  const qty = buys.reduce((sum, t) => sum + t.quantity, 0)
  return qty > 0 ? total / qty : 0
}

// Latest buy trade (by timestamp) for this ticker that has a stop-loss set —
// that's the position's currently-active stop.
export function computeActiveStopLoss(trades: TradeRow[], ticker: string): number | null {
  const buysWithStop = trades
    .filter(t => t.ticker === ticker && t.action === 'buy' && t.stopLoss != null)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  return buysWithStop[0]?.stopLoss ?? null
}

async function fetchPrice(ticker: string, cache: Map<string, number | null>): Promise<number | null> {
  if (cache.has(ticker)) return cache.get(ticker)!
  let price: number | null = null
  try {
    const qRaw = await yahooFinance.quote(ticker)
    price = (qRaw as { regularMarketPrice?: number }).regularMarketPrice ?? null
  } catch { /* quote unavailable */ }
  cache.set(ticker, price)
  return price
}

// Checks every open position's stop-loss against a live quote and auto-sells
// (persisting a real SimulatorTrade) any that have breached it.
async function checkStopLosses(account: AccountRow, quoteCache: Map<string, number | null>): Promise<AccountRow> {
  const holdings = computeHoldings(account.trades)
  let trades = account.trades
  let balance = account.balance

  for (const [ticker, qty] of Object.entries(holdings)) {
    if (qty <= 0) continue
    const stopLoss = computeActiveStopLoss(trades, ticker)
    if (stopLoss == null) continue

    const currentPrice = await fetchPrice(ticker, quoteCache)
    if (currentPrice == null || currentPrice >= stopLoss) continue

    const sellTrade = await prisma.simulatorTrade.create({
      data: {
        accountId: account.id, ticker, action: 'sell', quantity: qty,
        price: currentPrice, stopLoss, autoStopLoss: true,
      },
    })
    balance += currentPrice * qty
    trades = [sellTrade, ...trades]
  }

  if (balance !== account.balance) {
    await prisma.simulatorAccount.update({ where: { id: account.id }, data: { balance } })
  }
  return { ...account, balance, trades }
}

// Builds the full simulator state payload (balance + enriched holdings +
// trade history) — checking and executing any breached stop-losses first.
// Used by GET, POST, and reset so the client always receives a consistent shape.
export async function buildAccountPayload(account: AccountRow) {
  const quoteCache = new Map<string, number | null>()
  const checked = await checkStopLosses(account, quoteCache)

  const tradesOut = checked.trades.map(t => ({
    id: t.id,
    date: t.timestamp,
    ticker: t.ticker,
    action: t.action.toUpperCase(),
    quantity: t.quantity,
    price: t.price,
    total: t.action === 'buy' ? -(t.price * t.quantity) : t.price * t.quantity,
    stopLoss: t.stopLoss,
    autoStopLoss: t.autoStopLoss,
  }))

  const holdings = computeHoldings(checked.trades)
  const enriched = await Promise.all(
    Object.entries(holdings)
      .filter(([, qty]) => qty > 0)
      .map(async ([ticker, qty]) => {
        const avgPrice = computeAvgPrice(checked.trades, ticker)
        const stopLoss = computeActiveStopLoss(checked.trades, ticker)
        const fetchedPrice = await fetchPrice(ticker, quoteCache)
        const currentPrice = fetchedPrice ?? avgPrice
        const pl = (currentPrice - avgPrice) * qty
        const plPercent = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0
        return { ticker, quantity: qty, avgPrice, currentPrice, stopLoss, pl, plPercent }
      })
  )

  return {
    balance: checked.balance,
    holdings: enriched,
    trades: tradesOut,
  }
}
