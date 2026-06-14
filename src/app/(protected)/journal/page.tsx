'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, BookOpen, AlertTriangle, CheckCircle2, Clock, X, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface JournalEntry {
  id:           string
  ticker:       string
  action:       'buy' | 'sell'
  price:        number
  thesis:       string
  risk:         string
  target:       number
  reviewDate:   string
  outcome:      string | null
  closePrice:   number | null
  emotionTag:   string
  status:       'open' | 'closed'
  createdAt:    string
  currency:     string
  followedPlan: boolean | null
  movedStop:    string | null
  exitReason:   string | null
  exitNotes:    string | null
}

interface Analysis {
  successRate:        number
  commonMistake:      string
  worstEmotion:       string
  worstEmotionReason: string
  tip:                string
  costliestMistake?:  string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMOTION_LABELS: Record<string, string> = {
  FOMO:    '📈 FOMO',
  panic:   '😱 פאניקה',
  planned: '🎯 תכנון',
  other:   '💭 אחר',
}

const EMOTION_COLORS: Record<string, string> = {
  FOMO:    'bg-orange-900/40 text-orange-400 border-orange-800/50',
  panic:   'bg-red-900/40 text-red-400 border-red-800/50',
  planned: 'bg-green-900/40 text-green-400 border-green-800/50',
  other:   'bg-zinc-800 text-zinc-400 border-zinc-700',
}

const EXIT_REASON_LABELS: Record<string, string> = {
  target:         '🎯 יעד הושג',
  stop:           '🛑 סטופ הופעל',
  thesis_change:  '🔄 שינוי תזה',
  emotion:        '😰 יציאה רגשית',
  other:          '💭 אחר',
}

const MOVED_STOP_LABELS: Record<string, string> = {
  yes:     'כן',
  no:      'לא',
  no_stop: 'לא היה סטופ',
}

const defaultAdd: {
  ticker: string; action: 'buy' | 'sell'; price: string
  thesis: string; risk: string; target: string; reviewDate: string
  emotionTag: string; currency: string
} = {
  ticker: '', action: 'buy', price: '',
  thesis: '', risk: '', target: '', reviewDate: '', emotionTag: 'planned', currency: 'USD',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function consecutiveCount(entries: JournalEntry[], pred: (e: JournalEntry) => boolean): number {
  let count = 0
  for (const e of entries) {
    if (pred(e)) count++
    else break
  }
  return count
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JournalPage() {
  const [entries, setEntries]       = useState<JournalEntry[]>([])
  const [analysis, setAnalysis]     = useState<Analysis | null>(null)
  const [loading, setLoading]       = useState(true)
  const [showAdd, setShowAdd]       = useState(false)
  const [addForm, setAddForm]       = useState(defaultAdd)
  const [addError, setAddError]     = useState<string | null>(null)
  const [addBusy, setAddBusy]       = useState(false)
  const [closeTarget, setCloseTarget] = useState<JournalEntry | null>(null)
  const [closePrice, setClosePrice]   = useState('')
  const [closeFollowedPlan, setCloseFollowedPlan] = useState<boolean | null>(null)
  const [closeMoveStop, setCloseMoveStop]         = useState('')
  const [closeExitReason, setCloseExitReason]     = useState('')
  const [closeExitNotes, setCloseExitNotes]       = useState('')
  const [closeBusy, setCloseBusy]     = useState(false)
  const [closeError, setCloseError]   = useState<string | null>(null)
  const [showClosed, setShowClosed]   = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)

  const now = new Date()

  const open     = useMemo(() => entries.filter((e) => e.status === 'open'), [entries])
  const overdue  = useMemo(() => open.filter((e) => new Date(e.reviewDate) < now), [open])
  const upcoming = useMemo(() => open.filter((e) => new Date(e.reviewDate) >= now), [open])
  const closed   = useMemo(() => entries.filter((e) => e.status === 'closed'), [entries])

  // ── Pattern alerts: 2+ consecutive closed trades with the same issue ──────
  const patternAlerts = useMemo(() => {
    const alerts: { label: string; count: number }[] = []
    if (closed.length < 2) return alerts

    const movedN = consecutiveCount(closed, e => e.movedStop === 'yes')
    if (movedN >= 2) alerts.push({ label: 'הזזת סטופ', count: movedN })

    const notPlanN = consecutiveCount(closed, e => e.followedPlan === false)
    if (notPlanN >= 2) alerts.push({ label: 'סטייה מהתוכנית', count: notPlanN })

    const emotionN = consecutiveCount(closed, e => e.exitReason === 'emotion')
    if (emotionN >= 2) alerts.push({ label: 'יציאה רגשית', count: emotionN })

    return alerts
  }, [closed])

  // ── Monthly stats (client-side, for 3+ closed trades) ─────────────────────
  const monthlyStats = useMemo(() => {
    if (closed.length < 3) return null
    const withPlan = closed.filter(e => e.followedPlan !== null)
    const withStop = closed.filter(e => e.movedStop !== null)
    const withReason = closed.filter(e => e.exitReason !== null)

    const followedPct = withPlan.length > 0
      ? Math.round(withPlan.filter(e => e.followedPlan === true).length / withPlan.length * 100)
      : null

    const movedStopPct = withStop.length > 0
      ? Math.round(withStop.filter(e => e.movedStop === 'yes').length / withStop.length * 100)
      : null

    const reasonCounts = withReason.reduce<Record<string, number>>((acc, e) => {
      if (e.exitReason) acc[e.exitReason] = (acc[e.exitReason] ?? 0) + 1
      return acc
    }, {})
    const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    return { followedPct, movedStopPct, topReason, dataCount: withPlan.length }
  }, [closed])

  async function load(withAnalysis = false) {
    try {
      const url = withAnalysis ? '/api/journal?analysis=true' : '/api/journal'
      const res = await fetch(url)
      if (!res.ok) return
      const json = await res.json()
      setEntries(json.entries ?? [])
      if (json.analysis) setAnalysis(json.analysis)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function loadAnalysis() {
    setAnalysisLoading(true)
    await load(true)
    setAnalysisLoading(false)
  }

  // ── Add entry ──────────────────────────────────────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddBusy(true)
    setAddError(null)
    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker:     addForm.ticker.trim().toUpperCase(),
          action:     addForm.action,
          price:      parseFloat(addForm.price),
          thesis:     addForm.thesis,
          risk:       addForm.risk,
          target:     parseFloat(addForm.target),
          reviewDate: new Date(addForm.reviewDate).toISOString(),
          emotionTag: addForm.emotionTag,
          currency:   addForm.currency,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `שגיאה ${res.status}`)
      try { localStorage.setItem('iv_investment_score_stale', '1') } catch {}
      setShowAdd(false)
      setAddForm(defaultAdd)
      await load()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'שגיאה לא ידועה')
    } finally {
      setAddBusy(false)
    }
  }

  // ── Delete entry ───────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!window.confirm('האם למחוק את ההחלטה?')) return
    try {
      const res = await fetch(`/api/journal/${id}`, { method: 'DELETE' })
      if (res.ok) {
        try { localStorage.setItem('iv_investment_score_stale', '1') } catch {}
        setEntries((prev) => prev.filter((e) => e.id !== id))
      }
    } catch { /* ignore */ }
  }

  // ── Close trade ────────────────────────────────────────────────────────────

  async function handleClose(e: React.FormEvent) {
    e.preventDefault()
    if (!closeTarget) return
    if (!closeExitReason) { setCloseError('יש לבחור סיבת יציאה'); return }
    setCloseBusy(true)
    setCloseError(null)
    try {
      const res = await fetch(`/api/journal/${closeTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closePrice:   parseFloat(closePrice),
          followedPlan: closeFollowedPlan,
          movedStop:    closeMoveStop || null,
          exitReason:   closeExitReason || null,
          exitNotes:    closeExitNotes.trim() || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `שגיאה ${res.status}`)
      resetCloseDialog()
      await load()
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'שגיאה לא ידועה')
    } finally {
      setCloseBusy(false)
    }
  }

  function resetCloseDialog() {
    setCloseTarget(null)
    setClosePrice('')
    setCloseFollowedPlan(null)
    setCloseMoveStop('')
    setCloseExitReason('')
    setCloseExitNotes('')
    setCloseError(null)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function pl(entry: JournalEntry) {
    if (entry.closePrice == null) return null
    return (entry.closePrice - entry.price) / entry.price * 100 * (entry.action === 'buy' ? 1 : -1)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <h1 className="text-xl font-bold tracking-wider uppercase flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-400" />
              Trade Replay — יומן החלטות
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">{entries.length} החלטות · {open.length} פתוחות · {closed.length} סגורות</p>
          </div>
          <Button
            onClick={() => { setShowAdd(true); setAddError(null) }}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            הוסף החלטה
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* ── Pattern Alerts ─────────────────────────────────────────────────── */}
        {patternAlerts.length > 0 && (
          <div className="space-y-2">
            {patternAlerts.map((a) => (
              <div key={a.label} className="flex items-center gap-3 bg-red-950/40 border border-red-800/60 rounded-lg px-4 py-2.5">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                <p className="text-xs text-red-300 font-semibold">
                  ⚠️ דפוס חוזר: {a.label} — {a.count} עסקאות ברצף
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── Overdue ────────────────────────────────────────────────────────── */}
        {overdue.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                דורש סקירה ({overdue.length})
              </h2>
            </div>
            <div className="space-y-3">
              {overdue.map((e) => (
                <EntryCard key={e.id} entry={e} overdue
                  onClose={() => { setCloseTarget(e); setCloseError(null) }}
                  onDelete={() => handleDelete(e.id)} />
              ))}
            </div>
          </section>
        )}

        {/* ── Upcoming open ──────────────────────────────────────────────────── */}
        {upcoming.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-zinc-400" />
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                עסקאות פתוחות ({upcoming.length})
              </h2>
            </div>
            <div className="space-y-3">
              {upcoming.map((e) => (
                <EntryCard key={e.id} entry={e}
                  onClose={() => { setCloseTarget(e); setCloseError(null) }}
                  onDelete={() => handleDelete(e.id)} />
              ))}
            </div>
          </section>
        )}

        {open.length === 0 && (
          <div className="text-center py-12 text-zinc-600 text-sm border border-zinc-800 rounded-lg">
            אין עסקאות פתוחות. לחץ &quot;הוסף החלטה&quot; כדי להתחיל.
          </div>
        )}

        {/* ── Closed ─────────────────────────────────────────────────────────── */}
        {closed.length > 0 && (
          <section>
            <button
              onClick={() => setShowClosed((s) => !s)}
              className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-300 transition-colors"
            >
              {showClosed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              עסקאות סגורות ({closed.length})
            </button>
            {showClosed && (
              <div className="space-y-3 mt-3">
                {closed.map((e) => (
                  <ClosedCard key={e.id} entry={e} pl={pl(e)} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Trade Replay Monthly Stats ─────────────────────────────────────── */}
        {monthlyStats && (
          <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                📊 Trade Replay — ניתוח ביצועים
              </h2>
              <span className="text-[10px] text-zinc-600">{closed.length} עסקאות סגורות</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-zinc-800/60 rounded px-3 py-3 text-center">
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">ציות לתוכנית</p>
                {monthlyStats.followedPct !== null ? (
                  <p className={`text-xl font-black ${monthlyStats.followedPct >= 70 ? 'text-green-400' : monthlyStats.followedPct >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {monthlyStats.followedPct}%
                  </p>
                ) : (
                  <p className="text-sm text-zinc-600">–</p>
                )}
              </div>
              <div className="bg-zinc-800/60 rounded px-3 py-3 text-center">
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">הזזת סטופ</p>
                {monthlyStats.movedStopPct !== null ? (
                  <p className={`text-xl font-black ${monthlyStats.movedStopPct <= 20 ? 'text-green-400' : monthlyStats.movedStopPct <= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {monthlyStats.movedStopPct}%
                  </p>
                ) : (
                  <p className="text-sm text-zinc-600">–</p>
                )}
              </div>
              <div className="bg-zinc-800/60 rounded px-3 py-3 text-center">
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">יציאה נפוצה</p>
                {monthlyStats.topReason ? (
                  <p className="text-xs font-bold text-zinc-200 mt-1">{EXIT_REASON_LABELS[monthlyStats.topReason] ?? monthlyStats.topReason}</p>
                ) : (
                  <p className="text-sm text-zinc-600">–</p>
                )}
              </div>
            </div>

            {/* AI insight */}
            {analysis?.costliestMistake ? (
              <div className="bg-red-950/30 border border-red-900/50 rounded px-3 py-2.5">
                <p className="text-[9px] text-red-500 uppercase tracking-wider mb-1">⚡ הטעות שעולה לך הכי הרבה כסף</p>
                <p className="text-xs text-red-300 leading-relaxed">{analysis.costliestMistake}</p>
              </div>
            ) : (
              <Button
                onClick={loadAnalysis}
                disabled={analysisLoading || entries.length < 3}
                variant="outline"
                className="w-full border-zinc-700 text-zinc-400 hover:text-zinc-100 text-[10px] h-7"
              >
                {analysisLoading ? 'מנתח...' : '⚡ קבל ניתוח AI — הטעות הכי יקרה שלך'}
              </Button>
            )}
          </section>
        )}

        {/* ── AI Analysis ────────────────────────────────────────────────────── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">ניתוח AI — דפוסי החלטה</h2>
            {entries.length >= 3 && (
              <Button
                onClick={loadAnalysis}
                disabled={analysisLoading}
                variant="outline"
                className="border-zinc-700 text-zinc-400 hover:text-zinc-100 text-[10px] h-7 px-2.5"
              >
                {analysisLoading ? 'מנתח...' : 'רענן ניתוח'}
              </Button>
            )}
          </div>

          {entries.length < 3 ? (
            <p className="text-zinc-600 text-xs text-center py-4">
              הוסף לפחות 3 החלטות לקבלת ניתוח AI ({entries.length}/3)
            </p>
          ) : !analysis ? (
            <div className="text-center py-4">
              <p className="text-zinc-600 text-xs mb-3">לחץ על &quot;רענן ניתוח&quot; לניתוח AI של ההחלטות שלך</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-800/60 rounded px-3 py-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">אחוז הצלחה</p>
                  <p className={`text-xl font-black ${analysis.successRate >= 60 ? 'text-green-400' : analysis.successRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {analysis.successRate}%
                  </p>
                </div>
                <div className="bg-zinc-800/60 rounded px-3 py-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">רגש מסוכן</p>
                  <p className="text-sm font-bold text-orange-400">{EMOTION_LABELS[analysis.worstEmotion] ?? analysis.worstEmotion}</p>
                </div>
                <div className="bg-zinc-800/60 rounded px-3 py-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">סגורות</p>
                  <p className="text-xl font-black text-zinc-100">{closed.length}</p>
                </div>
              </div>

              <div className="space-y-2">
                <InsightRow label="טעות נפוצה" value={analysis.commonMistake} color="text-red-300" />
                <InsightRow label={`${EMOTION_LABELS[analysis.worstEmotion] ?? analysis.worstEmotion} — למה?`} value={analysis.worstEmotionReason} color="text-orange-300" />
                <InsightRow label="💡 טיפ לשיפור" value={analysis.tip} color="text-blue-300" />
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── Add Dialog ────────────────────────────────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) { setAddForm(defaultAdd); setAddError(null) } }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-zinc-100 font-mono text-base">הוסף החלטת השקעה</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAdd} className="space-y-4 mt-1">
            {/* Ticker + Action + Currency */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">סמל</Label>
                <Input value={addForm.ticker} onChange={(e) => setAddForm({ ...addForm, ticker: e.target.value.toUpperCase() })}
                  placeholder="AAPL" required className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">פעולה</Label>
                <Select value={addForm.action} onValueChange={(v) => setAddForm({ ...addForm, action: v as 'buy' | 'sell' })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">קנייה</SelectItem>
                    <SelectItem value="sell">מכירה</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">מטבע</Label>
                <Select value={addForm.currency} onValueChange={(v) => setAddForm({ ...addForm, currency: v })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">$ USD</SelectItem>
                    <SelectItem value="ILS">₪ ILS</SelectItem>
                    <SelectItem value="EUR">€ EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Price + Target */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">מחיר כניסה</Label>
                <Input type="number" step="any" min="0" value={addForm.price} onChange={(e) => setAddForm({ ...addForm, price: e.target.value })}
                  placeholder="150" required className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">יעד מחיר</Label>
                <Input type="number" step="any" min="0" value={addForm.target} onChange={(e) => setAddForm({ ...addForm, target: e.target.value })}
                  placeholder="180" required className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs" />
              </div>
            </div>

            {/* Review date + Emotion */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">תאריך בדיקה</Label>
                <Input type="date" value={addForm.reviewDate} onChange={(e) => setAddForm({ ...addForm, reviewDate: e.target.value })}
                  required className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">רגש / מניע</Label>
                <Select value={addForm.emotionTag} onValueChange={(v) => setAddForm({ ...addForm, emotionTag: v })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">🎯 תכנון</SelectItem>
                    <SelectItem value="FOMO">📈 FOMO</SelectItem>
                    <SelectItem value="panic">😱 פאניקה</SelectItem>
                    <SelectItem value="other">💭 אחר</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">תזה — למה קנית/מכרת?</Label>
              <textarea value={addForm.thesis} onChange={(e) => setAddForm({ ...addForm, thesis: e.target.value })}
                required rows={3} placeholder="הסבר את ההיגיון מאחורי ההחלטה..."
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 rounded-md px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">סיכון — מה יכול להשתבש?</Label>
              <textarea value={addForm.risk} onChange={(e) => setAddForm({ ...addForm, risk: e.target.value })}
                required rows={2} placeholder="פרט את הסיכונים העיקריים..."
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 rounded-md px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>

            {addError && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded px-3 py-2">{addError}</p>
            )}

            <DialogFooter className="pt-1">
              <Button type="button" variant="outline" onClick={() => { setShowAdd(false); setAddForm(defaultAdd) }}
                className="border-zinc-700 text-zinc-400 text-xs h-8">ביטול</Button>
              <Button type="submit" disabled={addBusy} className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8">
                {addBusy ? 'שומר...' : 'שמור החלטה'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Close Dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={!!closeTarget} onOpenChange={(o) => { if (!o) resetCloseDialog() }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-zinc-100 font-mono text-base">
              סגור עסקה — {closeTarget?.ticker}
            </DialogTitle>
          </DialogHeader>

          {closeTarget && (
            <div className="text-xs text-zinc-500 space-y-0.5 -mt-2">
              <p>כניסה: <span className="text-zinc-300">{formatCurrency(closeTarget.price, closeTarget.currency ?? 'USD')}</span>
              &nbsp;·&nbsp; יעד: <span className="text-zinc-300">{formatCurrency(closeTarget.target, closeTarget.currency ?? 'USD')}</span></p>
            </div>
          )}

          <form onSubmit={handleClose} className="space-y-5">
            {/* Exit price */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">מחיר יציאה</Label>
              <Input type="number" step="any" min="0" value={closePrice} onChange={(e) => setClosePrice(e.target.value)}
                placeholder="165.50" required autoFocus
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs" />
              {closePrice && closeTarget && (() => {
                const pct = (parseFloat(closePrice) - closeTarget.price) / closeTarget.price * 100 * (closeTarget.action === 'buy' ? 1 : -1)
                return (
                  <p className={`text-[10px] font-semibold ${pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {pct >= 0 ? '+' : ''}{pct.toFixed(2)}% P&L
                  </p>
                )
              })()}
            </div>

            <div className="h-px bg-zinc-800" />

            {/* Followed plan */}
            <div className="space-y-2">
              <Label className="text-zinc-300 text-xs font-semibold">האם פעלת לפי התוכנית המקורית?</Label>
              <div className="flex gap-2">
                {([true, false] as const).map((v) => (
                  <button key={String(v)} type="button"
                    onClick={() => setCloseFollowedPlan(v)}
                    className={`flex-1 py-1.5 rounded border text-xs font-medium transition-all ${
                      closeFollowedPlan === v
                        ? v ? 'border-green-500 bg-green-950/50 text-green-300' : 'border-red-500 bg-red-950/50 text-red-300'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {v ? 'כן ✅' : 'לא ❌'}
                  </button>
                ))}
              </div>
            </div>

            {/* Moved stop */}
            <div className="space-y-2">
              <Label className="text-zinc-300 text-xs font-semibold">האם הזזת סטופ?</Label>
              <div className="flex gap-2">
                {(['yes', 'no', 'no_stop'] as const).map((v) => (
                  <button key={v} type="button"
                    onClick={() => setCloseMoveStop(v)}
                    className={`flex-1 py-1.5 rounded border text-xs font-medium transition-all ${
                      closeMoveStop === v
                        ? v === 'yes' ? 'border-orange-500 bg-orange-950/50 text-orange-300' : 'border-zinc-500 bg-zinc-700 text-zinc-200'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {v === 'yes' ? 'כן' : v === 'no' ? 'לא' : 'לא היה'}
                  </button>
                ))}
              </div>
            </div>

            {/* Exit reason */}
            <div className="space-y-2">
              <Label className="text-zinc-300 text-xs font-semibold">סיבת היציאה <span className="text-red-400">*</span></Label>
              <div className="grid grid-cols-3 gap-1.5">
                {Object.entries(EXIT_REASON_LABELS).map(([v, label]) => (
                  <button key={v} type="button"
                    onClick={() => setCloseExitReason(v)}
                    className={`py-1.5 px-2 rounded border text-[10px] font-medium transition-all text-center ${
                      closeExitReason === v
                        ? 'border-blue-500 bg-blue-950/50 text-blue-300'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Free notes */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">הערות חופשיות (אופציונלי)</Label>
              <textarea value={closeExitNotes} onChange={(e) => setCloseExitNotes(e.target.value)}
                rows={2} placeholder="מה למדת? מה הייית עושה אחרת?"
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 rounded-md px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>

            {closeError && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded px-3 py-2">{closeError}</p>
            )}

            <DialogFooter className="pt-1">
              <Button type="button" variant="outline" onClick={resetCloseDialog}
                className="border-zinc-700 text-zinc-400 text-xs h-8">ביטול</Button>
              <Button type="submit" disabled={closeBusy} className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8">
                {closeBusy ? 'סוגר...' : 'סגור עסקה'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Entry Card (open) ────────────────────────────────────────────────────────

function EntryCard({ entry, overdue, onClose, onDelete }: { entry: JournalEntry; overdue?: boolean; onClose: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const daysUntil = Math.ceil((new Date(entry.reviewDate).getTime() - Date.now()) / 86400000)

  return (
    <div className={`bg-zinc-900 border rounded-lg overflow-hidden transition-colors ${
      overdue ? 'border-red-800/70 bg-red-950/10' : 'border-zinc-800'
    }`}>
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`text-xs font-black px-2 py-0.5 rounded ${entry.action === 'buy' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
            {entry.action === 'buy' ? 'קנה' : 'מכר'}
          </span>
          <span className="font-bold text-blue-400">{entry.ticker}</span>
          <span className="text-zinc-400 text-xs">{formatCurrency(entry.price, entry.currency ?? 'USD')}</span>
          <span className="text-zinc-600 text-xs">→ {formatCurrency(entry.target, entry.currency ?? 'USD')}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${EMOTION_COLORS[entry.emotionTag] ?? EMOTION_COLORS.other}`}>
            {EMOTION_LABELS[entry.emotionTag] ?? entry.emotionTag}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className={`text-[10px] flex items-center gap-1 ${overdue ? 'text-red-400' : 'text-zinc-500'}`}>
            <Clock className="h-3 w-3" />
            {overdue ? `פג לפני ${Math.abs(daysUntil)}י` : `בעוד ${daysUntil}י`}
          </div>
          <button onClick={() => setExpanded((s) => !s)} className="text-zinc-600 hover:text-zinc-300 transition-colors">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <Button onClick={onClose} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] h-6 px-2">
            סגור עסקה
          </Button>
          <button type="button" onClick={onDelete} title="מחק החלטה"
            className="text-zinc-700 hover:text-red-400 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-2 text-xs">
          <div>
            <p className="text-zinc-500 font-semibold mb-0.5">תזה</p>
            <p className="text-zinc-300 leading-relaxed">{entry.thesis}</p>
          </div>
          <div>
            <p className="text-zinc-500 font-semibold mb-0.5">סיכון</p>
            <p className="text-zinc-400 leading-relaxed">{entry.risk}</p>
          </div>
          <p className="text-zinc-600">נוסף: {new Date(entry.createdAt).toLocaleDateString('he-IL')}</p>
        </div>
      )}
    </div>
  )
}

// ─── Closed Card ──────────────────────────────────────────────────────────────

function ClosedCard({ entry, pl }: { entry: JournalEntry; pl: number | null }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden opacity-80">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <CheckCircle2 className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
          <span className={`text-xs font-black px-2 py-0.5 rounded ${entry.action === 'buy' ? 'bg-green-900/30 text-green-600' : 'bg-red-900/30 text-red-600'}`}>
            {entry.action === 'buy' ? 'קנה' : 'מכר'}
          </span>
          <span className="font-bold text-zinc-400">{entry.ticker}</span>
          <span className="text-zinc-600 text-xs">
            {formatCurrency(entry.price, entry.currency ?? 'USD')} → {formatCurrency(entry.closePrice ?? 0, entry.currency ?? 'USD')}
          </span>
          {pl != null && (
            <span className={`text-xs font-semibold ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {pl >= 0 ? '+' : ''}{pl.toFixed(2)}%
            </span>
          )}
          {/* Replay badges */}
          {entry.followedPlan !== null && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${entry.followedPlan ? 'border-green-800 text-green-500' : 'border-red-800 text-red-500'}`}>
              {entry.followedPlan ? '✅ לפי תוכנית' : '❌ חרג מתוכנית'}
            </span>
          )}
          {entry.exitReason && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-500">
              {EXIT_REASON_LABELS[entry.exitReason] ?? entry.exitReason}
            </span>
          )}
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${EMOTION_COLORS[entry.emotionTag] ?? EMOTION_COLORS.other}`}>
            {EMOTION_LABELS[entry.emotionTag] ?? entry.emotionTag}
          </span>
        </div>
        <button onClick={() => setExpanded((s) => !s)} className="text-zinc-600 hover:text-zinc-300 shrink-0">
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-2 text-xs">
          <div><p className="text-zinc-500 font-semibold mb-0.5">תזה מקורית</p><p className="text-zinc-400 leading-relaxed">{entry.thesis}</p></div>

          {/* Trade Replay details */}
          <div className="grid grid-cols-3 gap-2 bg-zinc-800/40 rounded p-2">
            <div>
              <p className="text-[9px] text-zinc-600 uppercase mb-0.5">ציות תוכנית</p>
              <p className={`text-xs font-semibold ${entry.followedPlan === true ? 'text-green-400' : entry.followedPlan === false ? 'text-red-400' : 'text-zinc-600'}`}>
                {entry.followedPlan === true ? 'כן' : entry.followedPlan === false ? 'לא' : '–'}
              </p>
            </div>
            <div>
              <p className="text-[9px] text-zinc-600 uppercase mb-0.5">הזזת סטופ</p>
              <p className={`text-xs font-semibold ${entry.movedStop === 'yes' ? 'text-orange-400' : 'text-zinc-400'}`}>
                {entry.movedStop ? MOVED_STOP_LABELS[entry.movedStop] : '–'}
              </p>
            </div>
            <div>
              <p className="text-[9px] text-zinc-600 uppercase mb-0.5">סיבת יציאה</p>
              <p className="text-xs font-semibold text-zinc-300">
                {entry.exitReason ? EXIT_REASON_LABELS[entry.exitReason] : '–'}
              </p>
            </div>
          </div>

          {entry.exitNotes && (
            <div>
              <p className="text-zinc-500 font-semibold mb-0.5">הערות</p>
              <p className="text-zinc-400 leading-relaxed">{entry.exitNotes}</p>
            </div>
          )}
          {entry.outcome && (
            <div>
              <p className="text-zinc-500 font-semibold mb-0.5">מה קרה</p>
              <p className="text-zinc-300 leading-relaxed">{entry.outcome}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── InsightRow ───────────────────────────────────────────────────────────────

function InsightRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-zinc-800/40 rounded px-3 py-2.5">
      <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xs leading-relaxed ${color}`}>{value}</p>
    </div>
  )
}
