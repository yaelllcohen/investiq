import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { yahooFinance } from '@/lib/yahoo-finance'
import { getBizportalPrice } from '@/lib/bizportal'
import { gemini, GEMINI_MODEL } from '@/lib/gemini'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── Cache TTLs ───────────────────────────────────────────────────────────────

const TTL: Record<string, number> = {
  crypto:        6  * 60 * 60 * 1000,
  us_stock:      24 * 60 * 60 * 1000,
  israel_stock:  24 * 60 * 60 * 1000,
  etf:           24 * 60 * 60 * 1000,
  mutualfund:    24 * 60 * 60 * 1000,
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AssetType = 'us_stock' | 'israel_stock' | 'etf' | 'mutualfund' | 'crypto'

interface ScoreResult {
  assetType: AssetType
  total: number
  [key: string]: unknown
  explanations: Record<string, string>
  partial?: boolean
  partialReason?: string
}

// ─── Asset type detection ─────────────────────────────────────────────────────

function detectAssetType(symbol: string, quoteType?: string): AssetType {
  const qt = (quoteType ?? '').toUpperCase()
  if (qt === 'CRYPTOCURRENCY') return 'crypto'
  if (qt === 'ETF')            return 'etf'
  if (qt === 'MUTUALFUND')     return 'mutualfund'
  if (symbol.endsWith('.TA') || symbol.endsWith('.ta')) return 'israel_stock'
  return 'us_stock'
}

// ─── Number helpers ───────────────────────────────────────────────────────────

function n(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v
  return null
}

function pct(v: unknown): string | null {
  const x = n(v)
  return x !== null ? `${(x * 100).toFixed(1)}%` : null
}

function fmt(v: unknown, decimals = 2): string | null {
  const x = n(v)
  return x !== null ? x.toFixed(decimals) : null
}

// ─── History helper ───────────────────────────────────────────────────────────

async function fetchPriceHistory(symbol: string, days: number) {
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await yahooFinance.chart(symbol, { period1: since, interval: '1d' }, { validateResult: false })
    return (res?.quotes ?? []).filter((q: { close?: unknown }) => typeof q.close === 'number' && isFinite(q.close as number)) as { close: number }[]
  } catch {
    return []
  }
}

function momentumPct(closes: { close: number }[], lookbackBars: number): string | null {
  if (closes.length < lookbackBars + 1) return null
  const cur  = closes[closes.length - 1].close
  const past = closes[closes.length - 1 - lookbackBars].close
  return past > 0 ? `${(((cur / past) - 1) * 100).toFixed(1)}%` : null
}

// ─── DATA FETCHERS ─────────────────────────────────────────────────────────── //

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchUsStockData(symbol: string): Promise<Record<string, any>> {
  const [sumRes, histRes] = await Promise.allSettled([
    yahooFinance.quoteSummary(
      symbol,
      { modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail', 'assetProfile', 'earningsTrend'] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { validateResult: false } as any
    ),
    fetchPriceHistory(symbol, 190),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sum: any  = sumRes.status  === 'fulfilled' ? sumRes.value  : null
  const hist      = histRes.status === 'fulfilled' ? histRes.value : []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fin: any    = sum?.financialData
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stats: any  = sum?.defaultKeyStatistics
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detail: any = sum?.summaryDetail
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile: any = sum?.assetProfile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trend: any  = sum?.earningsTrend

  const curPrice = hist.length > 0 ? hist[hist.length - 1].close : 0

  const nextQtrGrowth = trend?.trend?.[0]?.earningsEstimate?.growth
  const currQtrGrowth = trend?.trend?.[1]?.earningsEstimate?.growth

  return {
    assetType: 'us_stock',
    sector:          profile?.sector     ?? null,
    industry:        profile?.industry   ?? null,
    pe_forward:      fmt(detail?.forwardPE),
    pe_trailing:     fmt(detail?.trailingPE),
    price_to_book:   fmt(stats?.priceToBook),
    revenue_growth:  pct(fin?.revenueGrowth),
    earnings_growth: pct(fin?.earningsGrowth),
    eps_next_qtr:    nextQtrGrowth != null ? pct(nextQtrGrowth) : null,
    eps_curr_qtr:    currQtrGrowth != null ? pct(currQtrGrowth) : null,
    gross_margin:    pct(fin?.grossMargins),
    profit_margin:   pct(fin?.profitMargins),
    roe:             pct(fin?.returnOnEquity),
    roa:             pct(fin?.returnOnAssets),
    debt_equity:     fmt(fin?.debtToEquity),
    beta:            fmt(detail?.beta ?? stats?.beta),
    short_ratio:     fmt(stats?.shortRatio),
    week52_high:     fmt(detail?.fiftyTwoWeekHigh),
    week52_low:      fmt(detail?.fiftyTwoWeekLow),
    cur_price:       curPrice > 0 ? curPrice.toFixed(2) : null,
    momentum_1m:     momentumPct(hist, 22),
    momentum_3m:     momentumPct(hist, 65),
    momentum_6m:     momentumPct(hist, 130),
    sma200_dist: ((): string | null => {
      if (hist.length < 200) return null
      const sma = hist.slice(-200).reduce((s, q) => s + q.close, 0) / 200
      return curPrice > 0 && sma > 0 ? `${(((curPrice / sma) - 1) * 100).toFixed(1)}%` : null
    })(),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchIsraelStockData(symbol: string, quote: any): Promise<Record<string, any>> {
  const [histRes] = await Promise.allSettled([fetchPriceHistory(symbol, 380)])
  const hist = histRes.status === 'fulfilled' ? histRes.value : []

  const curPrice = n(quote?.regularMarketPrice) ?? (hist.length > 0 ? hist[hist.length - 1].close : 0)

  const week52High = n(quote?.fiftyTwoWeekHigh)
  const week52Low  = n(quote?.fiftyTwoWeekLow)

  return {
    assetType: 'israel_stock',
    name:           quote?.longName ?? quote?.shortName ?? symbol,
    cur_price:      curPrice > 0 ? curPrice.toFixed(2) : null,
    change_1d:      pct((n(quote?.regularMarketChangePercent) ?? 0) / 100),
    volume:         n(quote?.regularMarketVolume)?.toFixed(0) ?? null,
    avg_volume:     n(quote?.averageDailyVolume10Day ?? quote?.averageDailyVolume3Month)?.toFixed(0) ?? null,
    market_cap:     n(quote?.marketCap) != null ? `₪${(n(quote.marketCap)! / 1e6).toFixed(0)}M` : null,
    week52_high:    week52High?.toFixed(2) ?? null,
    week52_low:     week52Low?.toFixed(2)  ?? null,
    dist_52w_high:  week52High && curPrice > 0 ? `${(((curPrice / week52High) - 1) * 100).toFixed(1)}%` : null,
    momentum_1m:    momentumPct(hist, 22),
    momentum_3m:    momentumPct(hist, 65),
    momentum_1y:    momentumPct(hist, 252),
    pe_trailing:    fmt(quote?.trailingPE),
    // Partial if very limited data
    dataPoints: [
      curPrice > 0,
      hist.length > 10,
      week52High != null,
      n(quote?.regularMarketVolume) != null,
    ].filter(Boolean).length,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchEtfData(symbol: string): Promise<Record<string, any>> {
  const [sumRes, histRes] = await Promise.allSettled([
    yahooFinance.quoteSummary(
      symbol,
      { modules: ['fundProfile', 'topHoldings', 'fundPerformance', 'summaryDetail', 'defaultKeyStatistics'] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { validateResult: false } as any
    ),
    fetchPriceHistory(symbol, 190),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sum: any = sumRes.status === 'fulfilled' ? sumRes.value : null
  const hist     = histRes.status === 'fulfilled' ? histRes.value : []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fp: any  = sum?.fundProfile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const th: any  = sum?.topHoldings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const perf: any = sum?.fundPerformance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detail: any = sum?.summaryDetail
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stats: any  = sum?.defaultKeyStatistics

  const topHoldingsConc = th?.holdings?.slice(0, 10).reduce((s: number, h: { holdingPercent?: number }) => s + (h.holdingPercent ?? 0), 0)
  const holdingsCount = th?.holdings?.length ?? null

  // ── Returns: prefer trailingReturns (most current) + defaultKeyStatistics for annualised avg ──
  const trailing = perf?.trailingReturns
  const ret1y  = trailing?.oneYear   != null ? `${(trailing.oneYear   * 100).toFixed(1)}%` : null
  const ret3y  = stats?.threeYearAverageReturn != null
    ? `${(stats.threeYearAverageReturn * 100).toFixed(1)}% (ann)`
    : (trailing?.threeYear != null ? `${(trailing.threeYear * 100).toFixed(1)}%` : null)
  const ret5y  = stats?.fiveYearAverageReturn  != null
    ? `${(stats.fiveYearAverageReturn  * 100).toFixed(1)}% (ann)`
    : (trailing?.fiveYear  != null ? `${(trailing.fiveYear  * 100).toFixed(1)}%` : null)
  const retYtd = stats?.ytdReturn != null ? `${(stats.ytdReturn * 100).toFixed(1)}%` : null

  // ── Volatility: use riskOverviewStatistics (stdDev, beta, sharpe) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const riskStats: any[] = perf?.riskOverviewStatistics?.riskStatistics ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const risk3y = riskStats.find((r: any) => r.year === '3y') ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const risk5y = riskStats.find((r: any) => r.year === '5y') ?? null

  const beta3y   = fmt(risk3y?.beta   ?? stats?.beta3Year ?? detail?.beta)
  const stdDev3y = risk3y?.stdDev   != null ? `${risk3y.stdDev.toFixed(1)}%`   : null
  const stdDev5y = risk5y?.stdDev   != null ? `${risk5y.stdDev.toFixed(1)}%`   : null
  const sharpe3y = risk3y?.sharpeRatio != null ? risk3y.sharpeRatio.toFixed(2) : null

  const week52High = n(detail?.fiftyTwoWeekHigh)
  const week52Low  = n(detail?.fiftyTwoWeekLow)
  const range52w   = week52High && week52Low && week52Low > 0
    ? `${(((week52High / week52Low) - 1) * 100).toFixed(0)}%`
    : null

  return {
    assetType: 'etf',
    // ── Cost ──
    expense_ratio:   fp?.feesExpensesInvestment?.annualReportExpenseRatio != null
      ? pct(fp.feesExpensesInvestment.annualReportExpenseRatio)
      : null,
    // ── Diversification ──
    holdings_count:  holdingsCount,
    top10_conc:      topHoldingsConc != null ? `${(topHoldingsConc * 100).toFixed(1)}%` : null,
    // ── Volatility ──
    beta_3y:         beta3y,
    std_dev_3y:      stdDev3y,
    std_dev_5y:      stdDev5y,
    sharpe_3y:       sharpe3y,
    week52_high:     fmt(week52High),
    week52_low:      fmt(week52Low),
    range_52w:       range52w,
    // ── Returns ──
    return_ytd:      retYtd,
    return_1y:       ret1y,
    return_3y_ann:   ret3y,
    return_5y_ann:   ret5y,
    // ── Momentum ──
    momentum_1m:     momentumPct(hist, 22),
    momentum_3m:     momentumPct(hist, 65),
    // ── Meta ──
    category:        fp?.categoryName ?? null,
    family:          fp?.family ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchMutualFundData(symbol: string): Promise<Record<string, any>> {
  const [sumRes, histRes] = await Promise.allSettled([
    yahooFinance.quoteSummary(
      symbol,
      { modules: ['fundProfile', 'fundPerformance', 'summaryDetail'] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { validateResult: false } as any
    ),
    fetchPriceHistory(symbol, 380),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sum: any  = sumRes.status === 'fulfilled' ? sumRes.value : null
  const hist      = histRes.status === 'fulfilled' ? histRes.value : []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fp: any   = sum?.fundProfile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const perf: any = sum?.fundPerformance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detail: any = sum?.summaryDetail

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const annualReturns: any[] = perf?.annualTotalReturns?.returns ?? []
  const ret1y = annualReturns[0]?.annualValue != null ? pct(annualReturns[0].annualValue) : null
  const ret3y = annualReturns.length >= 3
    ? `${(annualReturns.slice(0, 3).reduce((s: number, r: { annualValue?: number }) => s + (r.annualValue ?? 0), 0) / 3 * 100).toFixed(1)}% (ann)`
    : null
  const ret5y = annualReturns.length >= 5
    ? `${(annualReturns.slice(0, 5).reduce((s: number, r: { annualValue?: number }) => s + (r.annualValue ?? 0), 0) / 5 * 100).toFixed(1)}% (ann)`
    : null

  // Consistency: stdev of annual returns
  let consistency: string | null = null
  if (annualReturns.length >= 3) {
    const vals = annualReturns.slice(0, Math.min(5, annualReturns.length)).map((r: { annualValue?: number }) => r.annualValue ?? 0)
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length
    const stdev = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length)
    consistency = `${(stdev * 100).toFixed(1)}% תנודתיות בתשואות שנתיות`
  }

  return {
    assetType: 'mutualfund',
    expense_ratio:   fp?.feesExpensesInvestment?.annualReportExpenseRatio != null
      ? pct(fp.feesExpensesInvestment.annualReportExpenseRatio)
      : null,
    beta:            fmt(detail?.beta),
    category:        fp?.categoryName ?? null,
    return_1y:       ret1y,
    return_3y_ann:   ret3y,
    return_5y_ann:   ret5y,
    consistency,
    momentum_1m:     momentumPct(hist, 22),
    momentum_3m:     momentumPct(hist, 65),
    annual_returns_raw: annualReturns.slice(0, 5).map((r: { year?: string | number; annualValue?: number }) => ({
      year: r.year, val: r.annualValue != null ? `${(r.annualValue * 100).toFixed(1)}%` : null,
    })),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCryptoData(symbol: string, quote: any): Promise<Record<string, any>> {
  const [histRes] = await Promise.allSettled([fetchPriceHistory(symbol, 100)])
  const hist = histRes.status === 'fulfilled' ? histRes.value : []

  const curPrice  = n(quote?.regularMarketPrice) ?? 0
  const marketCap = n(quote?.marketCap)
  const volume    = n(quote?.regularMarketVolume)
  const week52High = n(quote?.fiftyTwoWeekHigh)
  const week52Low  = n(quote?.fiftyTwoWeekLow)

  const volMcapRatio = marketCap && marketCap > 0 && volume
    ? `${((volume / marketCap) * 100).toFixed(2)}%`
    : null

  const distFrom52High = week52High && curPrice > 0
    ? `${(((curPrice / week52High) - 1) * 100).toFixed(1)}%`
    : null

  // Daily volatility (avg abs daily change)
  let avgDailyVol: string | null = null
  if (hist.length >= 14) {
    const recent = hist.slice(-14)
    const dailyChanges = recent.slice(1).map((q, i) =>
      Math.abs((q.close - recent[i].close) / recent[i].close)
    )
    avgDailyVol = `${(dailyChanges.reduce((s, v) => s + v, 0) / dailyChanges.length * 100).toFixed(1)}%`
  }

  return {
    assetType: 'crypto',
    name:            quote?.longName ?? quote?.shortName ?? symbol,
    cur_price:       curPrice > 0 ? curPrice.toFixed(2) : null,
    change_1d:       pct((n(quote?.regularMarketChangePercent) ?? 0) / 100),
    market_cap:      marketCap != null ? `$${(marketCap / 1e9).toFixed(2)}B` : null,
    volume_24h:      volume != null ? `$${(volume / 1e9).toFixed(2)}B` : null,
    vol_mcap_ratio:  volMcapRatio,
    week52_high:     week52High?.toFixed(2) ?? null,
    week52_low:      week52Low?.toFixed(2)  ?? null,
    dist_52w_high:   distFrom52High,
    momentum_1w:     momentumPct(hist, 7),
    momentum_1m:     momentumPct(hist, 22),
    momentum_3m:     momentumPct(hist, 65),
    avg_daily_vol:   avgDailyVol,
    range_52w_pct: (week52High && week52Low && week52Low > 0)
      ? `${(((week52High / week52Low) - 1) * 100).toFixed(0)}%`
      : null,
  }
}

// ─── PROMPT BUILDERS ─────────────────────────────────────────────────────────

const JSON_HEADER = 'החזר JSON בלבד. אסור טקסט לפני או אחרי. אסור markdown. אסור backticks.\n\n'

const JSON_FOOTER = (components: string[]) =>
  `\n\nSCORING: integers 0-100, 100=best. ONE Hebrew sentence per explanation (≤12 words). If data missing → score=50, explanation="אין מספיק נתונים לרכיב זה".\n\nOUTPUT (replace numeric examples with real scores):\n{"total":72,${components.map(c => `"${c}":65`).join(',')},"explanations":{${components.map(c => `"${c}":"הסבר בעברית"`).join(',')}}}`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildUsStockPrompt(d: Record<string, any>, sym: string): string {
  const components = ['growth', 'profitability', 'momentum', 'valuation', 'risk']
  return `${JSON_HEADER}You are a quant analyst scoring a US stock based ONLY on the data below.
Components: growth (revenue+earnings), profitability (margins+ROE), momentum (1M/3M/6M vs market), valuation (P/E+P/B vs sector), risk (beta+short ratio+distance from 52w low).

Symbol: ${sym} | Sector: ${d.sector ?? 'N/A'} | Industry: ${d.industry ?? 'N/A'}
PE_forward=${d.pe_forward ?? 'null'} PE_trailing=${d.pe_trailing ?? 'null'} P/B=${d.price_to_book ?? 'null'}
revenue_growth=${d.revenue_growth ?? 'null'} earnings_growth=${d.earnings_growth ?? 'null'}
EPS_next_qtr=${d.eps_next_qtr ?? 'null'} EPS_curr_qtr=${d.eps_curr_qtr ?? 'null'}
gross_margin=${d.gross_margin ?? 'null'} profit_margin=${d.profit_margin ?? 'null'}
ROE=${d.roe ?? 'null'} ROA=${d.roa ?? 'null'} debt/equity=${d.debt_equity ?? 'null'}
beta=${d.beta ?? 'null'} short_ratio=${d.short_ratio ?? 'null'}
price=${d.cur_price ?? 'null'} 52w_high=${d.week52_high ?? 'null'} 52w_low=${d.week52_low ?? 'null'}
momentum_1m=${d.momentum_1m ?? 'null'} momentum_3m=${d.momentum_3m ?? 'null'} momentum_6m=${d.momentum_6m ?? 'null'}
sma200_distance=${d.sma200_dist ?? 'null'}${JSON_FOOTER(components)}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildIsraelStockPrompt(d: Record<string, any>, sym: string): string {
  const components = ['momentum', 'volatility', 'liquidity', ...(d.pe_trailing ? ['valuation'] : [])]
  return `${JSON_HEADER}You are a quant analyst scoring an Israeli stock. Data may be partial — score only what's available, explain missing data in Hebrew.
Components: momentum (daily/monthly/yearly price change), volatility (52w range width and distance from high), liquidity (volume vs avg), ${d.pe_trailing ? 'valuation (P/E if available).' : 'DO NOT include valuation — no data.'}

Symbol: ${sym} | Name: ${d.name ?? 'N/A'}
price=${d.cur_price ?? 'null'} change_1d=${d.change_1d ?? 'null'}
momentum_1m=${d.momentum_1m ?? 'null'} momentum_3m=${d.momentum_3m ?? 'null'} momentum_1y=${d.momentum_1y ?? 'null'}
52w_high=${d.week52_high ?? 'null'} 52w_low=${d.week52_low ?? 'null'} dist_52w_high=${d.dist_52w_high ?? 'null'}
volume=${d.volume ?? 'null'} avg_volume=${d.avg_volume ?? 'null'} market_cap=${d.market_cap ?? 'null'}
${d.pe_trailing ? `PE_trailing=${d.pe_trailing}` : ''}${JSON_FOOTER(components)}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEtfPrompt(d: Record<string, any>, sym: string): string {
  const components = ['returns', 'cost', 'diversification', 'volatility', 'momentum']
  return `${JSON_HEADER}You are a quant analyst scoring an ETF. DO NOT assess company profitability or earnings — irrelevant for ETFs.

SCORING GUIDE:
- returns: use YTD/1Y/3Y/5Y trailing returns. Higher=better. Compare to category average if known.
- cost: expense_ratio. 0-0.1%→score 95-100, 0.1-0.5%→70-90, 0.5-1%→40-70, >1%→<40.
- diversification: holdings_count (more=better) + top10_concentration (lower=better, <20%→90+, 40-60%→50-70, >80%→<30).
- volatility: use std_dev_3y/5y (lower=better for stability), beta_3y (near 1=neutral, <0.8=stable, >1.3=risky), sharpe_3y (higher=better risk-adjusted). 52w_range width = large range = higher volatility.
- momentum: 1M/3M price change. Positive=higher score.

Symbol: ${sym} | Category: ${d.category ?? 'N/A'} | Family: ${d.family ?? 'N/A'}
expense_ratio=${d.expense_ratio ?? 'null'}
holdings_count=${d.holdings_count ?? 'null'} top10_concentration=${d.top10_conc ?? 'null'}
return_ytd=${d.return_ytd ?? 'null'} return_1y=${d.return_1y ?? 'null'} return_3y_ann=${d.return_3y_ann ?? 'null'} return_5y_ann=${d.return_5y_ann ?? 'null'}
beta_3y=${d.beta_3y ?? 'null'} std_dev_3y=${d.std_dev_3y ?? 'null'} std_dev_5y=${d.std_dev_5y ?? 'null'} sharpe_3y=${d.sharpe_3y ?? 'null'}
52w_high=${d.week52_high ?? 'null'} 52w_low=${d.week52_low ?? 'null'} 52w_range_width=${d.range_52w ?? 'null'}
momentum_1m=${d.momentum_1m ?? 'null'} momentum_3m=${d.momentum_3m ?? 'null'}${JSON_FOOTER(components)}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMutualFundPrompt(d: Record<string, any>, sym: string): string {
  const components = ['returns', 'cost', 'volatility', 'consistency']
  const returnsStr = d.annual_returns_raw?.map((r: { year?: number | string; val?: string | null }) => `${r.year}:${r.val ?? 'N/A'}`).join(', ') ?? 'N/A'
  return `${JSON_HEADER}You are a quant analyst scoring a mutual fund. Focus on historical returns, cost, risk, and consistency.
Components: returns (1Y/3Y/5Y performance), cost (expense ratio — lower=better), volatility (beta or annual range), consistency (standard deviation of annual returns — lower stdev=higher score).

Symbol: ${sym} | Category: ${d.category ?? 'N/A'}
expense_ratio=${d.expense_ratio ?? 'null'} beta=${d.beta ?? 'null'}
return_1y=${d.return_1y ?? 'null'} return_3y_ann=${d.return_3y_ann ?? 'null'} return_5y_ann=${d.return_5y_ann ?? 'null'}
annual_returns=${returnsStr}
consistency_metric=${d.consistency ?? 'null'}
momentum_1m=${d.momentum_1m ?? 'null'} momentum_3m=${d.momentum_3m ?? 'null'}${JSON_FOOTER(components)}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCryptoPrompt(d: Record<string, any>, sym: string): string {
  const components = ['momentum', 'volatility', 'size', 'liquidity', 'trend']
  return `${JSON_HEADER}You are a quant analyst scoring a crypto asset. NO fundamental data exists — score only market/price metrics.
Components: momentum (1D/1W/1M/3M price change — positive=higher), volatility (daily avg change % — lower=higher score for stability), size (market cap in $ — larger=safer=higher score), liquidity (volume/mcap ratio — higher=more liquid=higher score), trend (distance from 52w high — closer to high=higher score).

Symbol: ${sym} | Name: ${d.name ?? 'N/A'}
price=${d.cur_price ?? 'null'} change_1d=${d.change_1d ?? 'null'}
market_cap=${d.market_cap ?? 'null'} volume_24h=${d.volume_24h ?? 'null'} vol_mcap_ratio=${d.vol_mcap_ratio ?? 'null'}
52w_high=${d.week52_high ?? 'null'} 52w_low=${d.week52_low ?? 'null'}
dist_from_52w_high=${d.dist_52w_high ?? 'null'} 52w_range_width=${d.range_52w_pct ?? 'null'}
momentum_1w=${d.momentum_1w ?? 'null'} momentum_1m=${d.momentum_1m ?? 'null'} momentum_3m=${d.momentum_3m ?? 'null'}
avg_daily_volatility=${d.avg_daily_vol ?? 'null'}${JSON_FOOTER(components)}`
}

// ─── Central config map ───────────────────────────────────────────────────────

const ASSET_CONFIG: Record<AssetType, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchData: (sym: string, quote: any) => Promise<Record<string, any>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildPrompt: (data: Record<string, any>, sym: string) => string
  components: string[]
}> = {
  us_stock: {
    fetchData:    (sym) => fetchUsStockData(sym),
    buildPrompt:  buildUsStockPrompt,
    components:   ['growth', 'profitability', 'momentum', 'valuation', 'risk'],
  },
  israel_stock: {
    fetchData:    fetchIsraelStockData,
    buildPrompt:  buildIsraelStockPrompt,
    components:   ['momentum', 'volatility', 'liquidity'],
  },
  etf: {
    fetchData:    (sym) => fetchEtfData(sym),
    buildPrompt:  buildEtfPrompt,
    components:   ['returns', 'cost', 'diversification', 'volatility', 'momentum'],
  },
  mutualfund: {
    fetchData:    (sym) => fetchMutualFundData(sym),
    buildPrompt:  buildMutualFundPrompt,
    components:   ['returns', 'cost', 'volatility', 'consistency'],
  },
  crypto: {
    fetchData:    fetchCryptoData,
    buildPrompt:  buildCryptoPrompt,
    components:   ['momentum', 'volatility', 'size', 'liquidity', 'trend'],
  },
}

// ─── Gemini call ──────────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<Record<string, unknown>> {
  const res = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      systemInstruction: 'You are a JSON-only API. Output valid JSON and nothing else. No markdown, no text outside JSON.',
      maxOutputTokens: 2000,
      responseMimeType: 'application/json',
      temperature: 0.1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      thinkingConfig: { thinkingBudget: 0 } as any,
    },
  })

  const raw = (res.text ?? '').trim()
  console.log(`[ai-score] raw first 150: ${raw.slice(0, 150)}`)

  const clean = raw
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

  try {
    return JSON.parse(clean)
  } catch {
    const match = clean.match(/\{[\s\S]*\}/)
    if (!match) {
      console.error('[ai-score] no JSON found. raw:', raw.slice(0, 500))
      throw new Error('no JSON in Gemini response')
    }
    return JSON.parse(match[0])
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimit(session.user.id, 'ai')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const { symbol: rawSym } = await params
  const sym = rawSym.toUpperCase()

  // ── Israeli numeric paper (Bizportal) ─────────────────────────────────────
  if (/^\d+$/.test(sym)) {
    const cacheType = 'score_israel_numeric'
    const ttlNum    = TTL.israel_stock

    try {
      const cached = await prisma.aiScore.findUnique({
        where: { symbol_type: { symbol: sym, type: cacheType } },
      })
      if (cached && Date.now() - cached.createdAt.getTime() < ttlNum) {
        return NextResponse.json(JSON.parse(cached.scoreJson))
      }
    } catch { /* re-compute */ }

    const biz = await getBizportalPrice(sym)
    if (!biz) {
      return NextResponse.json({ error: 'לא נמצאו נתוני Bizportal לנייר זה', insufficient: true }, { status: 422 })
    }

    const bizNameLower = (biz.name ?? '').toLowerCase()
    if (bizNameLower.includes('כספי') || bizNameLower.includes('money market')) {
      return NextResponse.json({ noScore: true, assetClass: 'money_market', name: biz.name ?? sym })
    }

    const changeStr = biz.changePercent != null ? `${biz.changePercent.toFixed(2)}%` : 'N/A'
    const prompt = `${JSON_HEADER}You are a quant analyst scoring an Israeli financial instrument with VERY LIMITED data (Bizportal only).
Only daily price change is available — score only momentum.

Name: ${biz.name ?? 'N/A'} | PaperId: ${sym}
price=₪${biz.price.toFixed(2)} change_1d=${changeStr}

Components: momentum (positive change >1%→65-80, >3%→80+; negative <-1%→30-45; near zero→45-55; N/A→50)

${JSON_FOOTER(['momentum'])}`

    let scoreData: Record<string, unknown>
    try {
      scoreData = await callGemini(prompt)
    } catch (err) {
      console.error('[ai-score] Bizportal Gemini error:', err)
      return NextResponse.json({ error: 'שגיאת AI — נסה שוב מאוחר יותר' }, { status: 503 })
    }

    for (const f of ['total', 'momentum']) {
      if (typeof scoreData[f] !== 'number') scoreData[f] = 50
      scoreData[f] = Math.max(0, Math.min(100, Math.round(scoreData[f] as number)))
    }

    const result: ScoreResult = {
      assetType: 'israel_stock',
      total:     scoreData.total     as number,
      momentum:  scoreData.momentum  as number,
      explanations: (scoreData.explanations ?? {}) as Record<string, string>,
      partial:      true,
      partialReason: 'ציון חלקי — נייר ישראלי (נתוני Bizportal בלבד)',
    }

    try {
      await prisma.aiScore.upsert({
        where:  { symbol_type: { symbol: sym, type: cacheType } },
        create: { symbol: sym, type: cacheType, scoreJson: JSON.stringify(result) },
        update: { scoreJson: JSON.stringify(result), createdAt: new Date() },
      })
    } catch { /* ignore cache errors */ }

    return NextResponse.json(result)
  }

  // ── Quick quote for type detection ───────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let quote: any = null
  try {
    quote = await yahooFinance.quote(sym, {}, { validateResult: false })
  } catch { /* handled below */ }

  if (!quote) {
    return NextResponse.json({ error: 'לא נמצאו נתוני מחיר לסימבול זה', insufficient: true }, { status: 422 })
  }

  const assetType = detectAssetType(sym, quote.quoteType)
  const ttl = TTL[assetType] ?? TTL.us_stock
  const cacheType = `score_${assetType}`

  // Money market fund: informational card, no numeric score
  if (assetType === 'mutualfund') {
    const fundName = ((quote.longName ?? quote.shortName ?? '') as string).toLowerCase()
    if (fundName.includes('כספי') || fundName.includes('money market')) {
      return NextResponse.json({ noScore: true, assetClass: 'money_market', name: quote.longName ?? quote.shortName ?? sym })
    }
  }

  // ── Cache check ───────────────────────────────────────────────────────────
  try {
    const cached = await prisma.aiScore.findUnique({
      where: { symbol_type: { symbol: sym, type: cacheType } },
    })
    if (cached && Date.now() - cached.createdAt.getTime() < ttl) {
      const parsed = JSON.parse(cached.scoreJson)
      return NextResponse.json(parsed)
    }
  } catch { /* re-compute */ }

  // ── Fetch type-specific data ──────────────────────────────────────────────
  const config = ASSET_CONFIG[assetType]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: Record<string, any>
  try {
    data = await config.fetchData(sym, quote)
  } catch (err) {
    console.error('[ai-score] data fetch error:', err)
    return NextResponse.json({ error: 'שגיאה באיסוף נתונים', insufficient: true }, { status: 422 })
  }

  // Israel stock: check if we have enough data
  const partial = assetType === 'israel_stock' && (data.dataPoints as number) < 3

  // ── Build prompt and call AI ──────────────────────────────────────────────
  const prompt = config.buildPrompt(data, sym)
  let scoreData: Record<string, unknown>
  try {
    scoreData = await callGemini(prompt)
  } catch (err) {
    console.error('[ai-score] Gemini error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'שגיאת AI — נסה שוב מאוחר יותר' }, { status: 503 })
  }

  // ── Validate and clamp scores ─────────────────────────────────────────────
  const allComponents = ['total', ...config.components]
  for (const f of allComponents) {
    if (typeof scoreData[f] !== 'number') scoreData[f] = 50
    scoreData[f] = Math.max(0, Math.min(100, Math.round(scoreData[f] as number)))
  }
  if (!scoreData.explanations || typeof scoreData.explanations !== 'object') {
    scoreData.explanations = {}
  }

  // Attach metadata for client rendering
  const result: ScoreResult = {
    ...(scoreData as Omit<ScoreResult, 'assetType' | 'explanations'>),
    assetType,
    total: scoreData.total as number,
    explanations: scoreData.explanations as Record<string, string>,
    ...(partial ? { partial: true, partialReason: 'ציון חלקי — נתונים מוגבלים לנייר ישראלי זה' } : {}),
  }

  const json = JSON.stringify(result)

  // ── Cache result ──────────────────────────────────────────────────────────
  try {
    await prisma.aiScore.upsert({
      where:  { symbol_type: { symbol: sym, type: cacheType } },
      create: { symbol: sym, type: cacheType, scoreJson: json },
      update: { scoreJson: json, createdAt: new Date() },
    })
  } catch (err) {
    console.error('[ai-score] cache write error:', err)
  }

  return NextResponse.json(result)
}
