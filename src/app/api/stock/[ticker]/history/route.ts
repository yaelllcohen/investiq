import { NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo-finance'
import { auth } from '@/lib/auth'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { tickerSchema, validationError } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

const VALID_RANGES = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '5y', 'max'] as const
type ChartInterval = '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '90m' | '1h' | '1d' | '5d' | '1wk' | '1mo' | '3mo'
const VALID_INTERVALS: ChartInterval[] = ['5m', '15m', '1d', '1wk', '1mo']

function getRangeDate(range: string): string {
  const now = new Date()
  const d = new Date(now)
  switch (range) {
    case '1d':  d.setDate(d.getDate() - 1); break
    case '5d':  d.setDate(d.getDate() - 5); break
    case '1mo': d.setMonth(d.getMonth() - 1); break
    case '3mo': d.setMonth(d.getMonth() - 3); break
    case '6mo': d.setMonth(d.getMonth() - 6); break
    case '1y':  d.setFullYear(d.getFullYear() - 1); break
    case '5y':  d.setFullYear(d.getFullYear() - 5); break
    case 'max': return '2000-01-01'
    default:    d.setFullYear(d.getFullYear() - 1)
  }
  return d.toISOString().split('T')[0]
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const session = await auth()
    const identifier =
      session?.user?.id ??
      req.headers.get('x-forwarded-for') ??
      req.headers.get('x-real-ip') ??
      'unknown'
    const rl = await rateLimit(identifier, 'stock')
    if (!rl.success) return rateLimitResponse(rl.reset)

    const { ticker: rawTicker } = await params
    const tickerResult = tickerSchema.safeParse(rawTicker)
    if (!tickerResult.success) {
      return NextResponse.json(validationError(tickerResult.error), { status: 400 })
    }
    const ticker = tickerResult.data

    const { searchParams } = new URL(req.url)
    const rawRange = searchParams.get('range') ?? '1y'
    const rawInterval = searchParams.get('interval') ?? '1d'
    const range = (VALID_RANGES as readonly string[]).includes(rawRange) ? rawRange : '1y'
    const interval: ChartInterval = (VALID_INTERVALS as string[]).includes(rawInterval)
      ? (rawInterval as ChartInterval)
      : '1d'
    const period1 = getRangeDate(range)

    // Use chart() — supports all intervals including intraday (5m, 15m, etc.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await yahooFinance.chart(ticker, { period1, interval }, { validateResult: false }) as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes: any[] = raw?.quotes ?? []

    const data = quotes
      .filter((d) => d?.close != null)
      .map((d) => ({
        date: d.date instanceof Date ? d.date.toISOString() : String(d.date),
        open:   d.open   ?? d.close,
        high:   d.high   ?? d.close,
        low:    d.low    ?? d.close,
        close:  d.close,
        volume: d.volume ?? 0,
      }))

    return NextResponse.json(data)
  } catch {
    // Return empty array instead of 500 — client will show "no data" gracefully
    return NextResponse.json([])
  }
}
