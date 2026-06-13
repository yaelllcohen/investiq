import { notFound } from 'next/navigation'
import Link from 'next/link'
import { yahooFinance } from '@/lib/yahoo-finance'
import { getBizportalPrice } from '@/lib/bizportal'
import StockChart from '@/components/charts/stock-chart'
import AddToWatchlistButton from '@/components/watchlist/add-button'
import AddToPortfolioButton from '@/components/portfolio/add-button'
import ScoreCard from '@/components/stock/score-card'
import WhyMoving from '@/components/stock/why-moving'
import { formatCurrency, formatNumber, formatPercent, getBgChangeColor } from '@/lib/utils'
import { Bot, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface StockPageProps {
  params: Promise<{ ticker: string }>
}

export default async function StockPage({ params }: StockPageProps) {
  const { ticker } = await params
  let symbol = decodeURIComponent(ticker).toUpperCase()

  // ── Israeli paper number path (Bizportal) ─────────────────────────────────
  if (/^\d+$/.test(symbol)) {
    const biz = await getBizportalPrice(symbol)
    if (!biz) notFound()

    const bizName   = biz.name ?? symbol
    const bizChange = biz.changePercent

    // Try Yahoo Finance .TA for chart history and a fresher price
    const yahooTicker = symbol + '.TA'
    let hasYahooChart = false
    let displayPrice  = biz.price
    try {
      const since = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const yaChart = await yahooFinance.chart(yahooTicker, { period1: since, interval: '1d' as const }, { validateResult: false } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const quotes: any[] = (yaChart as any)?.quotes ?? []
      if (quotes.length >= 5) {
        hasYahooChart = true
        const lastClose = quotes[quotes.length - 1]?.close
        if (typeof lastClose === 'number' && lastClose > 0) displayPrice = lastClose
      }
    } catch { /* no Yahoo chart data — stay with Bizportal price */ }

    return (
      <div className="space-y-6">
        <nav className="flex items-center gap-1.5 text-sm" style={{ color: '#64748b' }}>
          <Link href="/dashboard" className="hover:underline" style={{ color: '#64748b' }}>בית</Link>
          <ChevronLeft className="w-3.5 h-3.5" />
          <Link href="/portfolio" className="hover:underline" style={{ color: '#64748b' }}>תיק</Link>
          <ChevronLeft className="w-3.5 h-3.5" />
          <span style={{ color: '#e2e8f0' }}>{symbol}</span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-4xl font-extrabold tracking-tight" style={{ color: '#e2e8f0' }}>{symbol}</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded border"
                style={{ borderColor: 'rgba(59,130,246,0.4)', color: '#3b82f6', background: 'rgba(59,130,246,0.1)' }}>
                נייר ישראלי 🇮🇱
              </span>
            </div>
            <p className="text-lg mt-0.5" style={{ color: '#94a3b8' }}>{bizName}</p>
          </div>
          <div className="text-left">
            <div className="text-4xl font-bold mb-1" style={{ color: '#e2e8f0' }}>
              {formatCurrency(displayPrice, 'ILS')}
            </div>
            {bizChange !== null && (
              <span className={`inline-flex items-center text-sm font-semibold px-3 py-1 rounded-full ${getBgChangeColor(bizChange)}`}>
                {bizChange >= 0 ? '+' : ''}{bizChange.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        {/* Chart — Yahoo Finance .TA if available, otherwise placeholder */}
        {hasYahooChart ? (
          <StockChart ticker={yahooTicker} currentPrice={displayPrice} />
        ) : (
          <div className="rounded-xl p-5 border border-white/5 flex items-center gap-2 text-sm"
            style={{ background: '#111827', color: '#64748b' }}>
            <span>📊</span>
            <span>נתוני גרף אינם זמינים לנייר זה</span>
          </div>
        )}

        {/* ScoreCard — already shows partial warning when partial:true */}
        <ScoreCard symbol={symbol} />

        <div className="flex flex-wrap items-center gap-3">
          <AddToWatchlistButton ticker={symbol} />
          <AddToPortfolioButton ticker={symbol} name={bizName} currentPrice={displayPrice} />
        </div>

        <section>
          <h2 className="text-lg font-semibold mb-4" style={{ color: '#e2e8f0' }}>מדדים מרכזיים</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'מחיר',       value: formatCurrency(displayPrice, 'ILS') },
              { label: 'שינוי יומי', value: bizChange !== null ? `${bizChange >= 0 ? '+' : ''}${bizChange.toFixed(2)}%` : '—' },
              { label: 'מקור',       value: hasYahooChart ? 'Yahoo Finance' : 'Bizportal' },
            ].map(m => (
              <div key={m.label} className="rounded-xl p-4 border border-white/5" style={{ background: '#111827' }}>
                <div className="text-xs mb-1 font-medium uppercase tracking-wide" style={{ color: '#64748b' }}>{m.label}</div>
                <div className="text-lg font-semibold truncate" style={{ color: '#e2e8f0' }}>{m.value}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let quote: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let summary: any = null

  const [quoteResult, summaryResult] = await Promise.allSettled([
    yahooFinance.quote(symbol, {}, { validateResult: false }),
    yahooFinance.quoteSummary(
      symbol,
      { modules: ['summaryDetail', 'assetProfile', 'defaultKeyStatistics'] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { validateResult: false } as any
    ),
  ])

  quote   = quoteResult.status   === 'fulfilled' ? quoteResult.value   : null
  summary = summaryResult.status === 'fulfilled' ? summaryResult.value : null

  // Retry with .TA suffix for Israeli stocks not found under plain ticker
  if (!quote && !symbol.endsWith('.TA') && !symbol.includes('-') && !/^\d+$/.test(symbol)) {
    const taSym = symbol + '.TA'
    try {
      const [q2, s2] = await Promise.allSettled([
        yahooFinance.quote(taSym, {}, { validateResult: false }),
        yahooFinance.quoteSummary(
          taSym,
          { modules: ['summaryDetail', 'assetProfile', 'defaultKeyStatistics'] },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { validateResult: false } as any
        ),
      ])
      quote   = q2.status === 'fulfilled' ? q2.value   : null
      summary = s2.status === 'fulfilled' ? s2.value   : null
      if (quote) symbol = taSym
    } catch { /* fall through to notFound */ }
  }

  if (!quote) notFound()

  const q = quote as {
    regularMarketPrice?: number
    regularMarketChange?: number
    regularMarketChangePercent?: number
    longName?: string
    shortName?: string
    regularMarketVolume?: number
    marketCap?: number
    trailingPE?: number
    fiftyTwoWeekHigh?: number
    fiftyTwoWeekLow?: number
    beta?: number
    dividendYield?: number
    exchange?: string
    currency?: string
    quoteType?: string
    circulatingSupply?: number
    fromCurrency?: string
    toCurrency?: string
  }
  const price = q.regularMarketPrice ?? 0
  const change = q.regularMarketChange ?? 0
  const changePercent = q.regularMarketChangePercent ?? 0
  const companyName = q.longName ?? q.shortName ?? symbol

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = summary as any
  const summaryDetail = s?.summaryDetail as Record<string, number | string | null> | undefined
  const assetProfile = s?.assetProfile as Record<string, number | string | null> | undefined
  const keyStats = s?.defaultKeyStatistics as Record<string, number | string | null> | undefined

  // ── Risk & Horizon ──────────────────────────────────────────────────────────
  const betaRaw = summaryDetail?.beta ?? keyStats?.beta
  const beta = typeof betaRaw === 'number' ? betaRaw : null
  const qType = (q.quoteType ?? '').toUpperCase()
  const isCrypto = qType === 'CRYPTOCURRENCY'

  const metrics: { label: string; value: string }[] = isCrypto
    ? [
        { label: 'מחיר', value: price > 0 ? formatCurrency(price) : '—' },
        { label: 'נפח 24ש׳', value: q.regularMarketVolume ? formatNumber(q.regularMarketVolume) : '—' },
        { label: 'שווי שוק', value: q.marketCap ? formatNumber(q.marketCap) : '—' },
        { label: 'היצע מחזורי', value: q.circulatingSupply ? formatNumber(q.circulatingSupply) : '—' },
        { label: 'שיא 52 שבועות', value: q.fiftyTwoWeekHigh ? formatCurrency(q.fiftyTwoWeekHigh) : '—' },
        { label: 'שפל 52 שבועות', value: q.fiftyTwoWeekLow ? formatCurrency(q.fiftyTwoWeekLow) : '—' },
      ]
    : [
        { label: 'מחיר', value: price > 0 ? formatCurrency(price) : '—' },
        { label: 'נפח', value: q.regularMarketVolume ? formatNumber(q.regularMarketVolume) : '—' },
        { label: 'שווי שוק', value: q.marketCap ? formatNumber(q.marketCap) : '—' },
        {
          label: 'מכפיל רווח',
          value: summaryDetail?.trailingPE
            ? Number(summaryDetail.trailingPE).toFixed(2)
            : q.trailingPE
            ? (q.trailingPE as number).toFixed(2)
            : '—',
        },
        {
          label: 'רווח למניה',
          value: keyStats?.trailingEps ? `$${Number(keyStats.trailingEps).toFixed(2)}` : '—',
        },
        { label: 'שיא 52 שבועות', value: q.fiftyTwoWeekHigh ? formatCurrency(q.fiftyTwoWeekHigh) : '—' },
        { label: 'שפל 52 שבועות', value: q.fiftyTwoWeekLow ? formatCurrency(q.fiftyTwoWeekLow) : '—' },
        {
          label: 'בטא',
          value: summaryDetail?.beta
            ? (summaryDetail.beta as number).toFixed(2)
            : keyStats?.beta
            ? (keyStats.beta as number).toFixed(2)
            : '—',
        },
        {
          label: 'תשואת דיבידנד',
          value: summaryDetail?.dividendYield
            ? `${((summaryDetail.dividendYield as number) * 100).toFixed(2)}%`
            : '—',
        },
        { label: 'סקטור', value: (assetProfile as { sector?: string } | null)?.sector ?? '—' },
      ]

  const risk = (() => {
    if (qType === 'CRYPTOCURRENCY') return { label: 'גבוה',       color: '#ef4444', dot: '#ef4444' }
    if (qType === 'BOND' || qType === 'FIXED_INCOME') return { label: 'נמוך', color: '#22c55e', dot: '#22c55e' }
    if (beta == null) {
      if (qType === 'ETF' || qType === 'MUTUALFUND') return { label: 'נמוך-בינוני', color: '#f59e0b', dot: '#f59e0b' }
      return { label: 'בינוני', color: '#f59e0b', dot: '#f59e0b' }
    }
    if (beta < 0.8)  return { label: 'נמוך',   color: '#22c55e', dot: '#22c55e' }
    if (beta <= 1.5) return { label: 'בינוני',  color: '#f59e0b', dot: '#f59e0b' }
    return             { label: 'גבוה',       color: '#ef4444', dot: '#ef4444' }
  })()

  const horizon = (() => {
    if (qType === 'CRYPTOCURRENCY') return { label: 'קצר',        detail: '< 1 שנה',   color: '#ef4444' }
    if (qType === 'BOND' || qType === 'FIXED_INCOME') return { label: 'ארוך', detail: '5+ שנים', color: '#22c55e' }
    if (qType === 'ETF' || qType === 'MUTUALFUND') return { label: 'ארוך',   detail: '3+ שנים', color: '#22c55e' }
    if (beta == null) return { label: 'בינוני',  detail: '1-5 שנים', color: '#f59e0b' }
    if (beta < 0.8)   return { label: 'ארוך',    detail: '5+ שנים',  color: '#22c55e' }
    if (beta <= 1.5)  return { label: 'בינוני',  detail: '1-5 שנים', color: '#f59e0b' }
    return              { label: 'קצר-בינוני', detail: '< 2 שנים', color: '#ef4444' }
  })()

  const description =
    (assetProfile as { longBusinessSummary?: string } | null)?.longBusinessSummary

  return (
    <div className="space-y-6">
      {/* ─── Breadcrumb ─── */}
      <nav className="flex items-center gap-1.5 text-sm" style={{ color: '#64748b' }}>
        <Link href="/dashboard" className="hover:underline" style={{ color: '#64748b' }}>
          בית
        </Link>
        <ChevronLeft className="w-3.5 h-3.5" />
        <Link href="/dashboard" className="hover:underline" style={{ color: '#64748b' }}>
          מניה
        </Link>
        <ChevronLeft className="w-3.5 h-3.5" />
        <span style={{ color: '#e2e8f0' }}>{symbol}</span>
      </nav>

      {/* ─── Stock Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-4xl font-extrabold tracking-tight" style={{ color: '#e2e8f0' }}>
              {symbol}
            </h1>
            {isCrypto ? (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded border"
                style={{ borderColor: 'rgba(245,158,11,0.4)', color: '#f59e0b', background: 'rgba(245,158,11,0.1)' }}
              >
                🟡 קריפטו
              </span>
            ) : (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded border"
                style={{ borderColor: '#334155', color: '#64748b', background: 'rgba(51,65,85,0.3)' }}
              >
                {q.exchange ?? 'NASDAQ'} &middot; {q.currency ?? 'USD'}
              </span>
            )}
          </div>
          <p className="text-lg mt-0.5" style={{ color: '#94a3b8' }}>
            {companyName}
          </p>
        </div>

        <div className="text-left">
          <div className="text-4xl font-bold mb-1" style={{ color: '#e2e8f0' }}>
            {price > 0 ? formatCurrency(price) : '—'}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full ${getBgChangeColor(changePercent)}`}
            >
              {changePercent >= 0 ? '+' : ''}
              {change.toFixed(2)} ({changePercent >= 0 ? '+' : ''}
              {changePercent.toFixed(2)}%)
            </span>
            <WhyMoving symbol={symbol} />
          </div>
        </div>
      </div>

      {/* ─── Chart ─── */}
      <StockChart ticker={symbol} currentPrice={price} />

      {/* ─── AI Score ─── */}
      <ScoreCard symbol={symbol} />

      {/* ─── Action Buttons ─── */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/ai-analysis/${symbol}`}>
          <Button
            size="sm"
            className="gap-2"
            style={{ background: '#3b82f6', color: '#fff' }}
          >
            <Bot className="w-4 h-4" />
            ניתוח AI
          </Button>
        </Link>
        <AddToWatchlistButton ticker={symbol} />
        <AddToPortfolioButton ticker={symbol} name={companyName} currentPrice={price} />
      </div>

      {/* ─── Key Metrics ─── */}
      <section>
        <h2 className="text-lg font-semibold mb-4" style={{ color: '#e2e8f0' }}>
          מדדים מרכזיים
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-xl p-4 border border-white/5"
              style={{ background: '#111827' }}
            >
              <div className="text-xs mb-1 font-medium uppercase tracking-wide" style={{ color: '#64748b' }}>
                {m.label}
              </div>
              <div className="text-lg font-semibold truncate" style={{ color: '#e2e8f0' }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Risk & Investment Horizon ─── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-4 border border-white/5" style={{ background: '#111827' }}>
          <div className="text-xs mb-2 font-medium uppercase tracking-wide" style={{ color: '#64748b' }}>
            רמת סיכון
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: risk.dot }} />
            <span className="text-xl font-bold" style={{ color: risk.color }}>{risk.label}</span>
          </div>
          {beta != null && (
            <p className="text-xs" style={{ color: '#64748b' }}>
              Beta: {beta.toFixed(2)}{beta < 0.8 ? ' — פחות תנודתי מהשוק' : beta <= 1.5 ? ' — תנודתיות דומה לשוק' : ' — תנודתי מהשוק'}
            </p>
          )}
        </div>
        <div className="rounded-xl p-4 border border-white/5" style={{ background: '#111827' }}>
          <div className="text-xs mb-2 font-medium uppercase tracking-wide" style={{ color: '#64748b' }}>
            טווח השקעה מומלץ
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl font-bold" style={{ color: horizon.color }}>{horizon.label}</span>
          </div>
          <p className="text-xs" style={{ color: '#64748b' }}>{horizon.detail}</p>
        </div>
      </div>

      {/* ─── Company Description ─── */}
      {description && (
        <section>
          <h2 className="text-lg font-semibold mb-3" style={{ color: '#e2e8f0' }}>
            אודות {companyName}
          </h2>
          <div
            className="rounded-xl p-5 border border-white/5 text-sm leading-relaxed"
            style={{ background: '#111827', color: '#94a3b8' }}
          >
            {description.length > 800 ? (
              <>
                {description.slice(0, 800)}
                <span style={{ color: '#64748b' }}>&hellip;</span>
              </>
            ) : (
              description
            )}
          </div>
        </section>
      )}

      {/* ─── Exchange / Currency Info ─── */}
      <div className="flex flex-wrap gap-4 text-xs pb-4" style={{ color: '#64748b' }}>
        {(q as { fullExchangeName?: string }).fullExchangeName && (
          <span>
            בורסה: <span style={{ color: '#94a3b8' }}>{(q as { fullExchangeName?: string }).fullExchangeName}</span>
          </span>
        )}
        {q.currency && (
          <span>
            מטבע: <span style={{ color: '#94a3b8' }}>{q.currency}</span>
          </span>
        )}
        {q.quoteType && (
          <span>
            סוג: <span style={{ color: '#94a3b8' }}>{q.quoteType}</span>
          </span>
        )}
        {(assetProfile as { country?: string } | null)?.country && (
          <span>
            מדינה:{' '}
            <span style={{ color: '#94a3b8' }}>
              {(assetProfile as { country?: string }).country}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
