'use client'

import { useEffect, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type AssetType = 'us_stock' | 'israel_stock' | 'etf' | 'mutualfund' | 'crypto'

interface ScoreData {
  assetType?: AssetType
  total?: number
  [key: string]: unknown
  explanations?: Record<string, string>
  error?: string
  insufficient?: boolean
  partial?: boolean
  partialReason?: string
  noScore?: boolean
  assetClass?: string
  name?: string
}

// ─── Component labels per asset type ─────────────────────────────────────────

const COMPONENT_LABELS: Record<AssetType, { key: string; label: string }[]> = {
  us_stock: [
    { key: 'growth',        label: 'צמיחה'    },
    { key: 'profitability', label: 'רווחיות'  },
    { key: 'momentum',      label: 'מומנטום'  },
    { key: 'valuation',     label: 'תמחור'    },
    { key: 'risk',          label: 'סיכון'    },
  ],
  israel_stock: [
    { key: 'momentum',      label: 'מומנטום'  },
    { key: 'volatility',    label: 'תנודתיות' },
    { key: 'liquidity',     label: 'נזילות'   },
    { key: 'valuation',     label: 'תמחור'    },
  ],
  etf: [
    { key: 'returns',        label: 'תשואה'    },
    { key: 'cost',           label: 'עלות'     },
    { key: 'diversification',label: 'פיזור'    },
    { key: 'volatility',     label: 'תנודתיות' },
    { key: 'momentum',       label: 'מומנטום'  },
  ],
  mutualfund: [
    { key: 'returns',     label: 'תשואה'    },
    { key: 'cost',        label: 'עלות'     },
    { key: 'volatility',  label: 'תנודתיות' },
    { key: 'consistency', label: 'עקביות'   },
  ],
  crypto: [
    { key: 'momentum',    label: 'מומנטום'  },
    { key: 'volatility',  label: 'תנודתיות' },
    { key: 'size',        label: 'גודל'     },
    { key: 'liquidity',   label: 'נזילות'   },
    { key: 'trend',       label: 'טרנד'     },
  ],
}

// Fallback for old cache entries that lack assetType
const FALLBACK_COMPONENTS = COMPONENT_LABELS.us_stock

function getComponents(data: ScoreData) {
  const at = data.assetType
  const spec = at ? COMPONENT_LABELS[at] : FALLBACK_COMPONENTS
  // Filter to keys that actually exist on the data object
  return spec.filter(c => typeof data[c.key] === 'number')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 75) return '#22c55e'
  if (s >= 60) return '#eab308'
  if (s >= 40) return '#f97316'
  return '#ef4444'
}

function scoreLabel(s: number): string {
  if (s >= 75) return 'חזק'
  if (s >= 60) return 'חיובי'
  if (s >= 40) return 'נייטרלי'
  return 'חלש'
}

// ─── Gauge SVG ────────────────────────────────────────────────────────────────

function Gauge({ score }: { score: number }) {
  const R        = 60
  const CX       = 80, CY = 82
  const totalArc = Math.PI * R
  const filled   = (score / 100) * totalArc
  const color    = scoreColor(score)

  return (
    <svg width="160" height="92" viewBox="0 0 160 92" aria-label={`ציון ${score}`}>
      <path
        d={`M ${CX - R},${CY} A ${R},${R} 0 0,1 ${CX + R},${CY}`}
        fill="none" stroke="#1e293b" strokeWidth="13" strokeLinecap="round"
      />
      <path
        d={`M ${CX - R},${CY} A ${R},${R} 0 0,1 ${CX + R},${CY}`}
        fill="none" stroke={color} strokeWidth="13" strokeLinecap="round"
        strokeDasharray={`${filled.toFixed(2)} ${totalArc.toFixed(2)}`}
      />
      <text x={CX} y={CY - 10} textAnchor="middle" fill={color}
        fontSize="30" fontWeight="900" fontFamily="ui-monospace, monospace">
        {score}
      </text>
      <text x={CX} y={CY + 7} textAnchor="middle" fill="#64748b" fontSize="9.5">
        מתוך 100
      </text>
    </svg>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function Bar({ score, label, explanation }: { score: number; label: string; explanation?: string }) {
  const color = scoreColor(score)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400 font-medium">{label}</span>
        <span className="font-bold tabular-nums" style={{ color }}>{score}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1e293b' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      {explanation && (
        <p className="text-[10.5px] leading-snug" style={{ color: '#64748b' }}>{explanation}</p>
      )}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="rounded-xl border border-white/5 p-5 space-y-5 animate-pulse" style={{ background: '#111827' }}>
      <div className="h-4 w-32 rounded" style={{ background: '#1e293b' }} />
      <div className="flex items-center gap-6">
        <div className="w-40 h-24 rounded" style={{ background: '#1e293b' }} />
        <div className="flex-1 space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="space-y-1">
              <div className="h-3 rounded" style={{ background: '#1e293b', width: `${50 + i * 8}%` }} />
              <div className="h-1.5 rounded-full" style={{ background: '#1e293b' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Money market card ────────────────────────────────────────────────────────

function MoneyMarketCard({ name }: { name?: string }) {
  return (
    <div className="rounded-xl border border-white/5 p-5" style={{ background: '#111827' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>
          קרן כספית
        </h2>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>
          שמרני
        </span>
      </div>
      {name && <p className="text-sm font-medium mb-4" style={{ color: '#e2e8f0' }}>{name}</p>}
      <p className="text-xs mb-4" style={{ color: '#64748b' }}>
        מוצר שמרני לשימור הון. ציון AI אינו רלוונטי — אינה נכס צמיחה.
      </p>
      <div className="space-y-2.5">
        {['✅ סיכון נמוך מאוד', '✅ נזילות גבוהה', '✅ תשואה עדיפה על פיקדון', 'ℹ️  לא מדורגת — אינה נכס צמיחה'].map((item, i) => (
          <p key={i} className="text-sm" style={{ color: '#94a3b8' }}>{item}</p>
        ))}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScoreCard({ symbol }: { symbol: string }) {
  const [data, setData]       = useState<ScoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    let dead = false
    setLoading(true)
    setData(null)
    setError(null)

    fetch(`/api/ai-score/${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .then((d: ScoreData) => {
        if (dead) return
        if (d.error) { setError(d.error); return }
        setData(d)
      })
      .catch(() => { if (!dead) setError('שגיאה בטעינת הציון') })
      .finally(() => { if (!dead) setLoading(false) })

    return () => { dead = true }
  }, [symbol])

  if (loading) return <Skeleton />

  if (error) {
    return (
      <div className="rounded-xl border border-white/5 px-5 py-4 text-center" style={{ background: '#111827' }}>
        <p className="text-xs" style={{ color: '#64748b' }}>{error}</p>
      </div>
    )
  }

  if (!data) return null

  if (data.noScore) {
    if (data.assetClass === 'money_market') return <MoneyMarketCard name={data.name as string | undefined} />
    return null
  }

  const total      = data.total ?? 50
  const color      = scoreColor(total)
  const expl       = data.explanations ?? {}
  const components = getComponents(data)

  return (
    <div className="rounded-xl border border-white/5 p-5" style={{ background: '#111827' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>
          ציון InvestIQ
        </h2>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: color + '22', color, border: `1px solid ${color}55` }}
        >
          {scoreLabel(total)}
        </span>
      </div>

      {/* Partial data warning */}
      {data.partial && (
        <div
          className="text-xs px-3 py-2 rounded-lg mb-4 flex items-center gap-2"
          style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', color: '#eab308' }}
        >
          <span>⚠</span>
          <span>{data.partialReason}</span>
        </div>
      )}

      <div className="flex items-start gap-6">
        {/* Gauge */}
        <div className="flex-shrink-0 flex flex-col items-center">
          <Gauge score={total} />
          <p className="text-[10px] mt-1 text-center" style={{ color: '#475569' }}>
            ציון כולל
          </p>
        </div>

        {/* Bars */}
        <div className="flex-1 space-y-3 min-w-0">
          {components.map(({ key, label }) => (
            <Bar
              key={key}
              score={data[key] as number}
              label={label}
              explanation={expl[key]}
            />
          ))}
        </div>
      </div>

      <p className="text-[9px] mt-3 text-right" style={{ color: '#334155' }}>
        מבוסס על נתוני שוק עדכניים • מתעדכן כל 24 שעות • לצורכי מידע בלבד
      </p>
    </div>
  )
}
