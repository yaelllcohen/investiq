import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { yahooFinance } from '@/lib/yahoo-finance'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { tickerSchema } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const { searchParams } = new URL(req.url)
  const raw = searchParams.get('ticker')?.trim() ?? ''

  const parsed = tickerSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'סמל מניה לא תקין' }, { status: 400 })
  }
  const ticker = parsed.data

  try {
    const quote = await yahooFinance.quote(ticker, {}, { validateResult: false }) as {
      regularMarketPrice?: number
      longName?: string
      shortName?: string
      currency?: string
    }

    if (!quote?.regularMarketPrice) {
      return NextResponse.json({ error: `לא נמצא מחיר עבור ${ticker}` }, { status: 404 })
    }

    return NextResponse.json({
      ticker,
      price: quote.regularMarketPrice,
      name: quote.longName ?? quote.shortName ?? ticker,
      currency: quote.currency ?? 'USD',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[simulator/quote] ${ticker}:`, msg)
    return NextResponse.json({ error: `שגיאה בשליפת מחיר: ${msg}` }, { status: 502 })
  }
}
