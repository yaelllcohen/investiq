'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Brain, AlertTriangle, Zap, TrendingUp, BookOpen, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EMOTION_COLORS, EMOTION_LABELS } from '@/components/psychology/emotion-pie-chart'

const EmotionPieChart = dynamic(() => import('@/components/psychology/emotion-pie-chart'), {
  ssr:     false,
  loading: () => <div className="h-[220px] flex items-center justify-center"><Spinner /></div>,
})

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmotionStat {
  emotion:     string
  count:       number
  successRate: number | null
}

interface Pattern {
  type:     string
  message:  string
  severity: 'warning' | 'danger' | 'info'
}

interface AIInsights {
  commonMistake: string
  fomoPattern:   string
  bestPattern:   string
  tip:           string
}

interface Stats {
  totalEntries:   number
  closedEntries:  number
  disciplineScore: number
  disciplineBreakdown: {
    documentationRate: number
    riskRate:          number
    planAdherence:     number
  }
  emotionStats:      EmotionStat[]
  bestEmotion:       string | null
  overallSuccessRate: number | null
  patterns:          Pattern[]
  aiInsights:        AIInsights | null
}

// ─── Small components ─────────────────────────────────────────────────────────

function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-500" />
}

function MetricCard({
  label, value, sub, color, icon: Icon,
}: {
  label: string; value: string; sub?: string; color: string; icon: React.ElementType
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{ background: 'var(--iq-surface)', border: '1px solid var(--iq-border)' }}
    >
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded flex items-center justify-center" style={{ background: `${color}18` }}>
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--iq-text-3)' }}>
          {label}
        </p>
      </div>
      <p className="text-3xl font-black" style={{ color }}>{value}</p>
      {sub && <p className="text-[11px]" style={{ color: 'var(--iq-text-3)' }}>{sub}</p>}
    </div>
  )
}

function ProgressBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span style={{ color: 'var(--iq-text-2)' }}>{label}</span>
        <span className="font-bold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  )
}

// ─── Discipline ring ─────────────────────────────────────────────────────────

function DisciplineRing({ score }: { score: number }) {
  const color  = score >= 70 ? '#10B981' : score >= 50 ? '#F59E0B' : '#F43F5E'
  const r      = 36
  const circ   = 2 * Math.PI * r
  const dash   = (score / 100) * circ

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#27272A" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
        <text x="48" y="52" textAnchor="middle" fontSize="20" fontWeight="900" fill={color}>{score}</text>
        <text x="48" y="65" textAnchor="middle" fontSize="8" fill="#71717A">/100</text>
      </svg>
      <p className="text-xs font-semibold" style={{ color: 'var(--iq-text-2)' }}>ציון משמעת</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PsychologyPage() {
  const [stats, setStats]         = useState<Stats | null>(null)
  const [loading, setLoading]     = useState(true)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => { fetchStats() }, [])

  async function fetchStats(withAI = false) {
    if (withAI) setAiLoading(true)
    else setLoading(true)
    try {
      const res  = await fetch(`/api/psychology${withAI ? '?ai=true' : ''}`)
      const text = await res.text()
      if (text) setStats(JSON.parse(text))
    } catch (err) {
      console.error('[psychology]', err)
    } finally {
      setLoading(false)
      setAiLoading(false)
    }
  }

  if (loading) {
    return (
      <div
        className="rounded-xl p-16 flex items-center justify-center"
        style={{ background: 'var(--iq-surface)', border: '1px solid var(--iq-border)' }}
      >
        <Spinner />
      </div>
    )
  }

  if (!stats || stats.totalEntries === 0) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <div
          className="rounded-xl p-16 text-center"
          style={{ background: 'var(--iq-surface)', border: '1px solid var(--iq-border)' }}
        >
          <Brain className="h-12 w-12 mx-auto mb-4 opacity-20" style={{ color: 'var(--iq-text-2)' }} />
          <p className="text-sm" style={{ color: 'var(--iq-text-2)' }}>אין עדיין החלטות ביומן.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--iq-text-3)' }}>
            הוסף החלטות ב<a href="/journal" className="underline">יומן ההחלטות</a> כדי לראות ניתוח פסיכולוגי.
          </p>
        </div>
      </div>
    )
  }

  const scoreColor = stats.disciplineScore >= 70 ? '#10B981' : stats.disciplineScore >= 50 ? '#F59E0B' : '#F43F5E'
  const successColor = (stats.overallSuccessRate ?? 0) >= 60 ? '#10B981' : (stats.overallSuccessRate ?? 0) >= 40 ? '#F59E0B' : '#F43F5E'

  const bestEmotionLabel = stats.bestEmotion ? EMOTION_LABELS[stats.bestEmotion] : '—'

  return (
    <div className="space-y-6">
      <PageHeader />

      {/* ── Metric cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="ציון משמעת"
          value={`${stats.disciplineScore}`}
          sub={stats.disciplineScore >= 70 ? 'מסחר ממושמע' : stats.disciplineScore >= 50 ? 'יש מקום לשיפור' : 'זקוק לשיפור'}
          color={scoreColor}
          icon={Brain}
        />
        <MetricCard
          label="אחוז הצלחה"
          value={stats.overallSuccessRate != null ? `${stats.overallSuccessRate}%` : '—'}
          sub={`${stats.closedEntries} סגורות מתוך ${stats.totalEntries}`}
          color={successColor}
          icon={TrendingUp}
        />
        <MetricCard
          label="החלטות"
          value={`${stats.totalEntries}`}
          sub={`${stats.closedEntries} הסתיימו · ${stats.totalEntries - stats.closedEntries} פתוחות`}
          color="#818CF8"
          icon={BookOpen}
        />
        <MetricCard
          label="רגש מנצח"
          value={bestEmotionLabel}
          sub={
            stats.bestEmotion && stats.emotionStats.find((e) => e.emotion === stats.bestEmotion)?.successRate != null
              ? `${stats.emotionStats.find((e) => e.emotion === stats.bestEmotion)?.successRate}% הצלחה`
              : undefined
          }
          color={stats.bestEmotion ? EMOTION_COLORS[stats.bestEmotion] : '#818CF8'}
          icon={Sparkles}
        />
      </div>

      {/* ── Emotion analysis ───────────────────────────────────────────────── */}
      <div
        className="rounded-xl p-5"
        style={{ background: 'var(--iq-surface)', border: '1px solid var(--iq-border)' }}
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-5" style={{ color: 'var(--iq-text-3)' }}>
          ניתוח רגשי
        </h2>
        <div className="grid md:grid-cols-2 gap-6 items-center">
          {/* Pie chart */}
          <EmotionPieChart data={stats.emotionStats} />

          {/* Emotion table */}
          <div className="space-y-3">
            {stats.emotionStats.map((e) => {
              const color = EMOTION_COLORS[e.emotion] ?? '#6B7280'
              const srColor = e.successRate == null ? '#6B7280' : e.successRate >= 60 ? '#10B981' : e.successRate >= 40 ? '#F59E0B' : '#F43F5E'
              return (
                <div key={e.emotion} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--iq-text)' }}>
                      {EMOTION_LABELS[e.emotion] ?? e.emotion}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span style={{ color: 'var(--iq-text-3)' }}>{e.count} עסקאות</span>
                    <span className="font-bold w-14 text-left" style={{ color: srColor }}>
                      {e.successRate != null ? `${e.successRate}% ✓` : '—'}
                    </span>
                  </div>
                </div>
              )
            })}

            {/* Legend note */}
            <p className="text-[10px] pt-1" style={{ color: 'var(--iq-text-3)' }}>
              % הצלחה מחושב מעסקאות סגורות בלבד
            </p>
          </div>
        </div>
      </div>

      {/* ── Discipline breakdown ────────────────────────────────────────────── */}
      <div
        className="rounded-xl p-5"
        style={{ background: 'var(--iq-surface)', border: '1px solid var(--iq-border)' }}
      >
        <div className="flex items-center gap-4 mb-5">
          <DisciplineRing score={stats.disciplineScore} />
          <div className="flex-1 space-y-3">
            <ProgressBar
              label="תיעוד טרום-עסקה"
              value={stats.disciplineBreakdown.documentationRate}
              color={stats.disciplineBreakdown.documentationRate >= 80 ? '#10B981' : '#F59E0B'}
            />
            <ProgressBar
              label="הגדרת סיכון"
              value={stats.disciplineBreakdown.riskRate}
              color={stats.disciplineBreakdown.riskRate >= 80 ? '#10B981' : '#F59E0B'}
            />
            <ProgressBar
              label="עמידה בתוכנית"
              value={stats.disciplineBreakdown.planAdherence}
              color={stats.disciplineBreakdown.planAdherence >= 60 ? '#10B981' : stats.disciplineBreakdown.planAdherence >= 40 ? '#F59E0B' : '#F43F5E'}
            />
          </div>
        </div>
      </div>

      {/* ── Pattern alerts ─────────────────────────────────────────────────── */}
      {stats.patterns.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--iq-text-3)' }}>
            התראות דפוסים
          </h2>
          {stats.patterns.map((p) => {
            const bg =
              p.severity === 'danger'  ? 'bg-red-950/40 border-red-800/60 text-red-300' :
              p.severity === 'warning' ? 'bg-yellow-950/40 border-yellow-800/60 text-yellow-300' :
                                         'bg-blue-950/40 border-blue-800/60 text-blue-300'
            return (
              <div key={p.type} className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${bg}`}>
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                {p.message}
              </div>
            )
          })}
        </div>
      )}

      {/* ── AI Insights ────────────────────────────────────────────────────── */}
      <div
        className="rounded-xl p-5"
        style={{ background: 'var(--iq-surface)', border: '1px solid var(--iq-border)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--iq-text-3)' }}>
            תובנות AI
          </h2>
          {stats.totalEntries >= 3 && (
            <Button
              onClick={() => fetchStats(true)}
              disabled={aiLoading}
              variant="outline"
              className="border-zinc-700 text-zinc-400 hover:text-zinc-100 text-[10px] h-7 px-2.5 gap-1.5"
            >
              <Zap className="h-3 w-3" />
              {aiLoading ? 'מנתח...' : stats.aiInsights ? 'רענן' : 'ייצר תובנות'}
            </Button>
          )}
        </div>

        {stats.totalEntries < 3 ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--iq-text-3)' }}>
            דרושות לפחות 3 החלטות לניתוח AI ({stats.totalEntries}/3)
          </p>
        ) : !stats.aiInsights ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--iq-text-3)' }}>
            לחץ &quot;ייצר תובנות&quot; לניתוח פסיכולוגי מבוסס AI
          </p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            <InsightCard
              emoji="⚠️"
              label="הטעות הנפוצה ביותר"
              text={stats.aiInsights.commonMistake}
              color="text-red-300"
              bg="bg-red-950/30 border-red-900/50"
            />
            <InsightCard
              emoji="📈"
              label="דפוס ה-FOMO שלך"
              text={stats.aiInsights.fomoPattern}
              color="text-amber-300"
              bg="bg-amber-950/30 border-amber-900/50"
            />
            <InsightCard
              emoji="✅"
              label="הדפוס הטוב ביותר"
              text={stats.aiInsights.bestPattern}
              color="text-green-300"
              bg="bg-green-950/30 border-green-900/50"
            />
            <InsightCard
              emoji="💡"
              label="טיפ לשיפור"
              text={stats.aiInsights.tip}
              color="text-blue-300"
              bg="bg-blue-950/30 border-blue-900/50"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PageHeader() {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)' }}
      >
        <Brain className="h-5 w-5" style={{ color: '#A78BFA' }} />
      </div>
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--iq-text)' }}>ניתוח פסיכולוגי</h1>
        <p className="text-sm" style={{ color: 'var(--iq-text-3)' }}>
          הבן את דפוסי ההחלטה שלך ושפר את המשמעת
        </p>
      </div>
    </div>
  )
}

function InsightCard({
  emoji, label, text, color, bg,
}: {
  emoji: string; label: string; text: string; color: string; bg: string
}) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${bg}`}>
      <p className="text-[9px] uppercase tracking-wider text-zinc-500 mb-1">{emoji} {label}</p>
      <p className={`text-xs leading-relaxed ${color}`}>{text}</p>
    </div>
  )
}
