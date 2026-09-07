'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, RefreshCw, Loader2, RotateCcw } from 'lucide-react'

interface ScanRow {
  symbol: string
  isIsraeli: boolean
  price: number
  changePercent: number
  marketCap: number | null
  volume: number
  sma200: number | null
  rsi: number | null
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
  changeMin: number   // %
  marketCapMinB: number // billions
  priceMin: number
  volumeMin: number
  rsiMin: number
  rsiMax: number
  aboveSma200: boolean
}

const DEFAULT_FILTERS: Filters = {
  changeMin: 0,
  marketCapMinB: 1,
  priceMin: 1,
  volumeMin: 500_000,
  rsiMin: 40,
  rsiMax: 70,
  aboveSma200: true,
}

function fmtCap(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`
  return n.toLocaleString('he-IL')
}

function fmtVol(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return n.toLocaleString('he-IL')
}

export default function SwingScannerPage() {
  const [data, setData] = useState<ScanResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)

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

  useEffect(() => { runScan(false) }, [runScan])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.results
      .filter(r =>
        r.changePercent >= filters.changeMin &&
        (filters.marketCapMinB <= 0 || (r.marketCap ?? 0) >= filters.marketCapMinB * 1e9) &&
        r.price >= filters.priceMin &&
        r.volume >= filters.volumeMin &&
        r.rsi != null && r.rsi >= filters.rsiMin && r.rsi <= filters.rsiMax &&
        (!filters.aboveSma200 || (r.sma200 != null && r.price > r.sma200))
      )
      .sort((a, b) => b.changePercent - a.changePercent)
  }, [data, filters])

  const setF = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters(prev => ({ ...prev, [key]: value }))

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
        <button
          onClick={() => runScan(true)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 shrink-0"
          style={{ background: '#3b82f6', color: '#fff' }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {loading ? 'סורק...' : 'סרוק שוב'}
        </button>
      </div>

      {/* ─── Filter bar ─── */}
      <div className="rounded-xl p-4 border border-white/5" style={{ background: '#111827' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>פילטרים</span>
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="flex items-center gap-1 text-xs hover:underline"
            style={{ color: '#64748b' }}
          >
            <RotateCcw className="h-3 w-3" /> אפס
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium" style={{ color: '#64748b' }}>שינוי % מעל</span>
            <input type="number" step="0.5" value={filters.changeMin}
              onChange={e => setF('changeMin', parseFloat(e.target.value) || 0)}
              className="px-2 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: '#0d1117', border: '1px solid #1e293b', color: '#e2e8f0' }} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium" style={{ color: '#64748b' }}>שווי שוק מעל ($B)</span>
            <input type="number" step="0.5" min="0" value={filters.marketCapMinB}
              onChange={e => setF('marketCapMinB', parseFloat(e.target.value) || 0)}
              className="px-2 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: '#0d1117', border: '1px solid #1e293b', color: '#e2e8f0' }} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium" style={{ color: '#64748b' }}>מחיר מעל</span>
            <input type="number" step="1" min="0" value={filters.priceMin}
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
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-right border-b border-white/5" style={{ color: '#64748b' }}>
                    {['סימבול', 'מחיר', 'שינוי %', 'שווי שוק', 'נפח', 'RSI', 'SMA200'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <tr key={row.symbol} className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.03]">
                      <td className="px-3 py-2.5">
                        <Link href={`/stock/${row.symbol}`} className="flex items-center gap-1.5 font-bold hover:underline" style={{ color: '#e2e8f0' }}>
                          {row.symbol}
                          {row.isIsraeli && (
                            <span className="text-[9px] px-1 py-0.5 rounded"
                              style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>
                              🇮🇱
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 font-medium tabular-nums" style={{ color: '#e2e8f0' }}>{row.price.toFixed(2)}</td>
                      <td className="px-3 py-2.5 font-semibold tabular-nums" style={{ color: row.changePercent >= 0 ? '#22c55e' : '#ef4444' }}>
                        {row.changePercent >= 0 ? '+' : ''}{row.changePercent.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: '#94a3b8' }}>{fmtCap(row.marketCap)}</td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: '#94a3b8' }}>{fmtVol(row.volume)}</td>
                      <td className="px-3 py-2.5 font-medium tabular-nums" style={{ color: '#a78bfa' }}>{row.rsi?.toFixed(1) ?? '—'}</td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: '#3b82f6' }}>{row.sma200?.toFixed(2) ?? '—'}</td>
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
