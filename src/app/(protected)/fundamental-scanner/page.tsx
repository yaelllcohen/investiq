'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, RefreshCw, Loader2 } from 'lucide-react'

const IL_TZ = 'Asia/Jerusalem'

function formatScanTime(generatedAtIso: string): string {
  const generated = new Date(generatedAtIso)
  const now = new Date()
  const dateStr = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: IL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const timeStr = generated.toLocaleTimeString('he-IL', { timeZone: IL_TZ, hour: '2-digit', minute: '2-digit' })
  if (dateStr(generated) === dateStr(now)) return `נסרק היום בשעה ${timeStr}`
  return `נסרק ב-${generated.toLocaleDateString('he-IL', { timeZone: IL_TZ, day: '2-digit', month: '2-digit' })} בשעה ${timeStr}`
}

interface ScanRow {
  symbol: string
  companyName: string | null
  sector: string | null
  price: number
  marketCap: number | null
  epsGrowthQoQPct: number | null
  revenueGrowthYoYPct: number | null
  isHypeSector: boolean
  isRecentIPO: boolean
  ipoYear: number | null
  earningsSoon: boolean
  nextEarningsDate: string | null
  fcfPositive: boolean | null
  trailingPE: number | null
  peReasonable: boolean
  baseScore: number
  score: number
  aiReasoning: string | null
  aiScored: boolean
}

interface ScanResponse {
  results: ScanRow[]
  scannedCount: number
  filteredCount: number
  generatedAt: string
  cached: boolean
  error?: string
  rateLimited?: boolean
}

function fmtCompact(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  return n.toLocaleString('he-IL')
}

function scoreColor(score: number): string {
  if (score >= 70) return '#22c55e'
  if (score >= 40) return '#f59e0b'
  return '#ef4444'
}

export default function FundamentalScannerPage() {
  const [data, setData] = useState<ScanResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const runScan = useCallback((force: boolean) => {
    setLoading(true)
    setError(null)
    fetch(`/api/fundamental-scanner${force ? '?force=1' : ''}`)
      .then(async r => {
        const d: ScanResponse = await r.json()
        if (!r.ok || d.error) { setError(d.error ?? 'שגיאה בסריקה'); return }
        setData(d)
      })
      .catch(() => setError('שגיאת רשת — נסה שוב'))
      .finally(() => setLoading(false))
  }, [])

  // On page load: hits the server cache — same-day results come back instantly
  // (no scan), a new day triggers a fresh scan server-side automatically.
  // Deferred to a microtask so the fetch's setState isn't synchronous within
  // the effect body.
  useEffect(() => { queueMicrotask(() => runScan(false)) }, [runScan])

  return (
    <div className="space-y-6">
      {/* ─── Breadcrumb ─── */}
      <nav className="flex items-center gap-1.5 text-sm" style={{ color: '#64748b' }}>
        <Link href="/dashboard" className="hover:underline" style={{ color: '#64748b' }}>בית</Link>
        <ChevronLeft className="w-3.5 h-3.5" />
        <span style={{ color: '#e2e8f0' }}>סורק פונדמנטלי</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: '#e2e8f0' }}>סורק פונדמנטלי</h1>
          <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>
            סורק את כל מניות S&amp;P 500 לפי צמיחת EPS/הכנסות, סקטור חם, IPO חדש, דוח קרוב ותזרים מזומנים — ומדרג AI עם חיפוש בגוגל את 20 המניות המובילות
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            onClick={() => runScan(true)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: '#3b82f6', color: '#fff' }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {loading ? 'סורק...' : 'סרוק מחדש'}
          </button>
          {data && !loading && (
            <span className="text-[10px]" style={{ color: '#64748b' }}>
              {formatScanTime(data.generatedAt)}
            </span>
          )}
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
          <p className="text-sm text-center" style={{ color: '#64748b' }}>
            סורק את כל מניות S&amp;P 500 ומריץ ניתוח AI על המועמדות המובילות — זה עשוי לקחת מספר דקות...
          </p>
        </div>
      )}

      {/* ─── Results ─── */}
      {data && !loading && (
        <>
          <div className="flex items-center justify-between text-xs flex-wrap gap-2" style={{ color: '#64748b' }}>
            <span>
              נסרקו {data.scannedCount} מניות · {data.filteredCount} עברו את הפילטר הבסיסי (EPS/Revenue growth) · מוצגות <b style={{ color: '#e2e8f0' }}>{data.results.length}</b> המובילות
            </span>
          </div>

          {data.results.length === 0 ? (
            <div className="rounded-xl p-10 text-center" style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-sm" style={{ color: '#94a3b8' }}>אין כרגע מניות שעומדות בפילטר הבסיסי (EPS Growth QoQ ו-Revenue Growth YoY)</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/5 overflow-x-auto" style={{ background: '#111827' }}>
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="text-right border-b border-white/5" style={{ color: '#64748b' }}>
                    {['ציון', 'סימבול', 'חברה', 'סקטור', 'מחיר', 'שווי שוק', 'EPS Growth (רבעוני)', 'Revenue Growth YoY', 'P/E', 'FCF', 'תגיות'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.results.map(row => (
                    <Fragment key={row.symbol}>
                      <tr className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.03] cursor-pointer"
                        onClick={() => setExpanded(expanded === row.symbol ? null : row.symbol)}>
                        <td className="px-3 py-2.5">
                          <span className="font-bold px-2 py-1 rounded-full text-xs" style={{ background: `${scoreColor(row.score)}20`, color: scoreColor(row.score) }}>
                            {row.score}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Link href={`/stock/${row.symbol}`} onClick={e => e.stopPropagation()} className="font-bold hover:underline" style={{ color: '#e2e8f0' }}>
                            {row.symbol}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 truncate max-w-[160px]" style={{ color: '#94a3b8' }}>{row.companyName ?? '—'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: '#94a3b8' }}>{row.sector ?? '—'}</td>
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: '#e2e8f0' }}>{row.price.toFixed(2)}</td>
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: '#94a3b8' }}>{fmtCompact(row.marketCap)}</td>
                        <td className="px-3 py-2.5 font-medium tabular-nums" style={{ color: (row.epsGrowthQoQPct ?? 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                          {row.epsGrowthQoQPct != null ? `${row.epsGrowthQoQPct >= 0 ? '+' : ''}${row.epsGrowthQoQPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-3 py-2.5 font-medium tabular-nums" style={{ color: (row.revenueGrowthYoYPct ?? 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                          {row.revenueGrowthYoYPct != null ? `${row.revenueGrowthYoYPct >= 0 ? '+' : ''}${row.revenueGrowthYoYPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: row.peReasonable ? '#94a3b8' : '#ef4444' }}>
                          {row.trailingPE != null ? row.trailingPE.toFixed(1) : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.fcfPositive == null ? '—' : row.fcfPositive ? '✅' : '❌'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1 flex-wrap">
                            {row.isHypeSector && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>🔥 חם</span>}
                            {row.isRecentIPO && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>🆕 IPO {row.ipoYear}</span>}
                            {row.earningsSoon && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>📅 דוח קרוב</span>}
                          </div>
                        </td>
                      </tr>
                      {expanded === row.symbol && row.aiReasoning && (
                        <tr className="border-b border-white/5 last:border-0" style={{ background: '#0d1117' }}>
                          <td colSpan={11} className="px-4 py-3 text-sm" style={{ color: '#cbd5e1' }}>
                            <span className="font-semibold" style={{ color: row.aiScored ? '#818cf8' : '#64748b' }}>
                              {row.aiScored ? '🤖 ניתוח AI: ' : '⚠ '}
                            </span>
                            {row.aiReasoning}
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
