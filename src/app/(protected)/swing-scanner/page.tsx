'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, RefreshCw, Loader2, TrendingUp } from 'lucide-react'

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

interface ScanResponse {
  results: ScanHit[]
  scannedCount: number
  matchCount: number
  generatedAt: string
  cached: boolean
  error?: string
  rateLimited?: boolean
}

export default function SwingScannerPage() {
  const [data, setData] = useState<ScanResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
            מניות ⁦S&amp;P 500⁩ ומניות ישראליות פופולריות שעומדות בקריטריוני סווינג טכניים
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

      {/* ─── Criteria strip ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { label: 'מחיר מעל SMA200', icon: '✅' },
          { label: 'נפח גבוה מהממוצע', icon: '✅' },
          { label: 'RSI בין 40-60', icon: '✅' },
          { label: 'קרוב לפריצת התנגדות', icon: '✅' },
        ].map(c => (
          <div key={c.label} className="rounded-lg px-3 py-2.5 text-xs font-medium flex items-center gap-2"
            style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}>
            <span>{c.icon}</span>{c.label}
          </div>
        ))}
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
          <p className="text-sm" style={{ color: '#64748b' }}>סורק עשרות מניות — זה עשוי לקחת עד דקה...</p>
        </div>
      )}

      {/* ─── Results ─── */}
      {data && !loading && (
        <>
          <div className="flex items-center justify-between text-xs" style={{ color: '#64748b' }}>
            <span>
              נסרקו {data.scannedCount} מניות · נמצאו <b style={{ color: '#e2e8f0' }}>{data.matchCount}</b> תואמות
            </span>
            <span>
              {data.cached ? 'תוצאה שמורה · ' : ''}עודכן {new Date(data.generatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {data.results.length === 0 ? (
            <div className="rounded-xl p-10 text-center" style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-sm" style={{ color: '#94a3b8' }}>לא נמצאו מניות שעומדות בכל הקריטריונים כרגע</p>
              <p className="text-xs mt-1" style={{ color: '#64748b' }}>נסה לסרוק שוב מאוחר יותר — התנאים משתנים לאורך היום</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.results.map(hit => (
                <Link
                  key={hit.symbol}
                  href={`/stock/${hit.symbol}`}
                  className="rounded-xl p-4 border border-white/5 transition-all hover:border-blue-500/40 space-y-3 block"
                  style={{ background: '#111827' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base font-extrabold" style={{ color: '#e2e8f0' }}>{hit.symbol}</span>
                      {hit.isIsraeli && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>
                          🇮🇱
                        </span>
                      )}
                    </div>
                    <TrendingUp className="h-4 w-4" style={{ color: '#22c55e' }} />
                  </div>

                  <div className="text-xl font-black" style={{ color: '#e2e8f0' }}>
                    {hit.price.toFixed(2)}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div className="rounded-md px-2 py-1.5" style={{ background: '#0d1117' }}>
                      <div className="text-[9px] uppercase tracking-wider" style={{ color: '#475569' }}>RSI</div>
                      <div className="font-semibold" style={{ color: '#a78bfa' }}>{hit.rsi}</div>
                    </div>
                    <div className="rounded-md px-2 py-1.5" style={{ background: '#0d1117' }}>
                      <div className="text-[9px] uppercase tracking-wider" style={{ color: '#475569' }}>נפח יחסי</div>
                      <div className="font-semibold" style={{ color: '#f59e0b' }}>{hit.volumeRatio}x</div>
                    </div>
                    <div className="rounded-md px-2 py-1.5" style={{ background: '#0d1117' }}>
                      <div className="text-[9px] uppercase tracking-wider" style={{ color: '#475569' }}>מרחק מהתנגדות</div>
                      <div className="font-semibold" style={{ color: '#22c55e' }}>{hit.distanceToResistancePct}%</div>
                    </div>
                    <div className="rounded-md px-2 py-1.5" style={{ background: '#0d1117' }}>
                      <div className="text-[9px] uppercase tracking-wider" style={{ color: '#475569' }}>SMA 200</div>
                      <div className="font-semibold" style={{ color: '#3b82f6' }}>{hit.sma200.toFixed(2)}</div>
                    </div>
                  </div>
                </Link>
              ))}
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
