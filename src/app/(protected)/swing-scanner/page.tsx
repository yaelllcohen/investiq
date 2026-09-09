'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, RefreshCw, Loader2, RotateCcw, Star, X } from 'lucide-react'

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

interface ScanResponse {
  results: ScanRow[]
  scannedCount: number
  computedCount: number
  generatedAt: string
  cached: boolean
  error?: string
  rateLimited?: boolean
}

interface Filters {
  changeMin: number     // %
  marketCapMinB: number // billions; 0 = no minimum
  marketCapMaxB: number // billions; 0 = no maximum
  priceMin: number
  volumeMin: number
  gapMin: number         // %; <= -999 = no minimum
  rsiMin: number
  rsiMax: number
  aboveSma200: boolean
}

// Baseline where every filter is wide open — presets start from this and only
// override the dimensions they actually specify.
const OPEN_FILTERS: Filters = {
  changeMin: -1000, marketCapMinB: 0, marketCapMaxB: 0, priceMin: 0, volumeMin: 0,
  gapMin: -1000, rsiMin: 0, rsiMax: 100, aboveSma200: false,
}

const DEFAULT_FILTERS: Filters = {
  ...OPEN_FILTERS,
  changeMin: 3, marketCapMinB: 1, priceMin: 1, volumeMin: 500_000, aboveSma200: true,
}

const PRESETS: { label: string; filters: Filters }[] = [
  { label: 'Afterhours Scan', filters: { ...OPEN_FILTERS, priceMin: 1, volumeMin: 200_000, changeMin: 10 } },
  { label: 'Premarket Gap Small Cap', filters: { ...OPEN_FILTERS, priceMin: 1.5, volumeMin: 200_000, gapMin: 3, marketCapMaxB: 0.8 } },
  { label: 'Midday Scan', filters: { ...OPEN_FILTERS, priceMin: 1, volumeMin: 500_000, changeMin: 10, marketCapMaxB: 0.8 } },
  { label: 'Midday Swing', filters: { ...OPEN_FILTERS, priceMin: 1, volumeMin: 500_000, marketCapMinB: 0.8 } },
  { label: 'סווינג ישראלי', filters: { ...OPEN_FILTERS, aboveSma200: true, rsiMin: 40, rsiMax: 65, volumeMin: 100_000 } },
]

function fmtCompact(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return n.toLocaleString('he-IL')
}

const IL_TZ = 'Asia/Jerusalem'

// Mirrors the server's trading-day cache rule (Sun–Thu trading, Fri–Sat
// weekend) to describe how fresh the currently-shown scan is.
function formatScanTime(generatedAtIso: string): string {
  const generated = new Date(generatedAtIso)
  const now = new Date()
  const diffMs = now.getTime() - generated.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffMs / (24 * 3600_000))

  const dateStr = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: IL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const timeStr = (d: Date) => d.toLocaleTimeString('he-IL', { timeZone: IL_TZ, hour: '2-digit', minute: '2-digit' })

  if (dateStr(generated) === dateStr(now)) {
    if (diffMin < 1) return 'נסרק זה עתה'
    if (diffMin < 60) return `נסרק לפני ${diffMin} דקות`
    return `נסרק היום בשעה ${timeStr(generated)} (לפני ${diffHours} שעות)`
  }

  const nowWeekday = new Intl.DateTimeFormat('en-US', { timeZone: IL_TZ, weekday: 'short' }).format(now)
  if (nowWeekday === 'Sat') {
    return `נסרקה ביום שישי האחרון בשעה ${timeStr(generated)}`
  }

  if (diffDays <= 1) return 'נסרק אתמול — לחץ לסריקה חדשה'
  return `נסרק לפני ${diffDays} ימים — לחץ לסריקה חדשה`
}

export default function SwingScannerPage() {
  const [data, setData] = useState<ScanResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [activePreset, setActivePreset] = useState<string | null>(null)

  // bareSymbol -> actual stored ticker (Israeli entries are stored with .TA)
  const [watchlist, setWatchlist] = useState<Map<string, string>>(new Map())
  const [watchlistBusy, setWatchlistBusy] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/watchlist')
      .then(r => r.ok ? r.json() : [])
      .then((items: { ticker: string }[]) => {
        const map = new Map<string, string>()
        for (const it of items) map.set(it.ticker.replace(/\.TA$/, ''), it.ticker)
        setWatchlist(map)
      })
      .catch(() => { /* ignore */ })
  }, [])

  const toggleWatchlist = useCallback(async (bareSymbol: string, isIsraeli: boolean) => {
    setWatchlistBusy(prev => {
      if (prev.has(bareSymbol)) return prev
      return new Set(prev).add(bareSymbol)
    })
    try {
      const stored = watchlist.get(bareSymbol)
      if (stored) {
        await fetch(`/api/watchlist?ticker=${encodeURIComponent(stored)}`, { method: 'DELETE' })
        setWatchlist(prev => { const next = new Map(prev); next.delete(bareSymbol); return next })
      } else {
        const res = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: isIsraeli ? `${bareSymbol}.TA` : bareSymbol }),
        })
        if (res.ok) {
          const item: { ticker: string } = await res.json()
          setWatchlist(prev => new Map(prev).set(bareSymbol, item.ticker))
        }
      }
    } catch { /* ignore */ }
    finally {
      setWatchlistBusy(prev => { const next = new Set(prev); next.delete(bareSymbol); return next })
    }
  }, [watchlist])

  const runScan = useCallback((force: boolean) => {
    setLoading(true)
    setError(null)
    fetch(`/api/swing-scanner${force ? '?force=1' : ''}`)
      .then(async r => {
        const d: ScanResponse = await r.json()
        if (!r.ok || d.error) { setError(d.error ?? 'שגיאה בסריקה'); return }
        setData(d)
      })
      .catch(() => setError('שגיאת רשת — נסה שוב'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.results
      .filter(r =>
        r.changePercent >= filters.changeMin &&
        (filters.marketCapMinB <= 0 || (r.marketCap ?? 0) >= filters.marketCapMinB * 1e9) &&
        (filters.marketCapMaxB <= 0 || (r.marketCap ?? Infinity) <= filters.marketCapMaxB * 1e9) &&
        r.price >= filters.priceMin &&
        r.volume >= filters.volumeMin &&
        (filters.gapMin <= -999 || (r.gapPercent != null && r.gapPercent >= filters.gapMin)) &&
        r.rsi != null && r.rsi >= filters.rsiMin && r.rsi <= filters.rsiMax &&
        (!filters.aboveSma200 || (r.sma200 != null && r.price > r.sma200))
      )
      .sort((a, b) => b.changePercent - a.changePercent)
  }, [data, filters])

  const setF = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setActivePreset(null)
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const applyPreset = (preset: { label: string; filters: Filters }) => {
    setActivePreset(preset.label)
    setFilters(preset.filters)
  }

  const resetFilters = () => {
    setActivePreset(null)
    setFilters(DEFAULT_FILTERS)
  }

  return (
    <div className="space-y-6">
      {/* ─── Breadcrumb ─── */}
      <nav className="flex items-center gap-1.5 text-sm" style={{ color: '#64748b' }}>
        <Link href="/dashboard" className="hover:underline" style={{ color: '#64748b' }}>בית</Link>
        <ChevronLeft className="w-3.5 h-3.5" />
        <span style={{ color: '#e2e8f0' }}>סורק סווינג</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: '#e2e8f0' }}>סורק סווינג</h1>
          <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>
            כל מניות ⁦S&amp;P 500⁩ ומניות ישראליות פופולריות — סנן דינמית כמו ב-Finviz
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            onClick={() => runScan(!!data)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: '#3b82f6', color: '#fff' }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {loading ? 'סורק...' : data ? 'סרוק מחדש 🔄' : 'סרוק 🔍'}
          </button>
          {data && !loading && (
            <span className="text-[10px]" style={{ color: '#64748b' }}>{formatScanTime(data.generatedAt)}</span>
          )}
        </div>
      </div>

      {/* ─── Saved for review ─── */}
      {watchlist.size > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>שמורים לבדיקה</span>
          <div className="flex flex-wrap gap-2">
            {[...watchlist.entries()].map(([bare, stored]) => (
              <div key={stored}
                className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full text-xs font-medium"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                <Link href={`/stock/${bare}`} className="hover:underline">{bare}</Link>
                <button
                  onClick={() => toggleWatchlist(bare, stored.endsWith('.TA'))}
                  disabled={watchlistBusy.has(bare)}
                  title="הסר משמורים"
                  className="hover:text-red-400 transition-colors disabled:opacity-40"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Presets ─── */}
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>תבניות סריקה מוכנות</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={activePreset === p.label
                ? { background: 'rgba(99,102,241,0.2)', border: '1px solid #6366f1', color: '#818cf8' }
                : { background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8' }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Filter bar ─── */}
      <div className="rounded-xl p-4 border border-white/5" style={{ background: '#111827' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>פילטרים</span>
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 text-xs hover:underline"
            style={{ color: '#64748b' }}
          >
            <RotateCcw className="h-3 w-3" /> אפס
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium" style={{ color: '#64748b' }}>שינוי % מעל</span>
            <input type="number" step="0.5" value={filters.changeMin}
              onChange={e => setF('changeMin', parseFloat(e.target.value) || 0)}
              className="px-2 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: '#0d1117', border: '1px solid #1e293b', color: '#e2e8f0' }} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium" style={{ color: '#64748b' }}>Gap % מעל</span>
            <input type="number" step="0.5" value={filters.gapMin}
              onChange={e => setF('gapMin', parseFloat(e.target.value) || 0)}
              className="px-2 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: '#0d1117', border: '1px solid #1e293b', color: '#e2e8f0' }} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium" style={{ color: '#64748b' }}>מחיר מעל</span>
            <input type="number" step="0.5" min="0" value={filters.priceMin}
              onChange={e => setF('priceMin', parseFloat(e.target.value) || 0)}
              className="px-2 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: '#0d1117', border: '1px solid #1e293b', color: '#e2e8f0' }} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium" style={{ color: '#64748b' }}>נפח מעל</span>
            <input type="number" step="50000" min="0" value={filters.volumeMin}
              onChange={e => setF('volumeMin', parseFloat(e.target.value) || 0)}
              className="px-2 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: '#0d1117', border: '1px solid #1e293b', color: '#e2e8f0' }} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium" style={{ color: '#64748b' }}>שווי שוק מעל ($B)</span>
            <input type="number" step="0.1" min="0" value={filters.marketCapMinB}
              onChange={e => setF('marketCapMinB', parseFloat(e.target.value) || 0)}
              className="px-2 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: '#0d1117', border: '1px solid #1e293b', color: '#e2e8f0' }} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium" style={{ color: '#64748b' }}>שווי שוק עד ($B, 0=ללא)</span>
            <input type="number" step="0.1" min="0" value={filters.marketCapMaxB}
              onChange={e => setF('marketCapMaxB', parseFloat(e.target.value) || 0)}
              className="px-2 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: '#0d1117', border: '1px solid #1e293b', color: '#e2e8f0' }} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium" style={{ color: '#64748b' }}>RSI בין</span>
            <div className="flex items-center gap-1">
              <input type="number" min="0" max="100" value={filters.rsiMin}
                onChange={e => setF('rsiMin', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1.5 rounded-lg text-sm outline-none"
                style={{ background: '#0d1117', border: '1px solid #1e293b', color: '#e2e8f0' }} />
              <span style={{ color: '#475569' }}>—</span>
              <input type="number" min="0" max="100" value={filters.rsiMax}
                onChange={e => setF('rsiMax', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1.5 rounded-lg text-sm outline-none"
                style={{ background: '#0d1117', border: '1px solid #1e293b', color: '#e2e8f0' }} />
            </div>
          </label>
          <label className="flex flex-col gap-1 justify-end">
            <span className="text-[10px] font-medium" style={{ color: '#64748b' }}>מגמה</span>
            <button
              onClick={() => setF('aboveSma200', !filters.aboveSma200)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={filters.aboveSma200
                ? { background: 'rgba(34,197,94,0.15)', border: '1px solid #22c55e', color: '#22c55e' }
                : { background: '#0d1117', border: '1px solid #1e293b', color: '#64748b' }}
            >
              {filters.aboveSma200 ? '✅' : '⬜'} מעל SMA200
            </button>
          </label>
        </div>
      </div>

      {/* ─── Error ─── */}
      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
          ⚠ {error}
        </div>
      )}

      {/* ─── Loading skeleton ─── */}
      {loading && !data && (
        <div className="rounded-xl p-10 flex flex-col items-center justify-center gap-3" style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.05)' }}>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#3b82f6' }} />
          <p className="text-sm" style={{ color: '#64748b' }}>סורק את כל מניות S&amp;P 500 — זה עשוי לקחת עד דקה...</p>
        </div>
      )}

      {/* ─── Idle — nothing scanned yet ─── */}
      {!loading && !data && !error && (
        <div className="rounded-xl p-10 text-center" style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-sm" style={{ color: '#94a3b8' }}>הגדר פילטרים ולחץ &quot;סרוק&quot; כדי להתחיל</p>
        </div>
      )}

      {/* ─── Results ─── */}
      {data && !loading && (
        <>
          <div className="flex items-center justify-between text-xs" style={{ color: '#64748b' }}>
            <span>
              נסרקו {data.scannedCount} מניות ({data.computedCount} עם נתונים) · <b style={{ color: '#e2e8f0' }}>{filtered.length}</b> עומדות בפילטרים
            </span>
            <span>
              {data.cached ? 'תוצאה שמורה · ' : ''}עודכן {new Date(data.generatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl p-10 text-center" style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-sm" style={{ color: '#94a3b8' }}>אין מניות שעומדות בכל הפילטרים כרגע</p>
              <p className="text-xs mt-1" style={{ color: '#64748b' }}>נסה להקל את הפילטרים או לסרוק שוב מאוחר יותר</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/5 overflow-x-auto" style={{ background: '#111827' }}>
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="text-right border-b border-white/5" style={{ color: '#64748b' }}>
                    {['סימבול', 'מחיר', 'נפח', 'מחזור $', 'Gap %', 'שינוי %', 'שווי שוק', 'Float', 'Insiders %'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <tr key={row.symbol} className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.03]">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => toggleWatchlist(row.symbol, row.isIsraeli)}
                            disabled={watchlistBusy.has(row.symbol)}
                            title={watchlist.has(row.symbol) ? 'הסר ממעקב' : 'שמור למעקב'}
                            className="shrink-0 transition-transform hover:scale-110 disabled:opacity-40"
                          >
                            <Star className="h-3.5 w-3.5" fill={watchlist.has(row.symbol) ? '#f59e0b' : 'none'} style={{ color: '#f59e0b' }} />
                          </button>
                          <Link href={`/stock/${row.symbol}`} className="flex items-center gap-1.5 font-bold hover:underline" style={{ color: '#e2e8f0' }}>
                            {row.symbol}
                            {row.isIsraeli && (
                              <span className="text-[9px] px-1 py-0.5 rounded"
                                style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>
                                🇮🇱
                              </span>
                            )}
                          </Link>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-medium tabular-nums" style={{ color: '#e2e8f0' }}>{row.price.toFixed(2)}</td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: '#94a3b8' }}>{fmtCompact(row.volume)}</td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: '#94a3b8' }}>{fmtCompact(row.price * row.volume)}</td>
                      <td className="px-3 py-2.5 font-medium tabular-nums" style={{ color: row.gapPercent == null ? '#64748b' : row.gapPercent >= 0 ? '#22c55e' : '#ef4444' }}>
                        {row.gapPercent != null ? `${row.gapPercent >= 0 ? '+' : ''}${row.gapPercent.toFixed(2)}%` : '—'}
                      </td>
                      <td className="px-3 py-2.5 font-semibold tabular-nums" style={{ color: row.changePercent >= 0 ? '#22c55e' : '#ef4444' }}>
                        {row.changePercent >= 0 ? '+' : ''}{row.changePercent.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: '#94a3b8' }}>{fmtCompact(row.marketCap)}</td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: '#94a3b8' }}>{fmtCompact(row.floatShares)}</td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: '#94a3b8' }}>{row.insidersPct != null ? `${row.insidersPct.toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-center pb-4" style={{ color: '#334155' }}>
        לצורכי לימוד בלבד — אין לראות בכך ייעוץ השקעות
      </p>
    </div>
  )
}
