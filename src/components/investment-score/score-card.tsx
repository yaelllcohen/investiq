'use client'

import { useState, useEffect } from 'react'
import { Lightbulb, TrendingUp } from 'lucide-react'
import type { InvestmentScoreData } from '@/app/api/investment-score/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(n: number) {
  if (n >= 70) return '#10B981'
  if (n >= 40) return '#F59E0B'
  return '#F43F5E'
}

function scoreLabel(n: number) {
  if (n >= 80) return 'מצוין'
  if (n >= 60) return 'טוב'
  if (n >= 40) return 'בינוני'
  return 'נמוך'
}

function barColor(pct: number) {
  if (pct >= 0.7) return '#10B981'
  if (pct >= 0.4) return '#F59E0B'
  return '#F43F5E'
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 w-24 bg-zinc-800 rounded" />
          <div className="h-10 w-16 bg-zinc-800 rounded" />
        </div>
        <div className="h-6 w-16 bg-zinc-800 rounded-full" />
      </div>
      <div className="space-y-3.5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <div className="h-3 w-16 bg-zinc-800 rounded" />
              <div className="h-3 w-8 bg-zinc-800 rounded" />
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InvestmentScoreCard() {
  const [data, setData] = useState<InvestmentScoreData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/investment-score')
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.total === 'number') setData(d)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton />
  if (!data)   return null

  const color = scoreColor(data.total)
  const label = scoreLabel(data.total)

  const categoryEntries = [
    data.categories.diversification,
    data.categories.risk,
    data.categories.costs,
    data.categories.discipline,
    data.categories.goals,
  ]

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">

      {/* Header: score + label */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1.5">
            ציון השקעה אישי
          </p>
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-extrabold font-jakarta leading-none"
              style={{ fontSize: '3rem', color, letterSpacing: '-0.03em' }}
            >
              {data.total}
            </span>
            <span className="text-zinc-500 text-sm font-mono">/100</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            className="text-xs font-bold px-3 py-1 rounded-full border"
            style={{ color, borderColor: `${color}40`, background: `${color}14` }}
          >
            {label}
          </span>
          <TrendingUp className="h-4 w-4" style={{ color }} />
        </div>
      </div>

      {/* Score ring progress */}
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${data.total}%`, background: color }}
        />
      </div>

      {/* Categories */}
      <div className="space-y-3">
        {categoryEntries.map((cat) => {
          const pct = cat.score / cat.max
          const c   = barColor(pct)
          return (
            <div key={cat.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-zinc-300">{cat.label}</span>
                <span className="text-xs font-mono text-zinc-500">
                  {cat.score}
                  <span className="text-zinc-700">/{cat.max}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.round(pct * 100)}%`, background: c }}
                />
              </div>
              <p className="text-[10px] text-zinc-600 mt-0.5 truncate">{cat.detail}</p>
            </div>
          )
        })}
      </div>

      {/* Tip */}
      <div
        className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 border"
        style={{ background: '#F59E0B0D', borderColor: '#F59E0B2E' }}
      >
        <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
        <p className="text-xs text-zinc-300 leading-relaxed">{data.tip}</p>
      </div>
    </div>
  )
}
