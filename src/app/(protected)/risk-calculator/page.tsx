'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

interface Inputs {
  capital: number
  riskPerTradePct: number
  riskPerDayPct: number
  maxTradesPerDay: number
  entryPrice: number
  stopPrice: number
}

const DEFAULT_INPUTS: Inputs = {
  capital: 10000,
  riskPerTradePct: 1,
  riskPerDayPct: 3,
  maxTradesPerDay: 3,
  entryPrice: 100,
  stopPrice: 98,
}

const fmtUsd = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function InputRow({
  label, value, onChange, step = 1, min = 0,
}: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <label className="flex flex-col gap-1.5 rounded-lg p-3" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)' }}>
      <span className="text-xs font-semibold" style={{ color: '#eab308' }}>{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="px-2 py-1.5 rounded-lg text-sm font-semibold outline-none tabular-nums"
        style={{ background: '#0d1117', border: '1px solid rgba(234,179,8,0.35)', color: '#fde68a' }}
      />
    </label>
  )
}

function ResultRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)' }}>
      <div className="text-xs font-semibold mb-1" style={{ color: '#fb923c' }}>{label}</div>
      <div className="text-lg font-bold tabular-nums" style={{ color: '#fdba74' }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: '#94a3b8' }}>{sub}</div>}
    </div>
  )
}

export default function RiskCalculatorPage() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS)
  const set = <K extends keyof Inputs>(key: K, value: Inputs[K]) => setInputs(prev => ({ ...prev, [key]: value }))

  const calc = useMemo(() => {
    const { capital, riskPerTradePct, riskPerDayPct, maxTradesPerDay, entryPrice, stopPrice } = inputs

    const maxRiskPerTradeDollar = capital * (riskPerTradePct / 100)
    const maxRiskPerDayDollar = capital * (riskPerDayPct / 100)
    const maxRiskPerTradeByDay = maxTradesPerDay > 0 ? maxRiskPerDayDollar / maxTradesPerDay : 0
    const effectiveMaxRisk = Math.min(maxRiskPerTradeDollar, maxRiskPerTradeByDay)

    const riskPerShare = Math.abs(entryPrice - stopPrice)
    const isLong = entryPrice >= stopPrice
    const maxShares = riskPerShare > 0 ? Math.floor(effectiveMaxRisk / riskPerShare) : 0
    const positionValue = maxShares * entryPrice

    const targets = [1, 2, 3].map(multiple => {
      const rewardPerShare = riskPerShare * multiple
      const targetPrice = isLong ? entryPrice + rewardPerShare : entryPrice - rewardPerShare
      const totalProfit = maxShares * rewardPerShare
      const tradeValue = maxShares * targetPrice
      return { multiple, targetPrice, totalProfit, tradeValue }
    })

    return {
      maxRiskPerTradeDollar, maxRiskPerDayDollar, maxRiskPerTradeByDay, effectiveMaxRisk,
      riskPerShare, isLong, maxShares, positionValue, targets,
    }
  }, [inputs])

  const hasValidRisk = calc.riskPerShare > 0

  return (
    <div className="space-y-6">
      {/* ─── Breadcrumb ─── */}
      <nav className="flex items-center gap-1.5 text-sm" style={{ color: '#64748b' }}>
        <Link href="/dashboard" className="hover:underline" style={{ color: '#64748b' }}>בית</Link>
        <ChevronLeft className="w-3.5 h-3.5" />
        <span style={{ color: '#e2e8f0' }}>מחשבון סיכונים</span>
      </nav>

      <div>
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: '#e2e8f0' }}>מחשבון סיכונים</h1>
        <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>
          חשב את גודל הפוזיציה המקסימלי ויעדי Take Profit לפי כללי ניהול סיכונים
        </p>
      </div>

      {/* ─── Inputs ─── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: '#64748b' }}>קלטים</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <InputRow label="Account Capital ($)" value={inputs.capital} onChange={v => set('capital', v)} step={100} />
          <InputRow label="Max risk per trade (%)" value={inputs.riskPerTradePct} onChange={v => set('riskPerTradePct', v)} step={0.1} />
          <InputRow label="Max risk per day (%)" value={inputs.riskPerDayPct} onChange={v => set('riskPerDayPct', v)} step={0.1} />
          <InputRow label="Max trades per day" value={inputs.maxTradesPerDay} onChange={v => set('maxTradesPerDay', v)} step={1} min={1} />
          <InputRow label="Entry price ($)" value={inputs.entryPrice} onChange={v => set('entryPrice', v)} step={0.01} />
          <InputRow label="Stop price ($)" value={inputs.stopPrice} onChange={v => set('stopPrice', v)} step={0.01} />
        </div>
      </section>

      {!hasValidRisk && (
        <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
          ⚠ מחיר הכניסה ומחיר הסטופ זהים — לא ניתן לחשב גודל פוזיציה
        </div>
      )}

      {/* ─── Computed results ─── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: '#64748b' }}>חישובים</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <ResultRow label="Max risk per trade $" value={fmtUsd(calc.maxRiskPerTradeDollar)} />
          <ResultRow label="Max risk per day $" value={fmtUsd(calc.maxRiskPerDayDollar)} />
          <ResultRow label="Max risk per trade (לפי יום)" value={fmtUsd(calc.maxRiskPerTradeByDay)} sub={`סיכון יומי ÷ ${inputs.maxTradesPerDay || 0} עסקאות`} />
          <ResultRow label="Risk per share" value={hasValidRisk ? fmtUsd(calc.riskPerShare) : '—'} sub={calc.isLong ? 'פוזיציית Long' : 'פוזיציית Short'} />
          <ResultRow label="MAX shares to take" value={hasValidRisk ? calc.maxShares.toLocaleString('en-US') : '—'} sub={`לפי סיכון אפקטיבי ${fmtUsd(calc.effectiveMaxRisk)}`} />
          <ResultRow label="שווי הפוזיציה" value={hasValidRisk ? fmtUsd(calc.positionValue) : '—'} />
        </div>
      </section>

      {/* ─── Take Profit targets ─── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: '#64748b' }}>יעדי Take Profit</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {calc.targets.map(t => (
            <div key={t.multiple} className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}>
              <div className="text-sm font-bold mb-2" style={{ color: '#22c55e' }}>1:{t.multiple} PT</div>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span style={{ color: '#94a3b8' }}>מחיר יעד</span>
                  <span className="font-semibold tabular-nums" style={{ color: '#e2e8f0' }}>{hasValidRisk ? fmtUsd(t.targetPrice) : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: '#94a3b8' }}>רווח כולל</span>
                  <span className="font-semibold tabular-nums" style={{ color: '#22c55e' }}>{hasValidRisk ? fmtUsd(t.totalProfit) : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: '#94a3b8' }}>שווי עסקה ביעד</span>
                  <span className="font-semibold tabular-nums" style={{ color: '#e2e8f0' }}>{hasValidRisk ? fmtUsd(t.tradeValue) : '—'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-center pb-4" style={{ color: '#334155' }}>
        לצורכי לימוד בלבד — אין לראות בכך ייעוץ השקעות
      </p>
    </div>
  )
}
