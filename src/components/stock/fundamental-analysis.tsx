'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bot, Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { FundamentalRow } from '@/lib/fundamentals'

interface AiForecastResult {
  trend: 'strengthening' | 'weakening' | 'mixed'
  risks: string[]
  outlook: 'positive' | 'negative' | 'neutral'
  reasoning: string
  score: number
}

const STATUS_ICON: Record<FundamentalRow['status'], string> = {
  good: '✅',
  warn: '⚠️',
  bad: '❌',
}

const STATUS_COLOR: Record<FundamentalRow['status'], string> = {
  good: '#22c55e',
  warn: '#f59e0b',
  bad: '#ef4444',
}

const OUTLOOK_META: Record<AiForecastResult['outlook'], { label: string; color: string }> = {
  positive: { label: 'חיובי', color: '#22c55e' },
  negative: { label: 'שלילי', color: '#ef4444' },
  neutral:  { label: 'נייטרלי', color: '#94a3b8' },
}

const TREND_META: Record<AiForecastResult['trend'], { label: string; icon: typeof TrendingUp; color: string }> = {
  strengthening: { label: 'מתחזקת', icon: TrendingUp, color: '#22c55e' },
  weakening:     { label: 'נחלשת', icon: TrendingDown, color: '#ef4444' },
  mixed:         { label: 'מעורבת', icon: Minus, color: '#94a3b8' },
}

export default function FundamentalAnalysis({ ticker, rows }: { ticker: string; rows: FundamentalRow[] }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [result, setResult] = useState<AiForecastResult | null>(null)

  useEffect(() => {
    const id = setInterval(() => setCooldown(v => (v > 0 ? v - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [])

  const fetchForecast = useCallback(() => {
    if (loading || cooldown > 0) return
    setLoading(true)
    setError(null)
    fetch(`/api/fundamental-analysis/${encodeURIComponent(ticker)}`)
      .then(async r => {
        const d = await r.json()
        if (r.status === 429 || d.rateLimited) { setError(d.error ?? 'הגעת למגבלת השימוש היומית של AI. נסי שוב מחר.'); return }
        if (d.error) { setError(d.error); return }
        setResult(d)
      })
      .catch(() => setError('שגיאת רשת — נסה שוב'))
      .finally(() => { setLoading(false); setCooldown(10) })
  }, [ticker, loading, cooldown])

  if (rows.length === 0) return null

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4" style={{ color: '#e2e8f0' }}>ניתוח פונדמנטלי</h2>

      <div className="rounded-xl border border-white/5 overflow-hidden" style={{ background: '#111827' }}>
        <div className="divide-y divide-white/5">
          {rows.map(row => (
            <div key={row.id} className="flex items-start gap-3 p-4">
              <span className="text-lg leading-none shrink-0 mt-0.5">{STATUS_ICON[row.status]}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{row.label}</span>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: STATUS_COLOR[row.status] }}>{row.value}</span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{row.detail}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ─── AI forecast ─── */}
        <div className="p-4 border-t border-white/5" style={{ background: '#0d1117' }}>
          <button
            onClick={fetchForecast}
            disabled={loading || cooldown > 0}
            title={cooldown > 0 ? `המתן ${cooldown} שניות` : 'קבל תחזית AI'}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: '#3b82f6', color: '#fff' }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            {loading ? 'מנתח...' : cooldown > 0 ? `המתן ${cooldown}ש׳` : 'קבל תחזית AI'}
          </button>

          {error && (
            <p className="text-sm mt-3" style={{ color: '#ef4444' }}>⚠ {error}</p>
          )}

          {result && !loading && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {(() => {
                  const trend = TREND_META[result.trend]
                  const Icon = trend.icon
                  return (
                    <span className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full"
                      style={{ background: `${trend.color}20`, color: trend.color }}>
                      <Icon className="h-3.5 w-3.5" />
                      החברה {trend.label}
                    </span>
                  )
                })()}
                <span className="text-sm font-semibold px-3 py-1 rounded-full"
                  style={{ background: `${OUTLOOK_META[result.outlook].color}20`, color: OUTLOOK_META[result.outlook].color }}>
                  תחזית: {OUTLOOK_META[result.outlook].label}
                </span>
                <span className="text-sm font-semibold px-3 py-1 rounded-full" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                  ציון פונדמנטלי: {result.score}/100
                </span>
              </div>

              {result.reasoning && (
                <p className="text-sm leading-relaxed" style={{ color: '#cbd5e1' }}>{result.reasoning}</p>
              )}

              {result.risks.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#64748b' }}>סיכונים עיקריים</div>
                  <ul className="space-y-1">
                    {result.risks.map((r, i) => (
                      <li key={i} className="text-sm flex items-start gap-1.5" style={{ color: '#cbd5e1' }}>
                        <span style={{ color: '#ef4444' }}>•</span> {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
