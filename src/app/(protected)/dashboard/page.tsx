import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { yahooFinance } from '@/lib/yahoo-finance'
import {
  TrendingUp,
  TrendingDown,
  BarChart2,
  BriefcaseBusiness,
  Eye,
  FlaskConical,
  Bot,
  Star,
  User,
  ShieldCheck,
  LayoutDashboard,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import InvestmentScoreCard from '@/components/investment-score/score-card'

async function getMarketOverview() {
  const INDICES = [
    { symbol: '^GSPC',     name: 'S&P 500'   },
    { symbol: '^IXIC',     name: 'נאסד"ק'    },
    { symbol: '^DJI',      name: "דאו ג'ונס" },
    { symbol: '^TA125.TA', name: 'ת"א 125'   },
  ]
  const results = await Promise.allSettled(
    INDICES.map(({ symbol }) => yahooFinance.quote(symbol, {}, { validateResult: false }))
  )
  return INDICES.map(({ symbol, name }, i) => {
    const r = results[i]
    if (r.status === 'fulfilled' && r.value) {
      const q = r.value as {
        regularMarketPrice?: number
        regularMarketChange?: number
        regularMarketChangePercent?: number
      }
      return { symbol, name, price: q.regularMarketPrice ?? 0, change: q.regularMarketChange ?? 0, changePercent: q.regularMarketChangePercent ?? 0 }
    }
    return { symbol, name, price: 0, change: 0, changePercent: 0 }
  })
}

interface FxRates { usdToIls: number; eurToIls: number; gbpToIls: number }

async function getFxRates(): Promise<FxRates> {
  const [usdR, eurR, gbpR] = await Promise.allSettled([
    yahooFinance.quote('ILS=X',    {}, { validateResult: false }),
    yahooFinance.quote('EURILS=X', {}, { validateResult: false }),
    yahooFinance.quote('GBPILS=X', {}, { validateResult: false }),
  ])
  type Q = { regularMarketPrice?: number }
  const pick = (r: PromiseSettledResult<unknown>, fallback: number) =>
    r.status === 'fulfilled' ? ((r.value as Q)?.regularMarketPrice ?? fallback) : fallback
  return {
    usdToIls: pick(usdR, 3.65),
    eurToIls: pick(eurR, 3.95),
    gbpToIls: pick(gbpR, 4.60),
  }
}

function toIls(amount: number, currency: string, fx: FxRates): number {
  if (currency === 'ILS') return amount
  if (currency === 'EUR') return amount * fx.eurToIls
  if (currency === 'GBP') return amount * fx.gbpToIls
  return amount * fx.usdToIls  // USD + default
}

async function getTopMovers() {
  const tickers = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META']
  try {
    const results = await Promise.allSettled(tickers.map((t) => yahooFinance.quote(t)))
    return results
      .map((r, i) => {
        if (r.status === 'fulfilled') {
          const q = r.value as {
            longName?: string; shortName?: string
            regularMarketPrice?: number; regularMarketChange?: number; regularMarketChangePercent?: number
          }
          return {
            ticker: tickers[i],
            name: q.longName ?? q.shortName ?? tickers[i],
            price: q.regularMarketPrice ?? 0,
            change: q.regularMarketChange ?? 0,
            changePercent: q.regularMarketChangePercent ?? 0,
          }
        }
        return null
      })
      .filter(Boolean) as { ticker: string; name: string; price: number; change: number; changePercent: number }[]
  } catch {
    return []
  }
}

const quickLinks = [
  { href: '/portfolio',    label: 'תיק השקעות',  icon: BriefcaseBusiness, color: '#6366F1' },
  { href: '/watchlist',    label: 'רשימת מעקב',  icon: Eye,               color: '#3B82F6' },
  { href: '/ai-analysis',  label: 'ניתוח AI',    icon: Bot,               color: '#10B981' },
  { href: '/ai-screener',  label: 'סינון AI',    icon: ShieldCheck,       color: '#10B981' },
  { href: '/simulator',    label: 'סימולטור',    icon: FlaskConical,      color: '#F59E0B' },
  { href: '/ai-compare',   label: 'השוואה',      icon: BarChart2,         color: '#6366F1' },
  { href: '/ai-chat',      label: "צ'אט AI",     icon: Star,              color: '#EC4899' },
  { href: '/risk-profile', label: 'פרופיל סיכון', icon: ShieldCheck,      color: '#F97316' },
  { href: '/profile',      label: 'פרופיל',      icon: LayoutDashboard,  color: '#94A3B8' },
]

/* Inline hex for the border-top so CSS custom props work in inline style */
const GREEN = '#10B981'
const RED   = '#F43F5E'

export default async function DashboardPage() {
  const session = await auth()
  const userId  = session?.user?.id as string
  const userName = session?.user?.name?.split(' ')[0] ?? 'משקיע'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'בוקר טוב' : hour < 18 ? 'צהריים טובים' : 'ערב טוב'

  const [holdings, watchlistItems, marketData, topMovers, fxRates] = await Promise.all([
    prisma.holding.findMany({ where: { userId } }),
    prisma.watchlistItem.findMany({ where: { userId }, orderBy: { addedAt: 'desc' }, take: 5 }),
    getMarketOverview(),
    getTopMovers(),
    getFxRates(),
  ])

  const totalCostIls = holdings.reduce(
    (sum, h) => sum + toIls(h.avgPrice * h.quantity, h.currency ?? 'USD', fxRates),
    0
  )

  return (
    <div className="space-y-8">

      {/* ─── Greeting ─────────────────────────────────────────────── */}
      <div className="pt-2">
        <h1 className="font-extrabold" style={{ fontSize: '2rem', color: 'var(--iq-text)', lineHeight: 1.2 }}>
          {greeting},{' '}
          <span className="gradient-text">{userName}</span>!
        </h1>
        <p className="text-sm mt-1.5" style={{ color: 'var(--iq-text-2)' }}>
          {new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ─── Market Overview ──────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--iq-text-3)' }}>
          סקירת שוק
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {marketData.map((m) => {
            const isUp   = m.change >= 0
            const accent = isUp ? GREEN : RED
            const glow   = isUp ? 'var(--iq-green-glow)' : 'var(--iq-red-glow)'
            return (
              <div
                key={m.symbol}
                className="iq-card card-hover relative overflow-hidden"
              >
                {/* colored top border */}
                <div
                  className="absolute top-0 inset-x-0 rounded-t-xl"
                  style={{ height: 3, background: accent }}
                />
                <div className="px-4 pt-5 pb-4">
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--iq-text-3)' }}>
                    {m.name}
                  </p>
                  <p
                    className="font-bold mb-1 font-jakarta"
                    style={{ fontSize: '1.375rem', color: 'var(--iq-text)', letterSpacing: '-0.02em' }}
                  >
                    {m.price > 0
                      ? m.price.toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : '—'}
                  </p>
                  <span
                    className="inline-flex items-center gap-1 text-xs font-semibold font-jakarta"
                    style={{ color: accent }}
                  >
                    {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {m.price > 0
                      ? `${isUp ? '+' : ''}${m.change.toFixed(2)} (${isUp ? '+' : ''}${m.changePercent.toFixed(2)}%)`
                      : 'אין נתונים'}
                  </span>
                  {/* subtle bottom glow */}
                  <div
                    className="absolute bottom-0 inset-x-0 h-8 pointer-events-none"
                    style={{ background: `linear-gradient(to top, ${glow}, transparent)` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ─── Portfolio Summary ────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--iq-text-3)' }}>
            סיכום תיק
          </h2>
          <Link href="/portfolio" className="text-xs font-medium" style={{ color: 'var(--iq-indigo)' }}>
            הצג הכל ←
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Positions count */}
          <div className="iq-card card-hover p-5">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--iq-text-3)' }}>
              אחזקות
            </p>
            <p className="text-3xl font-extrabold mb-1 font-jakarta" style={{ color: 'var(--iq-indigo)', letterSpacing: '-0.03em' }}>
              {holdings.length}
            </p>
            <p className="text-xs" style={{ color: 'var(--iq-text-3)' }}>פוזיציות פתוחות</p>
          </div>

          {/* Total value in ILS */}
          <div className="iq-card card-hover p-5">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--iq-text-3)' }}>
              שווי כולל
            </p>
            <p className="text-3xl font-extrabold mb-1 font-jakarta" style={{ color: 'var(--iq-green)', letterSpacing: '-0.03em' }}>
              {formatCurrency(totalCostIls, 'ILS')}
            </p>
            <p className="text-xs" style={{ color: 'var(--iq-text-3)' }}>
              שער: 1$ = ₪{fxRates.usdToIls.toFixed(2)}
            </p>
          </div>

          {/* Exchange rates */}
          <div className="iq-card card-hover p-5">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--iq-text-3)' }}>
              שערי חליפין
            </p>
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-medium" style={{ color: 'var(--iq-text-2)' }}>1 USD</span>
                <span className="font-bold font-jakarta" style={{ color: 'var(--iq-blue)' }}>₪{fxRates.usdToIls.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-medium" style={{ color: 'var(--iq-text-2)' }}>1 EUR</span>
                <span className="font-bold font-jakarta" style={{ color: 'var(--iq-blue)' }}>₪{fxRates.eurToIls.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-medium" style={{ color: 'var(--iq-text-2)' }}>1 GBP</span>
                <span className="font-bold font-jakarta" style={{ color: 'var(--iq-blue)' }}>₪{fxRates.gbpToIls.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Investment Score ─────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--iq-text-3)' }}>
          ציון השקעה
        </h2>
        <InvestmentScoreCard />
      </section>

      {/* ─── Top Movers + Watchlist ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Top Movers */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--iq-text-3)' }}>
            מובילי השינוי
          </h2>
          <div className="iq-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--iq-border)', color: 'var(--iq-text-3)' }}>
                  <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider">סימול</th>
                  <th className="text-left  px-4 py-3 text-xs font-medium uppercase tracking-wider">מחיר</th>
                  <th className="text-left  px-4 py-3 text-xs font-medium uppercase tracking-wider">שינוי</th>
                </tr>
              </thead>
              <tbody>
                {topMovers.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--iq-text-3)' }}>
                      לא ניתן לטעון נתוני שוק
                    </td>
                  </tr>
                )}
                {topMovers.map((m, idx) => {
                  const isUp   = m.changePercent >= 0
                  const accent = isUp ? GREEN : RED
                  const bg     = isUp ? 'var(--iq-green-glow)' : 'var(--iq-red-glow)'
                  return (
                    <tr
                      key={m.ticker}
                      className="hover:bg-white/[0.025] transition-colors"
                      style={idx < topMovers.length - 1 ? { borderBottom: '1px solid var(--iq-border)' } : undefined}
                    >
                      <td className="px-4 py-3">
                        <Link href={`/stock/${m.ticker}`}>
                          <p className="font-bold text-sm font-jakarta ticker-sym" style={{ color: 'var(--iq-text)' }}>
                            {m.ticker}
                          </p>
                          <p className="text-xs truncate max-w-[130px]" style={{ color: 'var(--iq-text-3)' }}>
                            {m.name}
                          </p>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-left font-semibold font-jakarta price" style={{ color: 'var(--iq-text)' }}>
                        {m.price > 0 ? formatCurrency(m.price) : '—'}
                      </td>
                      <td className="px-4 py-3 text-left">
                        <span
                          className="inline-flex items-center gap-1 text-xs font-semibold font-jakarta px-2 py-0.5 rounded-full"
                          style={{ color: accent, background: bg }}
                        >
                          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {m.price > 0 ? `${isUp ? '+' : ''}${m.changePercent.toFixed(2)}%` : '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Watchlist */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--iq-text-3)' }}>
              רשימת מעקב
            </h2>
            <Link href="/watchlist" className="text-xs font-medium" style={{ color: 'var(--iq-indigo)' }}>
              הצג הכל ←
            </Link>
          </div>
          <div className="iq-card overflow-hidden">
            {watchlistItems.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Star className="w-8 h-8 mx-auto mb-3 opacity-30" style={{ color: 'var(--iq-text-2)' }} />
                <p className="text-sm mb-1" style={{ color: 'var(--iq-text-2)' }}>רשימת המעקב שלך ריקה</p>
                <Link href="/watchlist" className="text-xs font-medium" style={{ color: 'var(--iq-indigo)' }}>
                  הוסף סמל ראשון
                </Link>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--iq-border)', color: 'var(--iq-text-3)' }}>
                    <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider">סימול</th>
                    <th className="text-left  px-4 py-3 text-xs font-medium uppercase tracking-wider">הוסף בתאריך</th>
                    <th className="text-left  px-4 py-3 text-xs font-medium uppercase tracking-wider">פעולה</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlistItems.map((item, idx) => (
                    <tr
                      key={item.id}
                      className="hover:bg-white/[0.025] transition-colors"
                      style={idx < watchlistItems.length - 1 ? { borderBottom: '1px solid var(--iq-border)' } : undefined}
                    >
                      <td className="px-4 py-3 font-bold font-jakarta ticker-sym" style={{ color: 'var(--iq-text)' }}>
                        {item.ticker}
                      </td>
                      <td className="px-4 py-3 text-left text-xs font-jakarta" style={{ color: 'var(--iq-text-3)' }}>
                        {new Date(item.addedAt).toLocaleDateString('he-IL')}
                      </td>
                      <td className="px-4 py-3 text-left">
                        <Link href={`/stock/${item.ticker}`} className="text-xs font-medium" style={{ color: 'var(--iq-indigo)' }}>
                          צפה →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* ─── Quick Links ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--iq-text-3)' }}>
          ניווט מהיר
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
          {quickLinks.map(({ href, label, icon: Icon, color }) => (
            <Link
              key={href}
              href={href}
              className="iq-card card-hover flex flex-col items-center gap-2 p-3 group"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                style={{ background: `${color}18` }}
              >
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <span className="text-xs font-medium text-center leading-tight" style={{ color: 'var(--iq-text-2)' }}>
                {label}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
