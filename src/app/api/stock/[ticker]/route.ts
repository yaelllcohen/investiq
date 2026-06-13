import { NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo-finance'
import { auth } from '@/lib/auth'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { tickerSchema, validationError } from '@/lib/schemas'

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

    const [quote, summary] = await Promise.allSettled([
      yahooFinance.quote(ticker),
      yahooFinance.quoteSummary(ticker, {
        modules: ['summaryDetail', 'defaultKeyStatistics', 'assetProfile', 'financialData'],
      }),
    ])
    return NextResponse.json({
      quote: quote.status === 'fulfilled' ? quote.value : null,
      summary: summary.status === 'fulfilled' ? summary.value : null,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch stock data' }, { status: 500 })
  }
}
