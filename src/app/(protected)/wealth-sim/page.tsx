'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  Loader2, Sparkles, AlertTriangle, Clock,
  TrendingUp, Zap, PiggyBank, BarChart2, LogOut, Umbrella,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type SimType = 'savings' | 'crash' | 'retirement' | 'return_rate' | 'withdrawal'

interface ChartPoint { year: number; baseline: number; scenario: number }

interface SimResult {
  chartData: ChartPoint[]
  table: { label: string; baseline: string; scenario: string }[]
  finalBaseline: number
  finalScenario: number
  type: SimType
  params: Record<string, number>
  insight: string
  warning?: string
  questionSummary: string
}

interface HistoryEntry {
  id: string
  question: string
  type: SimType
  finalBaseline: number
  finalScenario: number
  ts: number
}

// ─── Quick questions ──────────────────────────────────────────────────────────

interface QuickQuestion {
  label: string
  icon: React.ElementType
  type: SimType
  params: Record<string, number>
  question: string
  color: string
}

const QUICK: QuickQuestion[] = [
  {
    label: 'אחסוך ₪2,000 בחודש',
    icon: PiggyBank,
    type: 'savings',
    params: { monthlyAdd: 2000, annualReturn: 7, years: 25 },
    question: 'מה אם אחסוך ₪2,000 בחודש ב-7% שנתי ל-25 שנה?',
    color: '#6366f1',
  },
  {
    label: 'שוק ייפול 30%',
    icon: Umbrella,
    type: 'crash',
    params: { crashPercent: 30, recoveryYears: 4, annualReturn: 7 },
    question: 'מה אם השוק ייפול 30%?',
    color: '#ef4444',
  },
  {
    label: 'פרישה בעוד 20 שנה',
    icon: LogOut,
    type: 'retirement',
    params: { years: 20, monthlyAdd: 1500, annualReturn: 7, withdrawalRate: 4 },
    question: 'מה אם אפרוש בעוד 20 שנה עם הפקדה של ₪1,500 בחודש?',
    color: '#22c55e',
  },
  {
    label: 'תשואה שנתית 10%',
    icon: TrendingUp,
    type: 'return_rate',
    params: { newReturn: 10, baseReturn: 7, years: 20 },
    question: 'מה אם אגדיל תשואה שנתית ל-10%?',
    color: '#f59e0b',
  },
  {
    label: 'משיכה של 4% בשנה',
    icon: BarChart2,
    type: 'withdrawal',
    params: { withdrawalRate: 4, annualReturn: 6, years: 30 },
    question: 'מה אם אמשוך 4% בשנה מהתיק למשך 30 שנה?',
    color: '#06b6d4',
  },
  {
    label: 'הוסף ₪500 בחודש',
    icon: Zap,
    type: 'savings',
    params: { monthlyAdd: 500, annualReturn: 7, years: 20 },
    question: 'מה אם אוסיף ₪500 בחודש לתיק?',
    color: '#8b5cf6',
  },
]

// ─── Label maps ───────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<SimType, string> = {
  savings:     'תחזית חיסכון',
  crash:       'תרחיש נפילה',
  retirement:  'תכנון פרישה',
  return_rate: 'השוואת תשואות',
  withdrawal:  'תכנון משיכה',
}

const BASELINE_LABEL: Record<SimType, string> = {
  savings:     'ללא הפקדות',
  crash:       'ללא נפילה',
  retirement:  'ללא הפקדות',
  return_rate: 'תשואה נוכחית',
  withdrawal:  'ללא משיכות',
}

const SCENARIO_LABEL: Record<SimType, string> = {
  savings:     'עם הפקדות',
  crash:       'עם נפילה',
  retirement:  'עם הפקדות',
  return_rate: 'תשואה חדשה',
  withdrawal:  'עם משיכות',
}

// ─── Number formatting ────────────────────────────────────────────────────────

function compact(v: number): string {
  if (v >= 1_000_000) return `₪${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `₪${(v / 1_000).toFixed(0)}K`
  return `₪${Math.round(v).toLocaleString()}`
}

function sign(v: number): string {
  const diff = v
  if (diff >= 0) return `+${compact(diff)}`
  return compact(diff)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WealthSimPage() {
  const [portfolioValue, setPortfolioValue]   = useState<number>(100_000)
  const [portfolioReady, setPortfolioReady]   = useState(false)
  const [question, setQuestion]               = useState('')
  const [loading, setLoading]                 = useState(false)
  const [result, setResult]                   = useState<SimResult | null>(null)
  const [error, setError]                     = useState<string | null>(null)
  const [history, setHistory]                 = useState<HistoryEntry[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Load portfolio value ──────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/portfolio')
      .then(r => r.json())
      .then(data => {
        const by = data.byCurrency as Record<string, { totalValue: number }> | undefined
        if (by) {
          const ilsTotal = by['ILS']?.totalValue ?? 0
          const usdTotal = by['USD']?.totalValue ?? 0
          const total = ilsTotal > 0 ? ilsTotal : usdTotal > 0 ? usdTotal * 3.7 : 100_000
          if (total > 0) setPortfolioValue(Math.round(total))
        }
        setPortfolioReady(true)
      })
      .catch(() => setPortfolioReady(true))
  }, [])

  // ── Load history from localStorage ───────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem('iv_wealth_sim_history')
      if (raw) setHistory(JSON.parse(raw) as HistoryEntry[])
    } catch { /* ignore */ }
  }, [])

  function saveHistory(r: SimResult) {
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      question: r.questionSummary || r.type,
      type: r.type,
      finalBaseline: r.finalBaseline,
      finalScenario: r.finalScenario,
      ts: Date.now(),
    }
    setHistory(prev => {
      const next = [entry, ...prev].slice(0, 5)
      try { localStorage.setItem('iv_wealth_sim_history', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  // ── Run simulation ────────────────────────────────────────────────────────
  async function runSim(opts: { question: string; type?: SimType; params?: Record<string, number> }) {
    if (!portfolioReady) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const body: Record<string, unknown> = { question: opts.question, portfolioValue }
      if (opts.type && opts.params) { body.type = opts.type; body.params = opts.params }
      const res = await fetch('/api/wealth-sim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'שגיאה'); return }
      setResult(data as SimResult)
      saveHistory(data as SimResult)
    } catch {
      setError('שגיאת רשת — נסה שוב')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) return
    runSim({ question: question.trim() })
  }

  function handleQuick(q: QuickQuestion) {
    setQuestion(q.question)
    runSim({ question: q.question, type: q.type, params: q.params })
  }

  function handleHistoryClick(h: HistoryEntry) {
    setQuestion(h.question)
    runSim({ question: h.question })
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const diff = result ? result.finalScenario - result.finalBaseline : 0
  const isPositive = diff >= 0

  return (
    <main className="min-h-screen p-4 md:p-6" style={{ background: 'var(--iq-bg)' }}>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--iq-text)' }}>
              סימולטור עתידי
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--iq-text-3)' }}>
              שאל &ldquo;מה אם?&rdquo; וראה איך שינויים משפיעים על העושר שלך
            </p>
          </div>
          <div className="text-left shrink-0 rounded-xl px-4 py-2.5 border text-sm"
            style={{ background: 'var(--iq-elevated)', borderColor: 'var(--iq-border)' }}>
            <div className="text-xs mb-0.5" style={{ color: 'var(--iq-text-3)' }}>שווי תיק (בסיס)</div>
            <div className="font-bold text-base" style={{ color: 'var(--iq-text)' }}>
              {portfolioReady ? compact(portfolioValue) : '...'}
            </div>
          </div>
        </div>

        {/* ── Quick questions ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {QUICK.map(q => {
            const Icon = q.icon
            return (
              <button
                key={q.label}
                onClick={() => handleQuick(q)}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium text-right transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                style={{
                  background: `${q.color}12`,
                  borderColor: `${q.color}40`,
                  color: q.color,
                }}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{q.label}</span>
              </button>
            )
          })}
        </div>

        {/* ── Free text input ── */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder='שאל שאלה חופשית, למשל: "מה אם אחסוך ₪3,000 בחודש ב-8% ל-30 שנה?"'
            disabled={loading}
            className="flex-1 rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-1 focus:ring-indigo-500/40 disabled:opacity-50"
            style={{
              background: 'var(--iq-elevated)',
              border: '1px solid var(--iq-border)',
              color: 'var(--iq-text)',
            }}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 hover:brightness-110"
            style={{ background: '#6366f1', color: '#fff' }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="hidden sm:inline">הרץ</span>
          </button>
        </form>

        {/* ── Loading ── */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#6366f1' }} />
            <span className="text-sm" style={{ color: 'var(--iq-text-3)' }}>מריץ סימולציה...</span>
          </div>
        )}

        {/* ── Error ── */}
        {error && !loading && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ── Results ── */}
        {result && !loading && (
          <div className="space-y-4">

            {/* Title strip */}
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--iq-text-3)' }}>
                  {TYPE_LABEL[result.type]}
                </span>
                {result.questionSummary && (
                  <h2 className="text-base font-semibold mt-0.5" style={{ color: 'var(--iq-text)' }}>
                    {result.questionSummary}
                  </h2>
                )}
              </div>
              <div className={`text-lg font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                {sign(diff)}
              </div>
            </div>

            {/* Warning */}
            {result.warning && (
              <div className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                {result.warning}
              </div>
            )}

            {/* Chart + Table */}
            <div className="grid md:grid-cols-3 gap-4">

              {/* Chart — spans 2 cols */}
              <div className="md:col-span-2 rounded-xl p-4 border"
                style={{ background: 'var(--iq-elevated)', borderColor: 'var(--iq-border)' }}>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={result.chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="wsBL" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#64748b" />
                        <stop offset="100%" stopColor="#94a3b8" />
                      </linearGradient>
                      <linearGradient id="wsSC" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#818cf8" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis
                      dataKey="year"
                      tick={{ fontSize: 10, fill: '#71717a' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={v => `שנה ${v}`}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#71717a' }}
                      axisLine={false}
                      tickLine={false}
                      width={58}
                      tickFormatter={v => compact(v as number)}
                    />
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#a1a1aa' }}
                      labelFormatter={v => `שנה ${v}`}
                      formatter={(v, name) => [compact(v as number), name === 'baseline' ? BASELINE_LABEL[result.type] : SCENARIO_LABEL[result.type]]}
                    />
                    <Legend
                      formatter={(v) => v === 'baseline' ? BASELINE_LABEL[result.type] : SCENARIO_LABEL[result.type]}
                      wrapperStyle={{ fontSize: 11, color: 'var(--iq-text-3)' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="baseline"
                      stroke="#64748b"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="5 3"
                      isAnimationActive
                    />
                    <Line
                      type="monotone"
                      dataKey="scenario"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Comparison table */}
              <div className="rounded-xl p-4 border"
                style={{ background: 'var(--iq-elevated)', borderColor: 'var(--iq-border)' }}>
                <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--iq-text-3)' }}>
                  השוואה
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-1 pb-1.5 border-b text-[10px] font-semibold" style={{ borderColor: 'var(--iq-border)', color: 'var(--iq-text-3)' }}>
                    <span>מדד</span>
                    <span className="text-center">{BASELINE_LABEL[result.type]}</span>
                    <span className="text-center">{SCENARIO_LABEL[result.type]}</span>
                  </div>
                  {result.table.map((row, i) => (
                    <div key={i} className="grid grid-cols-3 gap-1 text-xs py-0.5">
                      <span style={{ color: 'var(--iq-text-3)' }}>{row.label}</span>
                      <span className="text-center font-mono" style={{ color: 'var(--iq-text-2)' }}>{row.baseline}</span>
                      <span className="text-center font-mono font-semibold" style={{ color: 'var(--iq-indigo)' }}>{row.scenario}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Insight */}
            {result.insight && (
              <div className="rounded-xl p-4 border"
                style={{ background: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.2)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4" style={{ color: '#6366f1' }} />
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6366f1' }}>
                    ניתוח AI
                  </span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--iq-text-2)' }}>
                  {result.insight}
                </p>
                <p className="text-[10px] mt-2" style={{ color: 'var(--iq-text-3)' }}>
                  לצורכי לימוד בלבד — אין לראות בכך ייעוץ השקעות
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── History ── */}
        {history.length > 0 && (
          <div className="rounded-xl border p-4"
            style={{ background: 'var(--iq-elevated)', borderColor: 'var(--iq-border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-3.5 w-3.5" style={{ color: 'var(--iq-text-3)' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--iq-text-3)' }}>
                סימולציות אחרונות
              </span>
            </div>
            <div className="space-y-1.5">
              {history.map(h => {
                const d = h.finalScenario - h.finalBaseline
                return (
                  <button
                    key={h.id}
                    onClick={() => handleHistoryClick(h)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm text-right transition-colors hover:bg-white/5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs shrink-0 font-medium px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                        {TYPE_LABEL[h.type]}
                      </span>
                      <span className="truncate text-xs" style={{ color: 'var(--iq-text-2)' }}>
                        {h.question}
                      </span>
                    </div>
                    <span className={`text-xs font-semibold shrink-0 ${d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {d >= 0 ? '+' : ''}{compact(Math.abs(d))}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
