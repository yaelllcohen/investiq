import { NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo-finance'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

const INDICES = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: 'NASDAQ' },
  { symbol: '^DJI', name: 'Dow Jones' },
  { symbol: '^TA125.TA', name: 'Tel Aviv 125' },
]

export async function GET(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
    const rl = await rateLimit(ip, 'stock')
    if (!rl.success) return rateLimitResponse(rl.reset)

    const results = await Promise.allSettled(
      INDICES.map(async idx => {
        const q = await yahooFinance.quote(idx.symbol, {}, { validateResult: false }) as { regularMarketPrice?: number; regularMarketChange?: number; regularMarketChangePercent?: number }
        return {
          symbol: idx.symbol,
          name: idx.name,
          price: q.regularMarketPrice ?? 0,
          change: q.regularMarketChange ?? 0,
          changePercent: q.regularMarketChangePercent ?? 0,
        }
      })
    )
    const data = results
      .filter((r): r is PromiseFulfilledResult<{ symbol: string; name: string; price: number; change: number; changePercent: number }> => r.status === 'fulfilled')
      .map(r => r.value)
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 })
  }
}
