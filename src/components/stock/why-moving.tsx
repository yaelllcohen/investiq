'use client'

import { useState, useRef, useEffect } from 'react'
import { HelpCircle, X, Loader2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BenchInfo { symbol: string; name: string; change: number }

interface WhyData {
  points: string[]
  sentiment?: 'bullish' | 'bearish' | 'neutral'
  stockChange?: number
  benchData?: BenchInfo[]
  updatedAt?: string
  error?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sentimentColor(s: string | undefined) {
  if (s === 'bullish') return '#22c55e'
  if (s === 'bearish') return '#ef4444'
  return '#f59e0b'
}

function sentimentLabel(s: string | undefined) {
  if (s === 'bullish') return 'חיובי'
  if (s === 'bearish') return 'שלילי'
  return 'מעורב'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WhyMoving({ symbol }: { symbol: string }) {
  const [open, setOpen]       = useState(false)
  const [data, setData]       = useState<WhyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  function toggle() {
    if (open) { setOpen(false); return }
    setOpen(true)
    fetch_data()
  }

  function fetch_data() {
    setLoading(true)
    setError(null)
    // Always refresh — skip cache so user sees live data on each click
    fetch(`/api/why-moving/${encodeURIComponent(symbol)}?refresh=true`)
      .then(r => r.json())
      .then((d: WhyData) => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError('שגיאה בטעינת הניתוח'))
      .finally(() => setLoading(false))
  }

  const sign = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'

  return (
    <div className="relative inline-block" ref={panelRef}>
      {/* Button */}
      <button
        onClick={toggle}
        disabled={loading}
        title="למה המניה זזה היום?"
        className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-all focus:outline-none disabled:opacity-60"
        style={open
          ? { background: 'rgba(59,130,246,0.18)', borderColor: '#3b82f6', color: '#3b82f6' }
          : { background: 'transparent', borderColor: '#334155', color: '#64748b' }}
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <HelpCircle className="h-3.5 w-3.5" />
        }
        <span>למה?</span>
      </button>

      {/* Panel */}
      {open && (
        <div
          className="absolute z-50 mt-2 rounded-xl border shadow-2xl"
          style={{
            right: 0, width: 320, maxWidth: '90vw',
            background: '#0f172a', borderColor: '#1e293b',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#1e293b' }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>
              למה {symbol} זזה היום?
            </span>
            <button onClick={() => setOpen(false)} className="text-zinc-600 hover:text-zinc-300 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-4 py-4 space-y-3">

            {/* Bench context strip */}
            {data?.benchData && data.benchData.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {[
                  { name: symbol, change: data.stockChange ?? 0, self: true },
                  ...data.benchData.map(b => ({ name: b.name, change: b.change, self: false })),
                ].map(item => (
                  <div key={item.name} className="rounded px-2 py-1 text-[10px] font-mono"
                    style={{ background: '#1e293b', color: item.change >= 0 ? '#22c55e' : '#ef4444', border: item.self ? '1px solid #334155' : 'none' }}>
                    <span className="text-zinc-500 mr-1">{item.name}</span>
                    {sign(item.change)}
                  </div>
                ))}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center gap-2 py-4">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#3b82f6' }} />
                <span className="text-xs" style={{ color: '#475569' }}>מנתח תנועת שוק...</span>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <p className="text-xs text-red-400">{error}</p>
            )}

            {/* Points */}
            {!loading && !error && data?.points && (
              <>
                <ul className="space-y-2.5">
                  {data.points.map((pt, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs" style={{ color: '#cbd5e1', lineHeight: 1.55 }}>
                      <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                        style={{ background: '#1e293b', color: '#64748b' }}>
                        {i + 1}
                      </span>
                      {pt}
                    </li>
                  ))}
                </ul>

                {data.sentiment && (
                  <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: '#1e293b' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px]" style={{ color: '#475569' }}>סנטימנט:</span>
                      <span className="text-[10px] font-semibold" style={{ color: sentimentColor(data.sentiment) }}>
                        {sentimentLabel(data.sentiment)}
                      </span>
                    </div>
                    {data.updatedAt && (
                      <span className="text-[9px]" style={{ color: '#334155' }}>{data.updatedAt}</span>
                    )}
                  </div>
                )}
              </>
            )}

            <p className="text-[9px] border-t pt-2" style={{ color: '#334155', borderColor: '#1e293b' }}>
              מבוסס על נתוני שוק בלבד • לבדיקת חדשות ספציפיות — ראו מקורות עדכניות
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
