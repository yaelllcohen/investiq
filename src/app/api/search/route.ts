import { NextRequest, NextResponse } from 'next/server'
import yahooFinance from 'yahoo-finance2'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 1) return NextResponse.json({ results: [] })

  try {
    const raw = await (yahooFinance as unknown as {
      search: (query: string, opts: object) => Promise<{
        quotes: Array<{
          symbol?: string
          shortname?: string
          longname?: string
          exchDisp?: string
          quoteType?: string
        }>
      }>
    }).search(q, { newsCount: 0, quotesCount: 8 })

    const results = (raw.quotes ?? [])
      .filter((r) => r.symbol && r.quoteType !== 'OPTION')
      .slice(0, 8)
      .map((r) => ({
        symbol: r.symbol!,
        name: r.longname ?? r.shortname ?? r.symbol!,
        exchange: r.exchDisp ?? '',
        type: r.quoteType ?? '',
      }))

    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ results: [] })
  }
}
