import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { yahooFinance } from '@/lib/yahoo-finance'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { SWING_SCAN_UNIVERSE } from '@/lib/swing-universe'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

const IL_TZ = 'Asia/Jerusalem'
const QUOTE_CHUNK_SIZE = 40
const EXTRAS_BATCH_SIZE = 15

// ── Trading-day cache validity (Israeli business week: Sun–Thu trading, Fri–Sat weekend) ──
function ilDateParts(d: Date): { dateStr: string; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: IL_TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  })
  const parts = fmt.formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { dateStr: `${get('year')}-${get('month')}-${get('day')}`, weekday: weekdayMap[get('weekday')] ?? 0 }
}

// Cache is valid for the rest of the calendar day it was generated on. On
// Saturday (the Israeli weekend, after Friday's close), Friday's scan is
// still shown rather than forcing a scan on a non-trading day.
function isCacheValidForTradingDay(cachedAt: Date, now: Date): boolean {
  const cached = ilDateParts(cachedAt)
  const current = ilDateParts(now)
  if (cached.dateStr === current.dateStr) return true
  if (current.weekday === 6) {
    const yesterday = ilDateParts(new Date(now.getTime() - 24 * 3600 * 1000))
    return cached.dateStr === yesterday.dateStr
  }
  return false
}

// Raw per-ticker metrics — no filtering applied server-side. The client applies
// the (dynamically adjustable) Finviz-style filters against this cached dataset.
interface ScanRow {
  symbol: string
  isIsraeli: boolean
  price: number
  changePercent: number
  gapPercent: number | null
  marketCap: number | null
  volume: number
  sma200: number | null
  rsi: number | null
  floatShares: number | null
  insidersPct: number | null
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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function fetchRsi(fetchSymbol: string): Promise<number | null> {
  const period1 = new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0]
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await yahooFinance.chart(fetchSymbol, { period1, interval: '1d' }, { validateResult: false }) as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes: any[] = raw?.quotes ?? []
    const closes: number[] = quotes.filter(q => typeof q.close === 'number' && isFinite(q.close)).map(q => q.close)
    return rsi14(closes)
  } catch {
    return null
  }
}

async function fetchFloatAndInsiders(fetchSymbol: string): Promise<{ floatShares: number | null; insidersPct: number | null }> {
  try {
    const summary = await yahooFinance.quoteSummary(
      fetchSymbol,
      { modules: ['defaultKeyStatistics'] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { validateResult: false } as any
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = (summary as any)?.defaultKeyStatistics
    return {
      floatShares: typeof stats?.floatShares === 'number' ? stats.floatShares : null,
      insidersPct: typeof stats?.heldPercentInsiders === 'number' ? stats.heldPercentInsiders * 100 : null,
    }
  } catch {
    return { floatShares: null, insidersPct: null }
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
      if (cached && isCacheValidForTradingDay(cached.createdAt, new Date())) {
        return NextResponse.json({ ...JSON.parse(cached.scoreJson), cached: true })
      }
    } catch { /* re-compute on cache miss */ }
  }

  // ── Stage 1: batched quote() calls for price / change% / gap% / marketCap / volume / SMA200 ──
  const bySymbol = new Map<string, { isIsraeli: boolean }>()
  for (const e of SWING_SCAN_UNIVERSE) bySymbol.set(e.fetchSymbol, { isIsraeli: e.isIsraeli })

  const quoteChunks = chunk(SWING_SCAN_UNIVERSE.map(e => e.fetchSymbol), QUOTE_CHUNK_SIZE)
  const quoteResults = await Promise.allSettled(
    quoteChunks.map(syms => yahooFinance.quote(syms, {}, { validateResult: false }))
  )

  const coarse = new Map<string, {
    price: number; changePercent: number; gapPercent: number | null
    marketCap: number | null; volume: number; sma200: number | null
  }>()
  for (const r of quoteResults) {
    if (r.status !== 'fulfilled') continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: any[] = Array.isArray(r.value) ? r.value : []
    for (const q of arr) {
      const price = q?.regularMarketPrice
      if (typeof price !== 'number' || !isFinite(price) || price <= 0) continue
      const open = typeof q.regularMarketOpen === 'number' ? q.regularMarketOpen : null
      const prevClose = typeof q.regularMarketPreviousClose === 'number' ? q.regularMarketPreviousClose : null
      const gapPercent = (open != null && prevClose != null && prevClose > 0)
        ? ((open - prevClose) / prevClose) * 100
        : null
      coarse.set(q.symbol, {
        price,
        changePercent: typeof q.regularMarketChangePercent === 'number' ? q.regularMarketChangePercent : 0,
        gapPercent,
        marketCap: typeof q.marketCap === 'number' ? q.marketCap : null,
        volume: typeof q.regularMarketVolume === 'number' ? q.regularMarketVolume : 0,
        sma200: typeof q.twoHundredDayAverage === 'number' ? q.twoHundredDayAverage : null,
      })
    }
  }

  // ── Stage 2: per-ticker RSI + float/insiders (only for symbols with a valid quote) ──
  const targets = [...coarse.keys()]
  const extrasSettled = await runBatched(targets, EXTRAS_BATCH_SIZE, async (fetchSymbol) => {
    const [rsi, extras] = await Promise.all([fetchRsi(fetchSymbol), fetchFloatAndInsiders(fetchSymbol)])
    return { fetchSymbol, rsi, ...extras }
  })
  const extrasMap = new Map<string, { rsi: number | null; floatShares: number | null; insidersPct: number | null }>()
  for (const r of extrasSettled) {
    if (r.status === 'fulfilled') extrasMap.set(r.value.fetchSymbol, r.value)
  }

  // ── Combine ────────────────────────────────────────────────────────────────
  const results: ScanRow[] = []
  for (const [fetchSymbol, meta] of bySymbol) {
    const c = coarse.get(fetchSymbol)
    if (!c) continue
    const extras = extrasMap.get(fetchSymbol)
    results.push({
      symbol: fetchSymbol.replace(/\.TA$/, ''),
      isIsraeli: meta.isIsraeli,
      price: c.price,
      changePercent: parseFloat(c.changePercent.toFixed(2)),
      gapPercent: c.gapPercent != null ? parseFloat(c.gapPercent.toFixed(2)) : null,
      marketCap: c.marketCap,
      volume: c.volume,
      sma200: c.sma200,
      rsi: extras?.rsi != null ? parseFloat(extras.rsi.toFixed(1)) : null,
      floatShares: extras?.floatShares ?? null,
      insidersPct: extras?.insidersPct != null ? parseFloat(extras.insidersPct.toFixed(1)) : null,
    })
  }

  const result = {
    results,
    scannedCount: SWING_SCAN_UNIVERSE.length,
    computedCount: results.length,
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
