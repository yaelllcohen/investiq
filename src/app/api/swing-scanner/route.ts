import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { yahooFinance } from '@/lib/yahoo-finance'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { SWING_SCAN_UNIVERSE } from '@/lib/swing-universe'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CACHE_TTL = 20 * 60 * 1000 // 20 minutes
const BATCH_SIZE = 10

interface ScanHit {
  symbol: string
  isIsraeli: boolean
  price: number
  sma200: number
  rsi: number
  volumeRatio: number
  distanceToResistancePct: number
  resistance: number
}

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null
  return closes.slice(-period).reduce((s, v) => s + v, 0) / period
}

function rsi14(closes: number[]): number | null {
  if (closes.length < 15) return null
  const diffs = closes.slice(1).map((v, i) => v - closes[i])
  const recent = diffs.slice(-14)
  let ag = 0, al = 0
  for (const d of recent) { ag += d > 0 ? d : 0; al += d < 0 ? -d : 0 }
  ag /= 14; al /= 14
  if (al === 0) return 100
  return 100 - 100 / (1 + ag / al)
}

async function runBatched<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize)
    const settled = await Promise.allSettled(chunk.map(fn))
    out.push(...settled)
  }
  return out
}

async function scanTicker(entry: { symbol: string; fetchSymbol: string; isIsraeli: boolean }): Promise<ScanHit | null> {
  const period1 = new Date(Date.now() - 400 * 86400000).toISOString().split('T')[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await yahooFinance.chart(entry.fetchSymbol, { period1, interval: '1d' }, { validateResult: false }) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quotes: any[] = raw?.quotes ?? []

  const closes: number[] = quotes.filter(q => typeof q.close === 'number' && isFinite(q.close)).map(q => q.close)
  const volumes: number[] = quotes.filter(q => typeof q.volume === 'number' && isFinite(q.volume)).map(q => q.volume)
  if (closes.length < 200 || volumes.length < 20) return null

  const price = closes.at(-1)!
  const sma200 = sma(closes, 200)
  const rsiVal = rsi14(closes)
  const avgVol20 = volumes.slice(-20).reduce((s, v) => s + v, 0) / 20
  const lastVol = volumes.at(-1)!
  const resistance = Math.max(...closes.slice(-20))

  if (sma200 == null || rsiVal == null || avgVol20 <= 0 || resistance <= 0) return null

  const volumeRatio = lastVol / avgVol20
  const distanceToResistancePct = ((resistance - price) / price) * 100

  const passesAll =
    price > sma200 &&
    volumeRatio > 1.2 &&
    rsiVal >= 40 && rsiVal <= 60 &&
    distanceToResistancePct >= 0 && distanceToResistancePct <= 3

  if (!passesAll) return null

  return {
    symbol: entry.symbol,
    isIsraeli: entry.isIsraeli,
    price,
    sma200,
    rsi: parseFloat(rsiVal.toFixed(1)),
    volumeRatio: parseFloat(volumeRatio.toFixed(2)),
    distanceToResistancePct: parseFloat(distanceToResistancePct.toFixed(2)),
    resistance,
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimit(session.user.id, 'scanner')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const { searchParams } = new URL(req.url)
  const force = searchParams.get('force') === '1'

  // ── Cache check ────────────────────────────────────────────────────────────
  if (!force) {
    try {
      const cached = await prisma.aiScore.findUnique({
        where: { symbol_type: { symbol: 'SWING_SCAN', type: 'universe_scan' } },
      })
      if (cached && Date.now() - cached.createdAt.getTime() < CACHE_TTL) {
        return NextResponse.json({ ...JSON.parse(cached.scoreJson), cached: true })
      }
    } catch { /* re-compute on cache miss */ }
  }

  const settled = await runBatched(SWING_SCAN_UNIVERSE, BATCH_SIZE, scanTicker)
  const hits = settled
    .filter((r): r is PromiseFulfilledResult<ScanHit | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((v): v is ScanHit => v !== null)
    .sort((a, b) => a.distanceToResistancePct - b.distanceToResistancePct)

  const result = {
    results: hits,
    scannedCount: SWING_SCAN_UNIVERSE.length,
    matchCount: hits.length,
    generatedAt: new Date().toISOString(),
  }

  try {
    await prisma.aiScore.upsert({
      where:  { symbol_type: { symbol: 'SWING_SCAN', type: 'universe_scan' } },
      create: { symbol: 'SWING_SCAN', type: 'universe_scan', scoreJson: JSON.stringify(result) },
      update: { scoreJson: JSON.stringify(result), createdAt: new Date() },
    })
  } catch { /* ignore cache write errors */ }

  return NextResponse.json({ ...result, cached: false })
}
