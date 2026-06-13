'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Target, Plus, Pencil, Trash2, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import type { ChartPoint } from '@/components/goals/goal-chart'

const GoalChart = dynamic(() => import('@/components/goals/goal-chart'), {
  ssr: false,
  loading: () => (
    <div className="h-40 flex items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-500" />
    </div>
  ),
})

// ─── Types ────────────────────────────────────────────────────────────────────

type DepositFreq = 'monthly' | 'quarterly' | 'yearly' | 'onetime'

interface Goal {
  id:               string
  name:             string
  targetAmount:     number
  currentAmount:    number
  monthlyDeposit:   number
  depositFrequency: DepositFreq
  targetDate:       string
  expectedReturn:   number
  currency:         'ILS' | 'USD'
  icon:             string
  status:           'active' | 'completed'
  createdAt:        string
}

interface Projection {
  monthsRemaining:    number
  projectedTotal:     number
  successProbability: number
  requiredDeposit:    number
  requiredLabel:      string
  remaining:          number
  chartData:          ChartPoint[]
  statusColor:        'green' | 'yellow' | 'red'
}

// ─── Financial calculations ───────────────────────────────────────────────────

const FREQ_LABEL: Record<DepositFreq, string> = {
  monthly:   'נדרש/חודש',
  quarterly: "נדרש/רבעון",
  yearly:    'נדרש/שנה',
  onetime:   "נדרש (חד פ')",
}

function calcProjection(goal: Goal): Projection {
  const now  = new Date()
  const end  = new Date(goal.targetDate)
  const n    = Math.max(0,
    (end.getFullYear() - now.getFullYear()) * 12 +
    (end.getMonth()    - now.getMonth())
  )
  const r    = goal.expectedReturn / 100 / 12
  const freq = (goal.depositFrequency ?? 'monthly') as DepositFreq
  const dep  = goal.monthlyDeposit  // amount per chosen period

  // ── Simulate month-by-month (accurate for all frequencies) ──
  let balance = goal.currentAmount + (freq === 'onetime' ? dep : 0)
  const step  = n <= 60 ? 1 : Math.ceil(n / 60)
  const chartData: ChartPoint[] = []

  const pushPoint = (m: number) => {
    const d = new Date(now)
    d.setMonth(d.getMonth() + m)
    chartData.push({
      label:     d.toLocaleDateString('he-IL', { year: '2-digit', month: 'short' }),
      projected: Math.round(balance),
    })
  }
  pushPoint(0)

  for (let m = 1; m <= n; m++) {
    balance *= (1 + r)
    if (freq === 'monthly')                           balance += dep
    else if (freq === 'quarterly' && m % 3  === 0)   balance += dep
    else if (freq === 'yearly'    && m % 12 === 0)   balance += dep
    if (m % step === 0 || m === n) pushPoint(m)
  }

  const projectedTotal     = balance
  const successProbability = goal.targetAmount > 0
    ? Math.min(100, Math.round((projectedTotal / goal.targetAmount) * 100))
    : 100

  // ── Required deposit per period ──
  let requiredDeposit = 0
  if (freq === 'onetime') {
    // Lump-sum needed today (on top of currentAmount) to reach target
    const pv = n > 0 ? goal.targetAmount / Math.pow(1 + r, n) : goal.targetAmount
    requiredDeposit = Math.max(0, pv - goal.currentAmount)
  } else {
    let r_p: number, n_p: number
    if      (freq === 'quarterly') { r_p = Math.pow(1 + r, 3)  - 1; n_p = Math.floor(n / 3)  }
    else if (freq === 'yearly')    { r_p = Math.pow(1 + r, 12) - 1; n_p = Math.floor(n / 12) }
    else                           { r_p = r;                        n_p = n                  }

    if (n_p > 0) {
      const fvCurr     = goal.currentAmount * Math.pow(1 + r, n)
      const shortage   = goal.targetAmount - fvCurr
      requiredDeposit  = r_p > 0
        ? Math.max(0, shortage * r_p / (Math.pow(1 + r_p, n_p) - 1))
        : Math.max(0, shortage / n_p)
    }
  }

  const statusColor: Projection['statusColor'] =
    successProbability >= 90 ? 'green' :
    successProbability >= 60 ? 'yellow' : 'red'

  return {
    monthsRemaining:    n,
    projectedTotal,
    successProbability,
    requiredDeposit,
    requiredLabel:      FREQ_LABEL[freq],
    remaining:          Math.max(0, goal.targetAmount - goal.currentAmount),
    chartData,
    statusColor,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, currency: string) {
  const sym = currency === 'ILS' ? '₪' : currency === 'EUR' ? '€' : '$'
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${sym}${(n / 1_000).toFixed(0)}K`
  return `${sym}${Math.round(n).toLocaleString('he-IL')}`
}

const STATUS_BADGE = {
  green:  { label: '✅ בדרך הנכונה',    cls: 'bg-green-900/40 text-green-400 border-green-800/50' },
  yellow: { label: '⚠️ להגדיל הפקדה',  cls: 'bg-yellow-900/40 text-yellow-400 border-yellow-800/50' },
  red:    { label: '🚨 לא מציאותי',     cls: 'bg-red-900/40 text-red-400 border-red-800/50' },
}

const PROB_COLOR = { green: 'text-green-400', yellow: 'text-yellow-400', red: 'text-red-400' }
const BAR_COLOR  = { green: 'bg-green-500',   yellow: 'bg-yellow-500',   red: 'bg-red-500' }

const ICONS = ['💰', '🏠', '🎓', '🌴', '🚗', '✈️', '👶', '💍', '📈', '🏖️', '🏋️', '🎯']

type FormState = {
  name: string; icon: string; currency: 'ILS' | 'USD' | 'EUR'
  targetAmount: string; currentAmount: string
  monthlyDeposit: string; depositFrequency: DepositFreq
  targetDate: string; expectedReturn: string
}

const defaultForm: FormState = {
  name: '', icon: '💰', currency: 'ILS',
  targetAmount: '', currentAmount: '0',
  monthlyDeposit: '', depositFrequency: 'monthly',
  targetDate: '', expectedReturn: '7',
}

// ─── StatBox ─────────────────────────────────────────────────────────────────

function StatBox({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="bg-zinc-800/50 rounded-lg px-2.5 py-2 text-center">
      <p className="text-[9px] text-zinc-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-xs font-bold ${cls ?? 'text-zinc-200'}`}>{value}</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const [goals, setGoals]           = useState<Goal[]>([])
  const [loading, setLoading]       = useState(true)
  const [showAdd, setShowAdd]       = useState(false)
  const [editTarget, setEditTarget] = useState<Goal | null>(null)
  const [updateTarget, setUpdateTarget] = useState<Goal | null>(null)
  const [updateAmt, setUpdateAmt]   = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [form, setForm]             = useState<FormState>(defaultForm)
  const [busy, setBusy]             = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)

  useEffect(() => { fetchGoals() }, [])

  useEffect(() => {
    if (editTarget) {
      setForm({
        name:             editTarget.name,
        icon:             editTarget.icon,
        currency:         editTarget.currency,
        targetAmount:     editTarget.targetAmount.toString(),
        currentAmount:    editTarget.currentAmount.toString(),
        monthlyDeposit:   editTarget.monthlyDeposit.toString(),
        depositFrequency: editTarget.depositFrequency ?? 'monthly',
        targetDate:       editTarget.targetDate.slice(0, 10),
        expectedReturn:   editTarget.expectedReturn.toString(),
      })
    }
  }, [editTarget])

  async function fetchGoals() {
    try {
      const res  = await fetch('/api/goals')
      const text = await res.text()
      if (!text) return
      const data = JSON.parse(text)
      if (Array.isArray(data)) setGoals(data)
    } catch (err) {
      console.error('[goals] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError(null)
    try {
      const body = {
        name:             form.name,
        icon:             form.icon,
        currency:         form.currency,
        targetAmount:     parseFloat(form.targetAmount),
        currentAmount:    parseFloat(form.currentAmount) || 0,
        monthlyDeposit:   parseFloat(form.monthlyDeposit) || 0,
        depositFrequency: form.depositFrequency,
        targetDate:       new Date(form.targetDate).toISOString(),
        expectedReturn:   parseFloat(form.expectedReturn) || 7,
      }
      const url    = editTarget ? `/api/goals/${editTarget.id}` : '/api/goals'
      const method = editTarget ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `שגיאה ${res.status}`)
      setShowAdd(false)
      setEditTarget(null)
      setForm(defaultForm)
      await fetchGoals()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'שגיאה לא ידועה')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('למחוק את המטרה?')) return
    const res = await fetch(`/api/goals/${id}`, { method: 'DELETE' })
    if (res.ok) setGoals((g) => g.filter((x) => x.id !== id))
  }

  async function handleUpdateAmount(e: React.FormEvent) {
    e.preventDefault()
    if (!updateTarget) return
    setUpdateBusy(true)
    setUpdateError(null)
    try {
      const newAmount = parseFloat(updateAmt)
      const res  = await fetch(`/api/goals/${updateTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentAmount: newAmount }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `שגיאה ${res.status}`)
      setGoals((gs) => gs.map((g) => g.id === updateTarget.id ? { ...g, currentAmount: newAmount } : g))
      setUpdateTarget(null)
      setUpdateAmt('')
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'שגיאה לא ידועה')
    } finally {
      setUpdateBusy(false)
    }
  }

  async function handleMarkComplete(id: string) {
    const res  = await fetch(`/api/goals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    if (res.ok) setGoals((gs) => gs.map((g) => g.id === id ? { ...g, status: 'completed' } : g))
  }

  const active    = goals.filter((g) => g.status === 'active')
  const completed = goals.filter((g) => g.status === 'completed')

  // ── Card renderer ──────────────────────────────────────────────────────────

  function GoalCard({ goal }: { goal: Goal }) {
    const proj    = calcProjection(goal)
    const pct     = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0
    const badge   = STATUS_BADGE[proj.statusColor]
    const isExp   = expandedId === goal.id
    const doneish = goal.currentAmount >= goal.targetAmount * 0.9

    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {/* Top section */}
        <div className="px-5 pt-4 pb-3 space-y-3">
          {/* Row 1: icon + name + badge + actions */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-2xl shrink-0">{goal.icon}</span>
              <div className="min-w-0">
                <h3 className="font-bold text-zinc-100 truncate">{goal.name}</h3>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {doneish && (
                <Button
                  onClick={() => handleMarkComplete(goal.id)}
                  className="text-[10px] h-6 px-2 bg-green-900/50 hover:bg-green-900 text-green-400 border border-green-800/50"
                  variant="outline"
                >הושלם</Button>
              )}
              <button
                onClick={() => { setUpdateAmt(goal.currentAmount.toString()); setUpdateTarget(goal); setUpdateError(null) }}
                className="text-[10px] h-6 px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
              >עדכן סכום</button>
              <button
                onClick={() => { setEditTarget(goal); setFormError(null) }}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
              ><Pencil className="h-3 w-3" /></button>
              <button
                onClick={() => handleDelete(goal.id)}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-600 hover:text-red-400 transition-colors"
              ><Trash2 className="h-3 w-3" /></button>
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-zinc-300 font-semibold">{fmt(goal.currentAmount, goal.currency)}</span>
              <span className="text-zinc-500">{pct}% · {fmt(goal.targetAmount, goal.currency)}</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${BAR_COLOR[proj.statusColor]}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-2">
            <StatBox label="חסר"         value={fmt(proj.remaining, goal.currency)} />
            <StatBox label="חודשים"       value={proj.monthsRemaining > 0 ? `${proj.monthsRemaining}` : 'עבר'} />
            <StatBox label="סבירות"       value={`${proj.successProbability}%`}    cls={PROB_COLOR[proj.statusColor]} />
            <StatBox label={proj.requiredLabel} value={fmt(proj.requiredDeposit, goal.currency)} />
          </div>

          {/* Chart toggle */}
          <button
            onClick={() => setExpandedId(isExp ? null : goal.id)}
            className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors mt-1"
          >
            {isExp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {isExp ? 'הסתר תחזית' : 'הצג תחזית גדילה'}
          </button>
        </div>

        {/* Expandable chart */}
        {isExp && (
          <div className="border-t border-zinc-800 px-4 pb-4 pt-3">
            <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-2">
              צמיחה צפויה ({goal.expectedReturn}% תשואה שנתית)
            </p>
            <GoalChart
              data={proj.chartData}
              targetAmount={goal.targetAmount}
              currency={goal.currency}
            />
          </div>
        )}
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)' }}
          >
            <Target className="h-5 w-5" style={{ color: '#818CF8' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--iq-text)' }}>מטרות פיננסיות</h1>
            <p className="text-sm" style={{ color: 'var(--iq-text-3)' }}>
              {active.length} פעילות · {completed.length} הושלמו
            </p>
          </div>
        </div>
        <Button
          onClick={() => { setShowAdd(true); setEditTarget(null); setForm(defaultForm); setFormError(null) }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"
        >
          <Plus className="h-4 w-4" />
          הוסף מטרה
        </Button>
      </div>

      {/* Active goals */}
      {loading ? (
        <div
          className="rounded-xl p-12 flex items-center justify-center"
          style={{ background: 'var(--iq-surface)', border: '1px solid var(--iq-border)' }}
        >
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-500" />
        </div>
      ) : active.length === 0 ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{ background: 'var(--iq-surface)', border: '1px solid var(--iq-border)' }}
        >
          <Target className="h-10 w-10 mx-auto mb-3 opacity-20" style={{ color: 'var(--iq-text-2)' }} />
          <p className="text-sm" style={{ color: 'var(--iq-text-2)' }}>אין מטרות פיננסיות עדיין.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--iq-text-3)' }}>לחץ &quot;הוסף מטרה&quot; כדי להתחיל לתכנן.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {active.map((g) => <GoalCard key={g.id} goal={g} />)}
        </div>
      )}

      {/* Completed goals */}
      {completed.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted((s) => !s)}
            className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-300 transition-colors"
          >
            {showCompleted ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            הושלמו ({completed.length})
          </button>
          {showCompleted && (
            <div className="grid gap-4 md:grid-cols-2 mt-3">
              {completed.map((g) => (
                <div key={g.id} className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-5 py-4 flex items-center justify-between opacity-70">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{g.icon}</span>
                    <div>
                      <p className="font-semibold text-zinc-300">{g.name}</p>
                      <p className="text-xs text-zinc-500">{fmt(g.targetAmount, g.currency)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <button
                      onClick={() => handleDelete(g.id)}
                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-600 hover:text-red-400 transition-colors"
                    ><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add / Edit Dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={showAdd || !!editTarget}
        onOpenChange={(o) => {
          if (!o) { setShowAdd(false); setEditTarget(null); setForm(defaultForm); setFormError(null) }
        }}
      >
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">
              {editTarget ? 'ערוך מטרה' : 'הוסף מטרה פיננסית'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 mt-1">
            {/* Icon picker */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">סמל</Label>
              <div className="flex gap-2 flex-wrap">
                {ICONS.map((ic) => (
                  <button
                    key={ic} type="button"
                    onClick={() => setForm({ ...form, icon: ic })}
                    className={`text-xl p-1.5 rounded-lg border transition-colors ${
                      form.icon === ic
                        ? 'border-indigo-500 bg-indigo-900/30'
                        : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'
                    }`}
                  >{ic}</button>
                ))}
              </div>
            </div>

            {/* Name + Currency */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-zinc-400 text-xs">שם המטרה</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="פרישה מוקדמת, דירה, לימודים..."
                  required className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">מטבע</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as 'ILS' | 'USD' | 'EUR' })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ILS">₪ שקל</SelectItem>
                    <SelectItem value="USD">$ דולר</SelectItem>
                    <SelectItem value="EUR">€ אירו</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Target + Current */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">סכום יעד</Label>
                <Input type="number" step="any" min="1"
                  value={form.targetAmount}
                  onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
                  placeholder="1,000,000" required
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">חסכתי עד כה</Label>
                <Input type="number" step="any" min="0"
                  value={form.currentAmount}
                  onChange={(e) => setForm({ ...form, currentAmount: e.target.value })}
                  placeholder="0"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs"
                />
              </div>
            </div>

            {/* Deposit amount + frequency */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">
                {form.depositFrequency === 'onetime' ? 'סכום השקעה חד פעמי' : 'סכום הפקדה'}
              </Label>
              <div className="flex gap-2">
                <Input type="number" step="any" min="0"
                  value={form.monthlyDeposit}
                  onChange={(e) => setForm({ ...form, monthlyDeposit: e.target.value })}
                  placeholder={form.depositFrequency === 'onetime' ? '50,000' : '2,000'}
                  required
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs flex-1"
                />
                <Select
                  value={form.depositFrequency}
                  onValueChange={(v) => setForm({ ...form, depositFrequency: v as DepositFreq })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs w-32 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">חודשית</SelectItem>
                    <SelectItem value="quarterly">רבעונית</SelectItem>
                    <SelectItem value="yearly">שנתית</SelectItem>
                    <SelectItem value="onetime">חד פעמית</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.depositFrequency === 'onetime' && (
                <p className="text-[10px] text-zinc-500">
                  סכום שיושקע פעם אחת — הצמיחה תהיה ריבית דריבית בלבד לאחר מכן
                </p>
              )}
            </div>

            {/* Target date */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">תאריך יעד</Label>
              <Input type="date"
                value={form.targetDate}
                onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                required className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs"
              />
            </div>

            {/* Expected return */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">תשואה שנתית צפויה (%)</Label>
              <div className="flex items-center gap-3">
                <Input type="number" step="0.1" min="0" max="30"
                  value={form.expectedReturn}
                  onChange={(e) => setForm({ ...form, expectedReturn: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs w-24"
                />
                <div className="flex gap-2">
                  {['0', '5', '7', '10'].map((v) => (
                    <button key={v} type="button"
                      onClick={() => setForm({ ...form, expectedReturn: v })}
                      className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                        form.expectedReturn === v
                          ? 'border-indigo-500 bg-indigo-900/30 text-indigo-400'
                          : 'border-zinc-700 bg-zinc-800 text-zinc-500 hover:border-zinc-500'
                      }`}
                    >{v}%</button>
                  ))}
                </div>
                <span className="text-[10px] text-zinc-600">ברירת מחדל: 7%</span>
              </div>
            </div>

            {formError && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded px-3 py-2">{formError}</p>
            )}

            <DialogFooter className="pt-1">
              <Button type="button" variant="outline"
                onClick={() => { setShowAdd(false); setEditTarget(null) }}
                className="border-zinc-700 text-zinc-400 text-xs h-8">ביטול</Button>
              <Button type="submit" disabled={busy}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-8">
                {busy ? 'שומר...' : editTarget ? 'עדכן מטרה' : 'צור מטרה'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Update Amount Dialog ───────────────────────────────────────────── */}
      <Dialog open={!!updateTarget} onOpenChange={(o) => { if (!o) { setUpdateTarget(null); setUpdateAmt(''); setUpdateError(null) } }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">
              עדכן סכום — {updateTarget?.icon} {updateTarget?.name}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleUpdateAmount} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">סכום שחסכת עד כה</Label>
              <Input
                type="number" step="any" min="0"
                value={updateAmt}
                onChange={(e) => setUpdateAmt(e.target.value)}
                autoFocus required
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
              />
              {updateAmt && updateTarget && (() => {
                const prev = updateTarget.currentAmount
                const next = parseFloat(updateAmt)
                const diff = next - prev
                return diff !== 0 ? (
                  <p className={`text-[10px] font-semibold ${diff > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {diff > 0 ? '+' : ''}{diff.toLocaleString('he-IL')} מהסכום הקודם
                  </p>
                ) : null
              })()}
            </div>

            {updateError && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded px-3 py-2">{updateError}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUpdateTarget(null)}
                className="border-zinc-700 text-zinc-400 text-xs h-8">ביטול</Button>
              <Button type="submit" disabled={updateBusy}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-8">
                {updateBusy ? 'שומר...' : 'עדכן'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
