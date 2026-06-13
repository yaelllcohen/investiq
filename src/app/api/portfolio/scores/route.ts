import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const tickersParam = new URL(req.url).searchParams.get('tickers') ?? ''
  const tickers = tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)

  if (!tickers.length) return NextResponse.json({ scores: {} })

  // Cache-only — no computation
  const rows = await prisma.aiScore.findMany({
    where: { symbol: { in: tickers } },
    select: { symbol: true, scoreJson: true },
    orderBy: { createdAt: 'desc' },
  })

  // Build map: symbol → total (take most recent per symbol)
  const scores: Record<string, number | null> = {}
  for (const ticker of tickers) scores[ticker] = null

  for (const row of rows) {
    if (scores[row.symbol] !== null) continue  // already got a value
    try {
      const parsed = JSON.parse(row.scoreJson)
      if (typeof parsed.total === 'number') scores[row.symbol] = parsed.total
    } catch { /* skip malformed */ }
  }

  return NextResponse.json({ scores })
}
