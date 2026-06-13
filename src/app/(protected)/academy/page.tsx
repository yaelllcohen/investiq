'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  GraduationCap, TrendingUp, Trophy, BookOpen,
  CheckCircle, Clock, Loader2, AlertTriangle, RefreshCw,
  ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react'
import { LESSONS, WEEKLY_CHALLENGES, type Lesson } from '@/lib/lessons'

const LessonModal = dynamic(() => import('@/components/academy/lesson-modal'), { ssr: false })

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyLessonData {
  lesson: Lesson
  personalNote: string
  completedIds: string[]
  completedCount: number
  totalCount: number
  weeklyChallenge: {
    challenge: typeof WEEKLY_CHALLENGES[0]
    progress: string
    completed: boolean
  }
}

interface VPHolding {
  ticker: string
  name: string
  quantity: number
  avgPriceILS: number
  currentPriceILS: number
  value: number
  plAmount: number
  plPercent: number
  changePercent: number
}

interface VPData {
  cashILS: number
  holdings: VPHolding[]
  totalValue: number
  totalReturn: number
  totalReturnPct: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtILS(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `₪${(v / 1_000_000).toFixed(2)}M`
  if (Math.abs(v) >= 1_000) return `₪${(v / 1_000).toFixed(1)}K`
  return `₪${Math.round(v).toLocaleString()}`
}

const CATEGORY_ICONS: Record<string, string> = {
  'יסודות':     '📖',
  'ניתוח טכני': '📊',
  'פסיכולוגיה': '🧠',
  'אסטרטגיה':  '♟️',
  'ישראלי':     '🇮🇱',
}

const CATEGORIES = ['יסודות', 'ניתוח טכני', 'פסיכולוגיה', 'אסטרטגיה', 'ישראלי'] as const

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AcademyPage() {
  const [tab, setTab]                   = useState<'lessons' | 'portfolio'>('lessons')
  const [dailyData, setDailyData]       = useState<DailyLessonData | null>(null)
  const [loading, setLoading]           = useState(true)
  const [vpData, setVpData]             = useState<VPData | null>(null)
  const [vpLoading, setVpLoading]       = useState(false)
  const [vpError, setVpError]           = useState<string | null>(null)
  const [openLesson, setOpenLesson]     = useState<Lesson | null>(null)
  const [openNote, setOpenNote]         = useState('')
  const [openCats, setOpenCats]         = useState<Set<string>>(new Set(['יסודות']))
  const [tradeSymbol, setTradeSymbol]   = useState('')
  const [tradeQty, setTradeQty]         = useState('')
  const [tradeAction, setTradeAction]   = useState<'buy' | 'sell'>('buy')
  const [tradeLoading, setTradeLoading] = useState(false)
  const [tradeMsg, setTradeMsg]         = useState<string | null>(null)
  const [tradeMsgType, setTradeMsgType] = useState<'success' | 'error'>('success')
  const [resetConfirm, setResetConfirm] = useState(false)

  // ── Load daily lesson data ──────────────────────────────────────────────────
  const loadDaily = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/academy/daily-lesson')
      if (res.ok) setDailyData(await res.json() as DailyLessonData)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadDaily() }, [loadDaily])

  // ── Load VP data ────────────────────────────────────────────────────────────
  const loadVP = useCallback(async () => {
    setVpLoading(true)
    setVpError(null)
    try {
      const res = await fetch('/api/virtual-portfolio')
      if (!res.ok) throw new Error('שגיאה')
      setVpData(await res.json() as VPData)
    } catch {
      setVpError('שגיאה בטעינת התיק הוירטואלי')
    } finally {
      setVpLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'portfolio') void loadVP()
  }, [tab, loadVP])

  // ── Trade ───────────────────────────────────────────────────────────────────
  async function handleTrade(e: React.FormEvent) {
    e.preventDefault()
    const sym = tradeSymbol.trim().toUpperCase()
    const qty = parseFloat(tradeQty)
    if (!sym || !qty || qty <= 0) return
    setTradeLoading(true)
    setTradeMsg(null)
    try {
      const res = await fetch('/api/virtual-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: tradeAction, symbol: sym, quantity: qty }),
      })
      const data = await res.json() as { success?: boolean; error?: string; comment?: string; priceILS?: number }
      if (!res.ok) {
        setTradeMsg(data.error ?? 'שגיאה')
        setTradeMsgType('error')
      } else {
        setTradeMsg(data.comment ?? `${tradeAction === 'buy' ? 'קנית' : 'מכרת'} ${qty} × ${sym} ב-₪${data.priceILS?.toFixed(2) ?? '?'}`)
        setTradeMsgType('success')
        setTradeSymbol('')
        setTradeQty('')
        void loadVP()
      }
    } catch {
      setTradeMsg('שגיאת רשת')
      setTradeMsgType('error')
    } finally {
      setTradeLoading(false)
    }
  }

  async function handleReset() {
    if (!resetConfirm) { setResetConfirm(true); return }
    setResetConfirm(false)
    setTradeLoading(true)
    try {
      await fetch('/api/virtual-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      })
      void loadVP()
    } catch { /* ignore */ } finally {
      setTradeLoading(false)
    }
  }

  // ── Lesson open ─────────────────────────────────────────────────────────────
  function openLessonModal(lesson: Lesson, note?: string) {
    setOpenLesson(lesson)
    setOpenNote(note ?? '')
  }

  function handleLessonComplete() {
    setOpenLesson(null)
    void loadDaily()
  }

  const completedSet = new Set(dailyData?.completedIds ?? [])

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen p-4 md:p-6" style={{ background: 'var(--iq-bg)' }}>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-6 w-6" style={{ color: '#6366f1' }} />
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--iq-text)' }}>אקדמיה</h1>
              <p className="text-xs" style={{ color: 'var(--iq-text-3)' }}>למד השקעות דרך התיק האמיתי שלך</p>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--iq-border)' }}>
            {(['lessons', 'portfolio'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-4 py-1.5 text-sm font-medium transition-colors"
                style={{
                  background: tab === t ? '#6366f1' : 'var(--iq-elevated)',
                  color: tab === t ? '#fff' : 'var(--iq-text-3)',
                }}
              >
                {t === 'lessons' ? 'שיעורים' : 'תיק וירטואלי'}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════ LESSONS TAB ══════════════ */}
        {tab === 'lessons' && (
          <>
            {loading && (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#6366f1' }} />
              </div>
            )}

            {!loading && dailyData && (
              <>
                {/* ── Today's lesson card ── */}
                <div
                  className="rounded-2xl p-5 border"
                  style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(99,102,241,0.04) 100%)', borderColor: 'rgba(99,102,241,0.3)' }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6366f1' }}>
                          📚 שיעור היום
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                          {dailyData.lesson.duration} דקות
                        </span>
                      </div>
                      <h2 className="text-lg font-bold" style={{ color: 'var(--iq-text)' }}>
                        {dailyData.lesson.title}
                      </h2>
                      {dailyData.personalNote && (
                        <p className="text-xs" style={{ color: '#818cf8' }}>
                          💡 {dailyData.personalNote}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => openLessonModal(dailyData.lesson, dailyData.personalNote)}
                      className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
                      style={{ background: '#6366f1', color: '#fff' }}
                    >
                      <Sparkles className="h-4 w-4" />
                      התחל שיעור
                    </button>
                  </div>
                </div>

                {/* ── 3 stat cards ── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                  {/* Progress */}
                  <div className="rounded-xl p-4 border" style={{ background: 'var(--iq-elevated)', borderColor: 'var(--iq-border)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen className="h-4 w-4" style={{ color: '#6366f1' }} />
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--iq-text-3)' }}>התקדמות</span>
                    </div>
                    <div className="text-2xl font-bold mb-1" style={{ color: 'var(--iq-text)' }}>
                      {dailyData.completedCount}/{dailyData.totalCount}
                    </div>
                    <div className="text-xs mb-3" style={{ color: 'var(--iq-text-3)' }}>שיעורים הושלמו</div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.15)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ background: '#6366f1', width: `${(dailyData.completedCount / dailyData.totalCount) * 100}%` }}
                      />
                    </div>
                    <div className="text-[10px] mt-1.5" style={{ color: 'var(--iq-text-3)' }}>
                      {Math.round((dailyData.completedCount / dailyData.totalCount) * 100)}% הושלם
                    </div>
                  </div>

                  {/* Virtual portfolio mini */}
                  <div
                    className="rounded-xl p-4 border cursor-pointer transition-colors hover:border-indigo-500/40"
                    style={{ background: 'var(--iq-elevated)', borderColor: 'var(--iq-border)' }}
                    onClick={() => setTab('portfolio')}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="h-4 w-4" style={{ color: '#22c55e' }} />
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--iq-text-3)' }}>תיק וירטואלי</span>
                    </div>
                    {vpData ? (
                      <>
                        <div className="text-2xl font-bold mb-1" style={{ color: 'var(--iq-text)' }}>
                          {fmtILS(vpData.totalValue)}
                        </div>
                        <div className={`text-xs ${vpData.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {vpData.totalReturn >= 0 ? '+' : ''}{fmtILS(vpData.totalReturn)} ({vpData.totalReturnPct.toFixed(2)}%)
                        </div>
                      </>
                    ) : (
                      <div className="text-xs" style={{ color: 'var(--iq-text-3)' }}>לחץ לפתיחת תיק וירטואלי →</div>
                    )}
                    <div className="mt-3 text-xs font-medium" style={{ color: '#6366f1' }}>כנס לתיק →</div>
                  </div>

                  {/* Weekly challenge */}
                  <div className="rounded-xl p-4 border" style={{ background: 'var(--iq-elevated)', borderColor: 'var(--iq-border)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <Trophy className="h-4 w-4" style={{ color: '#f59e0b' }} />
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--iq-text-3)' }}>אתגר השבוע</span>
                      {dailyData.weeklyChallenge.completed && (
                        <CheckCircle className="h-3.5 w-3.5 text-green-400 mr-auto" />
                      )}
                    </div>
                    <div className="font-semibold text-sm mb-1" style={{ color: 'var(--iq-text)' }}>
                      {dailyData.weeklyChallenge.challenge.title}
                    </div>
                    <div className="text-xs mb-2" style={{ color: 'var(--iq-text-3)' }}>
                      {dailyData.weeklyChallenge.challenge.description}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(245,158,11,0.15)' }}>
                        {(() => {
                          const [cur, tot] = dailyData.weeklyChallenge.progress.split('/').map(Number)
                          const pct = tot > 0 ? Math.min((cur / tot) * 100, 100) : (dailyData.weeklyChallenge.completed ? 100 : 0)
                          return <div className="h-full rounded-full" style={{ background: '#f59e0b', width: `${pct}%` }} />
                        })()}
                      </div>
                      <span className="text-xs font-mono" style={{ color: '#f59e0b' }}>
                        {dailyData.weeklyChallenge.progress}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Lesson list by category ── */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--iq-text-3)' }}>כל השיעורים</h3>
                  {CATEGORIES.map(cat => {
                    const catLessons = LESSONS.filter(l => l.category === cat)
                    const catDone = catLessons.filter(l => completedSet.has(l.id)).length
                    const isOpen = openCats.has(cat)
                    return (
                      <div key={cat} className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--iq-border)' }}>
                        <button
                          className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/3"
                          style={{ background: 'var(--iq-elevated)' }}
                          onClick={() => setOpenCats(prev => {
                            const n = new Set(prev)
                            isOpen ? n.delete(cat) : n.add(cat)
                            return n
                          })}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-base">{CATEGORY_ICONS[cat]}</span>
                            <span className="font-semibold text-sm" style={{ color: 'var(--iq-text)' }}>{cat}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
                              {catDone}/{catLessons.length}
                            </span>
                          </div>
                          {isOpen ? <ChevronUp className="h-4 w-4" style={{ color: 'var(--iq-text-3)' }} /> : <ChevronDown className="h-4 w-4" style={{ color: 'var(--iq-text-3)' }} />}
                        </button>

                        {isOpen && (
                          <div className="divide-y" style={{ borderColor: 'var(--iq-border)' }}>
                            {catLessons.map(lesson => {
                              const done = completedSet.has(lesson.id)
                              const isToday = lesson.id === dailyData.lesson.id
                              return (
                                <button
                                  key={lesson.id}
                                  onClick={() => openLessonModal(lesson, isToday ? dailyData.personalNote : '')}
                                  className="w-full flex items-center justify-between px-4 py-3 text-right transition-colors hover:bg-white/3"
                                  style={{ background: isToday ? 'rgba(99,102,241,0.05)' : 'transparent' }}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    {done
                                      ? <CheckCircle className="h-4 w-4 shrink-0 text-green-400" />
                                      : <div className="h-4 w-4 shrink-0 rounded-full border-2" style={{ borderColor: isToday ? '#6366f1' : 'var(--iq-border)' }} />
                                    }
                                    <span className="text-sm truncate" style={{ color: done ? 'var(--iq-text-3)' : 'var(--iq-text)' }}>
                                      {lesson.title}
                                    </span>
                                    {isToday && (
                                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}>
                                        היום
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 mr-3">
                                    <Clock className="h-3 w-3" style={{ color: 'var(--iq-text-3)' }} />
                                    <span className="text-[10px]" style={{ color: 'var(--iq-text-3)' }}>{lesson.duration} דק'</span>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* ══════════════ PORTFOLIO TAB ══════════════ */}
        {tab === 'portfolio' && (
          <div className="space-y-4">

            {vpLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#6366f1' }} />
              </div>
            )}

            {vpError && (
              <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
                <AlertTriangle className="h-4 w-4" />
                {vpError}
                <button onClick={loadVP} className="mr-auto text-xs underline">נסה שוב</button>
              </div>
            )}

            {!vpLoading && vpData && (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'שווי כולל', value: fmtILS(vpData.totalValue), color: 'var(--iq-text)' },
                    { label: 'מזומן', value: fmtILS(vpData.cashILS), color: 'var(--iq-text-2)' },
                    { label: 'תשואה כוללת', value: `${vpData.totalReturn >= 0 ? '+' : ''}${fmtILS(vpData.totalReturn)}`, color: vpData.totalReturn >= 0 ? '#22c55e' : '#ef4444' },
                    { label: 'תשואה %', value: `${vpData.totalReturnPct >= 0 ? '+' : ''}${vpData.totalReturnPct.toFixed(2)}%`, color: vpData.totalReturnPct >= 0 ? '#22c55e' : '#ef4444' },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl p-3 border" style={{ background: 'var(--iq-elevated)', borderColor: 'var(--iq-border)' }}>
                      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--iq-text-3)' }}>{s.label}</div>
                      <div className="font-bold text-base" style={{ color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Holdings */}
                {vpData.holdings.length > 0 ? (
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--iq-border)' }}>
                    <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ background: 'var(--iq-elevated)', color: 'var(--iq-text-3)' }}>
                      החזקות
                    </div>
                    <div className="divide-y" style={{ borderColor: 'var(--iq-border)' }}>
                      {vpData.holdings.map(h => (
                        <div key={h.ticker} className="flex items-center justify-between px-4 py-3 text-sm">
                          <div className="min-w-0">
                            <div className="font-semibold" style={{ color: 'var(--iq-text)' }}>{h.ticker}</div>
                            <div className="text-xs truncate" style={{ color: 'var(--iq-text-3)' }}>{h.name} × {h.quantity}</div>
                          </div>
                          <div className="text-left mr-auto px-4">
                            <div className="font-mono text-sm" style={{ color: 'var(--iq-text)' }}>{fmtILS(h.value)}</div>
                            <div className="text-xs font-mono" style={{ color: 'var(--iq-text-3)' }}>₪{h.currentPriceILS.toFixed(2)}</div>
                          </div>
                          <div className="text-left shrink-0">
                            <div className={`font-mono text-sm ${h.plPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {h.plPercent >= 0 ? '+' : ''}{h.plPercent.toFixed(2)}%
                            </div>
                            <div className={`text-xs font-mono ${h.plAmount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {h.plAmount >= 0 ? '+' : ''}{fmtILS(h.plAmount)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border py-8 text-center text-sm" style={{ borderColor: 'var(--iq-border)', color: 'var(--iq-text-3)' }}>
                    התיק ריק — קנה נכס ראשון למטה
                  </div>
                )}

                {/* Trade form */}
                <div className="rounded-xl border p-4" style={{ background: 'var(--iq-elevated)', borderColor: 'var(--iq-border)' }}>
                  <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--iq-text-3)' }}>
                    ביצוע עסקה
                  </div>
                  <form onSubmit={handleTrade} className="flex flex-wrap gap-2 items-end">
                    <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--iq-border)' }}>
                      {(['buy', 'sell'] as const).map(a => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setTradeAction(a)}
                          className="px-3 py-2 text-xs font-semibold transition-colors"
                          style={{
                            background: tradeAction === a ? (a === 'buy' ? '#22c55e' : '#ef4444') : 'var(--iq-surface)',
                            color: tradeAction === a ? '#fff' : 'var(--iq-text-3)',
                          }}
                        >
                          {a === 'buy' ? 'קנייה' : 'מכירה'}
                        </button>
                      ))}
                    </div>
                    <input
                      value={tradeSymbol}
                      onChange={e => setTradeSymbol(e.target.value.toUpperCase())}
                      placeholder="סימבול (AAPL, BTC-USD)"
                      className="flex-1 min-w-32 h-9 px-3 text-xs rounded-lg outline-none"
                      style={{ background: 'var(--iq-surface)', border: '1px solid var(--iq-border)', color: 'var(--iq-text)' }}
                    />
                    <input
                      value={tradeQty}
                      onChange={e => setTradeQty(e.target.value)}
                      placeholder="כמות"
                      type="number"
                      min="0.001"
                      step="any"
                      className="w-24 h-9 px-3 text-xs rounded-lg outline-none"
                      style={{ background: 'var(--iq-surface)', border: '1px solid var(--iq-border)', color: 'var(--iq-text)' }}
                    />
                    <button
                      type="submit"
                      disabled={tradeLoading || !tradeSymbol || !tradeQty}
                      className="h-9 px-4 rounded-lg text-xs font-semibold transition-all hover:brightness-110 disabled:opacity-50"
                      style={{ background: tradeAction === 'buy' ? '#22c55e' : '#ef4444', color: '#fff' }}
                    >
                      {tradeLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (tradeAction === 'buy' ? 'קנה' : 'מכור')}
                    </button>
                  </form>

                  {tradeMsg && (
                    <div className="mt-2 rounded-lg px-3 py-2 text-xs"
                      style={{
                        background: tradeMsgType === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        border: `1px solid ${tradeMsgType === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.25)'}`,
                        color: tradeMsgType === 'success' ? '#22c55e' : '#ef4444',
                      }}>
                      {tradeMsg}
                    </div>
                  )}
                </div>

                {/* Reset */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={loadVP}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors hover:bg-white/5"
                    style={{ color: 'var(--iq-text-3)' }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    רענן
                  </button>
                  <button
                    onClick={handleReset}
                    className="text-xs px-3 py-2 rounded-lg border transition-colors"
                    style={{ borderColor: 'rgba(239,68,68,0.3)', color: resetConfirm ? '#ef4444' : 'var(--iq-text-3)' }}
                  >
                    {resetConfirm ? '⚠️ לחץ שוב לאישור איפוס' : 'אפס תיק'}
                  </button>
                </div>

                <p className="text-[10px] text-center" style={{ color: 'var(--iq-text-3)' }}>
                  תיק וירטואלי בלבד • מחירים אמיתיים בזמן אמת • אין עמלות • לצורכי לימוד
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Lesson Modal ── */}
      {openLesson && (
        <LessonModal
          lesson={openLesson}
          personalNote={openNote}
          onClose={() => setOpenLesson(null)}
          onComplete={(score) => { handleLessonComplete(); void score }}
        />
      )}
    </main>
  )
}
