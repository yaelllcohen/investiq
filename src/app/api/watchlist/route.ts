import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { yahooFinance } from '@/lib/yahoo-finance'
import { isTasePaperNumber } from '@/lib/tase'
import { getBizportalPrice } from '@/lib/bizportal'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { watchlistSchema, tickerSchema, validationError } from '@/lib/schemas'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ── GET: list all watchlist items for user ───────────────────────────────────

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const { searchParams } = new URL(req.url)
  const withHistory = searchParams.get('history') === 'true'
  const sparkPeriod1 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

  const items = await prisma.watchlistItem.findMany({ where: { userId }, orderBy: { addedAt: 'desc' } })
  const enriched = await Promise.all(
    items.map(async (item) => {
      // Israeli paper numbers → Bizportal (no sparkline available)
      if (isTasePaperNumber(item.ticker)) {
        try {
          const biz = await getBizportalPrice(item.ticker)
          if (biz?.price) {
            const cp = biz.changePercent ?? 0
            const change = cp !== 0 ? biz.price * cp / (100 + cp) : 0
            return {
              ...item,
              addedAt: item.addedAt.toISOString(),
              name: biz.name ?? item.ticker,
              price: biz.price,
              change,
              changePercent: cp,
              history: [],
              currency: 'ILS',
            }
          }
        } catch { /* fall through to zero */ }
        return { ...item, addedAt: item.addedAt.toISOString(), name: item.ticker, price: 0, change: 0, changePercent: 0, history: [], currency: 'ILS' }
      }

      // Standard Yahoo Finance path
      try {
        const [qRaw, chartRes] = await Promise.all([
          yahooFinance.quote(item.ticker, {}, { validateResult: false }),
          withHistory
            ? yahooFinance.chart(item.ticker, { period1: sparkPeriod1, interval: '1d' }, { validateResult: false }).catch(() => null)
            : Promise.resolve(null),
        ])
        const q = qRaw as { longName?: string; shortName?: string; regularMarketPrice?: number; regularMarketChange?: number; regularMarketChangePercent?: number; currency?: string }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const quotes: any[] = (chartRes as any)?.quotes ?? []
        const history = quotes.filter((d) => d.close != null).map((d) => ({ value: d.close as number }))
        return {
          ...item,
          addedAt: item.addedAt.toISOString(),
          name: q.longName ?? q.shortName ?? item.ticker,
          price: q.regularMarketPrice ?? 0,
          change: q.regularMarketChange ?? 0,
          changePercent: q.regularMarketChangePercent ?? 0,
          history,
          currency: q.currency ?? 'USD',
        }
      } catch {
        return { ...item, addedAt: item.addedAt.toISOString(), name: item.ticker, price: 0, change: 0, changePercent: 0, history: [], currency: 'USD' }
      }
    })
  )
  return NextResponse.json(enriched)
}

// ── POST: add ticker (with .TA auto-fallback) ────────────────────────────────

async function resolveTickerOrNull(symbol: string): Promise<string | null> {
  for (const candidate of symbol.endsWith('.TA') ? [symbol] : [symbol, symbol + '.TA']) {
    try {
      const q = await yahooFinance.quote(candidate, {}, { validateResult: false }) as { regularMarketPrice?: number }
      if (q?.regularMarketPrice) return candidate
    } catch { /* try next */ }
  }
  return null
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const body = await req.json()
  const parsed = watchlistSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })

  const { ticker } = parsed.data

  // Israeli paper number (Bizportal) — skip Yahoo resolution
  if (isTasePaperNumber(ticker)) {
    const biz = await getBizportalPrice(ticker)
    if (!biz?.price) {
      return NextResponse.json({ error: 'מספר הנייר לא נמצא. ודא שהמספר נכון (7 ספרות)' }, { status: 404 })
    }
    try {
      const item = await prisma.watchlistItem.create({ data: { userId, ticker } })
      return NextResponse.json(item)
    } catch {
      return NextResponse.json({ error: 'הנייר כבר קיים ברשימת המעקב' }, { status: 400 })
    }
  }

  const resolved = await resolveTickerOrNull(ticker)
  if (!resolved) {
    return NextResponse.json(
      { error: 'הסמל לא נמצא. למניות ישראליות הוסף .TA (לדוגמה: DORL.TA)' },
      { status: 404 }
    )
  }

  try {
    const item = await prisma.watchlistItem.create({ data: { userId, ticker: resolved } })
    return NextResponse.json(item)
  } catch {
    return NextResponse.json({ error: 'הסמל כבר קיים ברשימת המעקב' }, { status: 400 })
  }
}

// ── DELETE: remove by ?ticker=X  or  ?clearAll=1 ────────────────────────────
// Query params avoid body-parsing issues with DELETE in Next.js App Router.

const tickerParamSchema = z.object({ ticker: tickerSchema })

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const { searchParams } = new URL(req.url)

  // Clear all items for this user
  if (searchParams.get('clearAll') === '1') {
    const result = await prisma.watchlistItem.deleteMany({ where: { userId } })
    console.log(`[watchlist] clearAll userId=${userId} deleted=${result.count}`)
    return NextResponse.json({ success: true, deleted: result.count })
  }

  // Delete single ticker
  const parsed = tickerParamSchema.safeParse({ ticker: searchParams.get('ticker') })
  if (!parsed.success) {
    console.warn('[watchlist] DELETE missing/invalid ticker param', searchParams.get('ticker'))
    return NextResponse.json({ error: 'חסר פרמטר ticker' }, { status: 400 })
  }

  const { ticker } = parsed.data
  console.log(`[watchlist] DELETE userId=${userId} ticker=${ticker}`)
  const result = await prisma.watchlistItem.deleteMany({ where: { userId, ticker } })
  console.log(`[watchlist] deleted count=${result.count}`)
  if (result.count === 0) return NextResponse.json({ error: 'הסמל לא נמצא' }, { status: 404 })
  return NextResponse.json({ success: true })
}
