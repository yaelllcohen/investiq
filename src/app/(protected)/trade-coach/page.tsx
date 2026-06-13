'use client'

import { useState, useMemo, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, XCircle, History, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Currency = 'USD' | 'ILS' | 'EUR'

const CURRENCY_SYMBOLS: Record<Currency, string> = { USD: '$', ILS: '₪', EUR: '€' }

interface FormState {
  ticker:        string
  entryPrice:    string
  stopLoss:      string
  target:        string
  portfolioSize: string
  riskPercent:   string
  currency:      Currency
}

interface Result {
  id:            string
  ticker:        string
  entryPrice:    number
  stopLoss:      number
  target:        number
  portfolioSize: number
  riskPercent:   number
  rrRatio:       number
  positionSize:  number
  positionPct:   number
  passed:        boolean
  aiSummary:     string
  createdAt:     string
  currency:      Currency
  checks: {
    checkSetup:    boolean
    checkRR:       boolean
    checkRisk:     boolean
    checkPosition: boolean
  }
  maxRiskAmount: number
  shares:        number
}

interface HistoryItem {
  id:           string
  ticker:       string
  rrRatio:      number
  positionSize: number
  passed:       boolean
  createdAt:    string
  riskPercent:  number
  currency:     Currency
}

const defaultForm: FormState = {
  ticker:        '',
  entryPrice:    '',
  stopLoss:      '',
  target:        '',
  portfolioSize: '',
  riskPercent:   '2',
  currency:      'USD',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function n(s: string): number { return parseFloat(s) || 0 }

function fmt(v: number, currency = 'USD'): string {
  return formatCurrency(v, currency)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function TradeCoachInner() {
  const searchParams = useSearchParams()
  const qTicker = searchParams.get('ticker') ?? ''
  const qEntry  = searchParams.get('entry')  ?? ''
  const qStop   = searchParams.get('stop')   ?? ''
  const qTarget = searchParams.get('target') ?? ''

  const [form, setForm] = useState<FormState>({
    ...defaultForm,
    ticker:     qTicker || defaultForm.ticker,
    entryPrice: qEntry  || defaultForm.entryPrice,
    stopLoss:   qStop   || defaultForm.stopLoss,
    target:     qTarget || defaultForm.target,
  })
  const [result, setResult] = useState<Result | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => { fetchHistory() }, [])

  async function fetchHistory() {
    try {
      const res = await fetch('/api/trade-coach')
      if (res.ok) setHistory(await res.json())
    } catch { /* silent */ }
  }

  // ── Live calculations ──────────────────────────────────────────────────────

  const calc = useMemo(() => {
    const entry     = n(form.entryPrice)
    const sl        = n(form.stopLoss)
    const tgt       = n(form.target)
    const portfolio = n(form.portfolioSize)
    const riskPct   = n(form.riskPercent)

    if (!entry || !sl || !tgt || !portfolio || !riskPct) return null

    const riskPerShare   = entry - sl
    const rewardPerShare = tgt - entry
    const rrRatio        = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0
    const maxRisk        = portfolio * (riskPct / 100)
    const shares         = riskPerShare > 0 ? maxRisk / riskPerShare : 0
    const positionSize   = shares * entry
    const positionPct    = portfolio > 0 ? (positionSize / portfolio) * 100 : 0

    const checkSetup    = sl < entry && entry < tgt
    const checkRR       = rrRatio >= 2
    const checkRisk     = riskPct <= 5
    const checkPosition = positionPct <= 25

    return {
      rrRatio, maxRisk, shares, positionSize, positionPct,
      checkSetup, checkRR, checkRisk, checkPosition,
      allPass: checkSetup && checkRR && checkRisk && checkPosition,
    }
  }, [form])

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!calc) return
    setSubmitting(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/trade-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker:        form.ticker.trim().toUpperCase(),
          entryPrice:    n(form.entryPrice),
          stopLoss:      n(form.stopLoss),
          target:        n(form.target),
          portfolioSize: n(form.portfolioSize),
          riskPercent:   n(form.riskPercent),
          currency:      form.currency,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `שגיאה ${res.status}`)
      setResult(json)
      fetchHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <h1 className="text-xl font-bold tracking-wider uppercase flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-400" />
              מאמן החלטות השקעה
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">בדיקת עסקה לפני ביצוע</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowHistory((s) => !s)}
            className="border-zinc-700 text-zinc-400 hover:text-zinc-100 text-xs h-8 gap-1.5"
          >
            <History className="h-3.5 w-3.5" />
            יומן ({history.length})
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* History panel */}
        {showHistory && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">יומן החלטות</h2>
            </div>
            {history.length === 0 ? (
              <p className="px-4 py-6 text-zinc-600 text-xs text-center">אין החלטות שמורות עדיין.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      {['תאריך', 'טיקר', 'R:R', 'פוזיציה', 'סיכון %', 'תוצאה'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-right text-zinc-500 font-medium uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                        <td className="px-4 py-2.5 text-zinc-500">{new Date(h.createdAt).toLocaleDateString('he-IL')}</td>
                        <td className="px-4 py-2.5 font-bold text-blue-400">{h.ticker}</td>
                        <td className="px-4 py-2.5 text-zinc-300">1:{h.rrRatio.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-zinc-300">{fmt(h.positionSize, h.currency ?? 'USD')}</td>
                        <td className="px-4 py-2.5 text-zinc-300">{h.riskPercent}%</td>
                        <td className="px-4 py-2.5">
                          {h.passed
                            ? <span className="text-green-400 font-semibold">✅ עובר</span>
                            : <span className="text-red-400 font-semibold">❌ נכשל</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Form ──────────────────────────────────────────────────────── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">פרמטרי עסקה</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Ticker */}
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">סמל מניה</Label>
                <Input
                  value={form.ticker}
                  onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
                  placeholder="AAPL"
                  required
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs uppercase"
                />
              </div>

              {/* Prices */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">מחיר כניסה</Label>
                  <Input
                    type="number" step="any" min="0"
                    value={form.entryPrice}
                    onChange={(e) => setForm({ ...form, entryPrice: e.target.value })}
                    placeholder="150"
                    required
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-[10px] text-red-400">סטופ לוס ↓</Label>
                  <Input
                    type="number" step="any" min="0"
                    value={form.stopLoss}
                    onChange={(e) => setForm({ ...form, stopLoss: e.target.value })}
                    placeholder="140"
                    required
                    className="bg-zinc-800 border-red-900/50 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-[10px] text-green-400">יעד ↑</Label>
                  <Input
                    type="number" step="any" min="0"
                    value={form.target}
                    onChange={(e) => setForm({ ...form, target: e.target.value })}
                    placeholder="180"
                    required
                    className="bg-zinc-800 border-green-900/50 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs"
                  />
                </div>
              </div>

              {/* Currency + Portfolio + Risk */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">מטבע</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as Currency })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">$ USD</SelectItem>
                      <SelectItem value="ILS">₪ ILS</SelectItem>
                      <SelectItem value="EUR">€ EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">גודל תיק ({CURRENCY_SYMBOLS[form.currency]})</Label>
                  <Input
                    type="number" step="any" min="0"
                    value={form.portfolioSize}
                    onChange={(e) => setForm({ ...form, portfolioSize: e.target.value })}
                    placeholder="50000"
                    required
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">סיכון מקסימלי (%)</Label>
                  <Input
                    type="number" step="0.1" min="0.1" max="100"
                    value={form.riskPercent}
                    onChange={(e) => setForm({ ...form, riskPercent: e.target.value })}
                    placeholder="2"
                    required
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs"
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded px-3 py-2">{error}</p>
              )}

              <Button
                type="submit"
                disabled={!calc || submitting}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs h-9"
              >
                {submitting
                  ? <span className="flex items-center gap-2 justify-center"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />מנתח...</span>
                  : 'נתח עסקה + קבל ניתוח AI'}
              </Button>
            </form>
          </div>

          {/* ── Live calculator ────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Metrics */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">חישובים חיים</h2>

              {calc ? (
                <div className="space-y-3">
                  <MetricRow
                    label="יחס סיכון/סיכוי"
                    value={`1 : ${calc.rrRatio.toFixed(2)}`}
                    highlight={calc.rrRatio >= 2 ? 'green' : calc.rrRatio >= 1 ? 'yellow' : 'red'}
                  />
                  <MetricRow label="מקסימום סיכון בעסקה" value={fmt(calc.maxRisk, form.currency)} />
                  <MetricRow label="כמות יחידות" value={calc.shares.toFixed(4)} />
                  <MetricRow
                    label="גודל פוזיציה מומלץ"
                    value={fmt(calc.positionSize, form.currency)}
                    sub={`${calc.positionPct.toFixed(1)}% מהתיק`}
                    highlight={calc.positionPct <= 25 ? 'green' : 'red'}
                  />
                </div>
              ) : (
                <p className="text-zinc-600 text-xs text-center py-4">מלא את הפרמטרים לחישוב אוטומטי</p>
              )}
            </div>

            {/* Checks */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-3">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">בדיקות כללים</h2>
              <CheckRow ok={calc?.checkSetup}    label="הגדרת עסקה תקינה (SL < כניסה < יעד)" />
              <CheckRow ok={calc?.checkRR}       label={`יחס R:R מינימום 1:2${calc ? ` (בפועל 1:${calc.rrRatio.toFixed(2)})` : ''}`} />
              <CheckRow ok={calc?.checkRisk}     label={`סיכון ≤ 5% מהתיק${calc ? ` (${n(form.riskPercent)}%)` : ''}`} />
              <CheckRow ok={calc?.checkPosition} label={`פוזיציה ≤ 25% מהתיק${calc ? ` (${calc.positionPct.toFixed(1)}%)` : ''}`} />

              {calc && (
                <div className={`mt-3 rounded px-3 py-2 text-xs font-semibold text-center ${
                  calc.allPass
                    ? 'bg-green-950/50 border border-green-800 text-green-400'
                    : 'bg-red-950/50 border border-red-800 text-red-400'
                }`}>
                  {calc.allPass ? '✅ העסקה עומדת בכל הכללים' : '❌ העסקה לא עומדת בכל הכללים'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── AI Result ─────────────────────────────────────────────────────── */}
        {result && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                ניתוח AI — {result.ticker}
              </h2>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                result.passed
                  ? 'bg-green-900/50 text-green-400 border border-green-800'
                  : 'bg-red-900/50 text-red-400 border border-red-800'
              }`}>
                {result.passed ? '✅ עסקה תקינה' : '❌ דורש תיקון'}
              </span>
            </div>

            {/* Checks summary */}
            <div className="grid grid-cols-2 gap-2">
              <CheckRow ok={result.checks.checkSetup}    label="הגדרה תקינה" small />
              <CheckRow ok={result.checks.checkRR}       label={`R:R 1:${result.rrRatio.toFixed(2)}`} small />
              <CheckRow ok={result.checks.checkRisk}     label={`סיכון ${result.riskPercent}%`} small />
              <CheckRow ok={result.checks.checkPosition} label={`פוזיציה ${result.positionPct.toFixed(1)}%`} small />
            </div>

            {/* Key numbers */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-zinc-800/60 rounded px-3 py-2 text-center">
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">R:R</p>
                <p className={`text-base font-black ${result.rrRatio >= 2 ? 'text-green-400' : 'text-red-400'}`}>
                  1:{result.rrRatio.toFixed(2)}
                </p>
              </div>
              <div className="bg-zinc-800/60 rounded px-3 py-2 text-center">
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">פוזיציה</p>
                <p className="text-base font-black text-zinc-100">{fmt(result.positionSize, result.currency ?? 'USD')}</p>
                <p className="text-[9px] text-zinc-500">{result.positionPct.toFixed(1)}% מהתיק</p>
              </div>
              <div className="bg-zinc-800/60 rounded px-3 py-2 text-center">
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">סיכון מקס</p>
                <p className="text-base font-black text-red-400">{fmt(result.maxRiskAmount, result.currency ?? 'USD')}</p>
              </div>
            </div>

            {/* AI text */}
            <div className="border-t border-zinc-800 pt-4">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">ניתוח מאמן</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{result.aiSummary}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function TradeCoachPage() {
  return (
    <Suspense>
      <TradeCoachInner />
    </Suspense>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CheckRow({
  ok,
  label,
  small = false,
}: {
  ok?: boolean
  label: string
  small?: boolean
}) {
  const base = small ? 'text-[10px]' : 'text-xs'
  return (
    <div className={`flex items-center gap-2 ${base}`}>
      {ok === undefined ? (
        <div className="h-3.5 w-3.5 rounded-full border border-zinc-700 flex-shrink-0" />
      ) : ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
      )}
      <span className={ok === undefined ? 'text-zinc-600' : ok ? 'text-zinc-300' : 'text-red-300'}>
        {label}
      </span>
    </div>
  )
}

function MetricRow({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  highlight?: 'green' | 'yellow' | 'red'
}) {
  const colors = { green: 'text-green-400', yellow: 'text-yellow-400', red: 'text-red-400' }
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500 text-xs">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-bold ${highlight ? colors[highlight] : 'text-zinc-100'}`}>
          {value}
        </span>
        {sub && <p className="text-[10px] text-zinc-500">{sub}</p>}
      </div>
    </div>
  )
}
