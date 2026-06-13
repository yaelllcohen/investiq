'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronLeft, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StepOption { value: string; label: string; icon?: string }

interface ExtraStep {
  field: string
  title: string
  type: 'single' | 'multi'
  options: StepOption[]
}

interface AssetConfig {
  icon: string
  label: string
  extraSteps: ExtraStep[]
  resultType: 'standard' | 'crypto' | 'bond' | 'fund' | 'gemel' | 'forex'
  warning?: string
}

interface DynFormData {
  goal: string
  timeHorizon: string
  riskTolerance: number
  assetType: string
  extras: Record<string, string[]>
  budget: string
}

interface Recommendation {
  ticker: string
  name: string
  fitScore: number
  price: number
  reason: string
  shortOutlook?: string
  mediumOutlook?: string
  longOutlook?: string
  riskLevel?: number
  // Bond
  yieldToMaturity?: string | number
  duration?: string
  linkage?: string
  creditRating?: string
  // Fund / ETF / Gemel
  expenseRatio?: string | number
  managingBody?: string
  track?: string
  // Crypto
  category?: string
  // Forex
  pairType?: string
  // Warning
  warning?: string
}

// ─── Central asset-type config ────────────────────────────────────────────────

const ASSET_CONFIGS: Record<string, AssetConfig> = {
  Stocks: {
    icon: '📈', label: 'מניות', resultType: 'standard',
    extraSteps: [
      {
        field: 'sectors', title: 'סקטורים מועדפים', type: 'multi',
        options: [
          { value: 'טכנולוגיה', label: 'טכנולוגיה' },
          { value: 'בריאות', label: 'בריאות' },
          { value: 'אנרגיה', label: 'אנרגיה' },
          { value: 'פיננסים', label: 'פיננסים' },
          { value: 'צרכנות', label: 'צרכנות' },
          { value: 'תעשייה', label: 'תעשייה' },
          { value: 'הכל', label: 'הכל' },
        ],
      },
      {
        field: 'market', title: 'שוק', type: 'single',
        options: [
          { value: 'US', label: 'ארה"ב', icon: '🇺🇸' },
          { value: 'Israel', label: 'ת"א', icon: '🇮🇱' },
          { value: 'European', label: 'אירופה', icon: '🇪🇺' },
          { value: 'Global', label: 'גלובלי', icon: '🌐' },
        ],
      },
    ],
  },

  ETFs: {
    icon: '🗂️', label: 'קרן סל (ארה"ב)', resultType: 'fund',
    extraSteps: [
      {
        field: 'exposure', title: 'סוג חשיפה', type: 'single',
        options: [
          { value: 'מדד רחב', label: 'מדד רחב (S&P 500, Nasdaq)' },
          { value: 'סקטוריאלי', label: 'סקטוריאלי' },
          { value: 'אג"ח', label: 'אג"ח' },
          { value: 'סחורות', label: 'סחורות / זהב' },
          { value: 'ממונף', label: 'ממונף (Leveraged)' },
        ],
      },
      {
        field: 'region', title: 'אזור גיאוגרפי', type: 'single',
        options: [
          { value: 'ארה"ב', label: 'ארה"ב', icon: '🇺🇸' },
          { value: 'גלובלי', label: 'גלובלי', icon: '🌐' },
          { value: 'שווקים מתפתחים', label: 'שווקים מתפתחים', icon: '🌍' },
          { value: 'אירופה', label: 'אירופה', icon: '🇪🇺' },
        ],
      },
    ],
  },

  Crypto: {
    icon: '₿', label: 'קריפטו', resultType: 'crypto',
    extraSteps: [
      {
        field: 'cryptoCategory', title: 'קטגוריה', type: 'multi',
        options: [
          { value: 'Layer 1', label: 'Layer 1 (BTC, ETH, SOL)' },
          { value: 'Layer 2', label: 'Layer 2 (ARB, OP, MATIC)' },
          { value: 'DeFi', label: 'DeFi (AAVE, UNI)' },
          { value: 'Meme', label: 'Meme (DOGE, SHIB)' },
          { value: 'AI Tokens', label: 'AI Tokens' },
          { value: 'הכל', label: 'הכל' },
        ],
      },
      {
        field: 'marketCapTier', title: 'שווי שוק', type: 'single',
        options: [
          { value: 'Large Cap', label: 'Large Cap ($10B+)' },
          { value: 'Mid Cap', label: 'Mid Cap ($1B–$10B)' },
          { value: 'Small Cap', label: 'Small Cap (<$1B)' },
          { value: 'הכל', label: 'הכל' },
        ],
      },
    ],
  },

  IsraeliETF: {
    icon: '🇮🇱', label: 'קרן סל ישראלית', resultType: 'fund',
    extraSteps: [
      {
        field: 'trackedIndex', title: 'מדד נעקב', type: 'single',
        options: [
          { value: 'ת"א 35', label: 'ת"א 35' },
          { value: 'ת"א 125', label: 'ת"א 125' },
          { value: 'S&P 500', label: 'S&P 500' },
          { value: 'נאסד"ק', label: 'נאסד"ק 100' },
          { value: 'אג"ח ממשלתי', label: 'אג"ח ממשלתי' },
          { value: 'גלובלי', label: 'גלובלי' },
        ],
      },
      {
        field: 'hedging', title: 'חשיפה מטבעית', type: 'single',
        options: [
          { value: 'מנוטרל', label: 'מנוטרל מט"ח (₪)' },
          { value: 'לא מנוטרל', label: 'לא מנוטרל ($)' },
          { value: 'לא משנה', label: 'לא משנה' },
        ],
      },
    ],
  },

  MutualFund: {
    icon: '📊', label: 'קרן נאמנות', resultType: 'fund',
    extraSteps: [
      {
        field: 'fundTrack', title: 'מסלול קרן', type: 'single',
        options: [
          { value: 'מנייתי', label: 'מנייתי' },
          { value: 'אג"חי', label: 'אג"חי' },
          { value: 'מעורב', label: 'מעורב' },
          { value: 'כספית', label: 'כספית (Money Market)' },
        ],
      },
      {
        field: 'fundRegion', title: 'אזור גיאוגרפי', type: 'single',
        options: [
          { value: 'ישראל', label: 'ישראל', icon: '🇮🇱' },
          { value: 'ארה"ב', label: 'ארה"ב', icon: '🇺🇸' },
          { value: 'גלובלי', label: 'גלובלי', icon: '🌐' },
        ],
      },
    ],
  },

  Bonds: {
    icon: '📋', label: 'אג"ח (כללי)', resultType: 'bond',
    extraSteps: [
      {
        field: 'bondType', title: 'סוג אג"ח', type: 'single',
        options: [
          { value: 'ממשלתי', label: 'ממשלתי' },
          { value: 'קונצרני', label: 'קונצרני' },
        ],
      },
      {
        field: 'duration', title: 'מח"מ (Duration)', type: 'single',
        options: [
          { value: 'קצר (עד 3 שנים)', label: 'קצר (עד 3 שנים)' },
          { value: 'בינוני (3-7 שנים)', label: 'בינוני (3-7 שנים)' },
          { value: 'ארוך (7+ שנים)', label: 'ארוך (7+ שנים)' },
        ],
      },
    ],
  },

  GovBonds: {
    icon: '🏛️', label: 'אג"ח ממשלתי', resultType: 'bond',
    extraSteps: [
      {
        field: 'linkage', title: 'סוג הצמדה', type: 'single',
        options: [
          { value: 'צמוד מדד', label: 'צמוד מדד (גליל)' },
          { value: 'שקלי', label: 'שקלי (שחר)' },
          { value: 'ריבית משתנה', label: 'ריבית משתנה (גילון)' },
          { value: 'מט"ח', label: 'ממשלתי דולרי' },
          { value: 'הכל', label: 'הכל' },
        ],
      },
      {
        field: 'duration', title: 'מח"מ', type: 'single',
        options: [
          { value: 'קצר (עד 3 שנים)', label: 'קצר (עד 3 שנים)' },
          { value: 'בינוני (3-7 שנים)', label: 'בינוני (3-7 שנים)' },
          { value: 'ארוך (7+ שנים)', label: 'ארוך (7+ שנים)' },
        ],
      },
    ],
  },

  CorpBonds: {
    icon: '🏢', label: 'אג"ח קונצרני', resultType: 'bond',
    extraSteps: [
      {
        field: 'creditRating', title: 'דירוג אשראי מינימלי', type: 'single',
        options: [
          { value: 'AAA-AA', label: 'AAA-AA (בטוח מאוד)' },
          { value: 'A', label: 'A (בטוח)' },
          { value: 'BBB', label: 'BBB (ספק השקעה)' },
          { value: 'מתחת BBB', label: 'מתחת BBB (ספקולטיבי)' },
        ],
      },
      {
        field: 'duration', title: 'מח"מ', type: 'single',
        options: [
          { value: 'קצר (עד 3 שנים)', label: 'קצר (עד 3 שנים)' },
          { value: 'בינוני (3-7 שנים)', label: 'בינוני (3-7 שנים)' },
          { value: 'ארוך (7+ שנים)', label: 'ארוך (7+ שנים)' },
        ],
      },
    ],
  },

  OTC: {
    icon: '🔓', label: 'OTC', resultType: 'standard',
    warning: '⚠️ מניות OTC: סחירות נמוכה, ללא פיקוח SEC, סיכון גבוה לתרמיות.',
    extraSteps: [
      {
        field: 'otcField', title: 'תחום פעילות', type: 'single',
        options: [
          { value: 'טכנולוגיה', label: 'טכנולוגיה' },
          { value: 'ביוטק', label: 'ביוטק / רפואה' },
          { value: 'משאבים', label: 'משאבים / כריה' },
          { value: 'קמעונאות', label: 'קמעונאות' },
          { value: 'הכל', label: 'הכל' },
        ],
      },
      {
        field: 'otcMcap', title: 'טווח שווי שוק', type: 'single',
        options: [
          { value: 'Micro Cap (<$50M)', label: 'Micro Cap (<$50M)' },
          { value: 'Small Cap ($50M-$300M)', label: 'Small Cap ($50M–$300M)' },
          { value: 'הכל', label: 'הכל' },
        ],
      },
    ],
  },

  Forex: {
    icon: '💱', label: 'פורקס', resultType: 'forex',
    warning: '⚠️ פורקס: מינוף גבוה, סיכון הפסד מהיר של ההון.',
    extraSteps: [
      {
        field: 'forexPairs', title: 'צמדי מטבעות', type: 'single',
        options: [
          { value: 'Majors', label: 'Majors (EUR/USD, GBP/USD)' },
          { value: 'Minors', label: 'Minors (EUR/GBP, AUD/JPY)' },
          { value: 'Exotics', label: 'Exotics (USD/ILS)' },
          { value: 'הכל', label: 'הכל' },
        ],
      },
      {
        field: 'forexStrategy', title: 'אסטרטגיה', type: 'single',
        options: [
          { value: 'טרנד', label: 'מסחר לפי טרנד' },
          { value: 'טווח', label: 'מסחר בטווח (Range)' },
          { value: 'ניוטרלי', label: 'ניוטרלי' },
        ],
      },
    ],
  },

  Gemel: {
    icon: '🏦', label: 'קופת גמל', resultType: 'gemel',
    extraSteps: [
      {
        field: 'gemelTrack', title: 'מסלול השקעה', type: 'single',
        options: [
          { value: 'מנייתי', label: 'מנייתי (80%+ מניות)' },
          { value: 'כללי', label: 'כללי (מעורב)' },
          { value: 'אג"חי', label: 'אג"חי' },
          { value: 'S&P 500', label: 'S&P 500' },
          { value: 'הלכתי', label: 'הלכתי' },
        ],
      },
      {
        field: 'gemelExpense', title: 'דמי ניהול מקסימליים', type: 'single',
        options: [
          { value: 'נמוך (<0.5%)', label: 'נמוך (<0.5%)' },
          { value: 'בינוני (<1%)', label: 'בינוני (<1%)' },
          { value: 'לא משנה', label: 'לא משנה' },
        ],
      },
    ],
  },

  StudyFund: {
    icon: '🎓', label: 'קרן השתלמות', resultType: 'gemel',
    extraSteps: [
      {
        field: 'gemelTrack', title: 'מסלול השקעה', type: 'single',
        options: [
          { value: 'מנייתי', label: 'מנייתי (80%+ מניות)' },
          { value: 'כללי', label: 'כללי (מעורב)' },
          { value: 'אג"חי', label: 'אג"חי' },
          { value: 'S&P 500', label: 'S&P 500' },
          { value: 'הלכתי', label: 'הלכתי' },
        ],
      },
      {
        field: 'gemelExpense', title: 'דמי ניהול מקסימליים', type: 'single',
        options: [
          { value: 'נמוך (<0.5%)', label: 'נמוך (<0.5%)' },
          { value: 'בינוני (<1%)', label: 'בינוני (<1%)' },
          { value: 'לא משנה', label: 'לא משנה' },
        ],
      },
    ],
  },
}

// ─── Static step data ─────────────────────────────────────────────────────────

const GOALS = [
  { value: 'Growth',       icon: '📈', desc: 'מקסום עליית ערך ההון' },
  { value: 'Income',       icon: '💰', desc: 'יצירת דיבידנדים ותשואה שוטפת' },
  { value: 'Preservation', icon: '🛡️', desc: 'שמירה על קרן ההשקעה' },
  { value: 'Speculation',  icon: '🎯', desc: 'סיכון גבוה, תשואה פוטנציאלית גבוהה' },
]

const HORIZONS = [
  { value: 'Short',  label: 'קצר טווח',   sub: '< חודש' },
  { value: 'Medium', label: 'בינוני טווח', sub: '1–12 חודשים' },
  { value: 'Long',   label: 'ארוך טווח',   sub: '1+ שנים' },
]

const RISK_LABELS: Record<number, string> = {
  1: 'נמוך מאוד', 2: 'נמוך', 3: 'בינוני', 4: 'גבוה', 5: 'גבוה מאוד',
}

const BUDGETS = [
  { value: 'Under $1K',   label: 'עד $1K' },
  { value: '$1K-$10K',    label: '$1K – $10K' },
  { value: '$10K-$100K',  label: '$10K – $100K' },
  { value: '$100K+',      label: '$100K+' },
]

const STORAGE_KEY = 'ai_screener_v2'

const defaultForm: DynFormData = {
  goal: '', timeHorizon: '', riskTolerance: 0,
  assetType: '', extras: {}, budget: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fitScoreColor(score: number): string {
  if (score >= 8) return 'bg-green-700 text-green-100'
  if (score >= 5) return 'bg-yellow-700 text-yellow-100'
  return 'bg-red-800 text-red-100'
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function AIScreenerPage() {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<DynFormData>(defaultForm)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Recommendation[] | null>(null)
  const [resultAssetType, setResultAssetType] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        const { results: r, formData: f, assetType: t } = JSON.parse(saved)
        if (r) setResults(r)
        if (f) setFormData(f)
        if (t) setResultAssetType(t)
      }
    } catch { /* ignore */ }
  }, [])

  const config = ASSET_CONFIGS[formData.assetType]
  const nExtra = config?.extraSteps.length ?? 2
  const totalSteps = 4 + nExtra + 1  // 4 fixed + N dynamic + 1 budget
  const budgetStep = totalSteps

  function extraStep(s: number): ExtraStep | null {
    if (!config) return null
    const idx = s - 5
    return idx >= 0 && idx < config.extraSteps.length ? config.extraSteps[idx] : null
  }

  function getExtraVal(field: string): string[] {
    return formData.extras[field] ?? []
  }

  function setExtraSingle(field: string, value: string) {
    setFormData(f => ({ ...f, extras: { ...f.extras, [field]: [value] } }))
  }

  function toggleExtraMulti(field: string, value: string) {
    const curr = formData.extras[field] ?? []
    const next = curr.includes(value) ? curr.filter(v => v !== value) : [...curr, value]
    setFormData(f => ({ ...f, extras: { ...f.extras, [field]: next } }))
  }

  function canAdvance(): boolean {
    if (step === 1) return !!formData.goal
    if (step === 2) return !!formData.timeHorizon
    if (step === 3) return formData.riskTolerance > 0
    if (step === 4) return !!formData.assetType
    if (step === budgetStep) return !!formData.budget
    const es = extraStep(step)
    if (!es) return true
    const val = getExtraVal(es.field)
    return val.length > 0
  }

  async function handleSubmit() {
    setLoading(true)
    setResults(null)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/ai/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal:          formData.goal,
          timeHorizon:   formData.timeHorizon,
          riskTolerance: formData.riskTolerance,
          assetType:     formData.assetType,
          extras:        formData.extras,
          budget:        formData.budget,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `שגיאה ${res.status}`)
      const recs: Recommendation[] = json.recommendations ?? json
      const at: string = json.assetType ?? formData.assetType
      setResults(recs)
      setResultAssetType(at)
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ results: recs, formData, assetType: at }))
      } catch { /* ignore */ }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'שגיאה לא ידועה')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function restart() {
    setStep(1)
    setFormData(defaultForm)
    setResults(null)
    setResultAssetType('')
    setErrorMsg(null)
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }

  // ── Results view ──────────────────────────────────────────────────────────
  if (results !== null && !loading) {
    const cfg = ASSET_CONFIGS[resultAssetType]
    const resultType = cfg?.resultType ?? 'standard'
    const warning = cfg?.warning

    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
        <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-4">
          <div className="flex items-center justify-between max-w-5xl mx-auto">
            <div>
              <h1 className="text-xl font-bold tracking-wider uppercase">תוצאות סינון AI</h1>
              <p className="text-xs text-zinc-500 mt-0.5">{cfg?.icon} {cfg?.label ?? resultAssetType}</p>
            </div>
            <Button onClick={restart} variant="outline"
              className="border-zinc-700 text-zinc-400 hover:text-zinc-100 text-xs h-8">
              סינון חדש
            </Button>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 py-6">
          {warning && (
            <div className="mb-4 bg-amber-950/40 border border-amber-800 text-amber-400 px-4 py-2 rounded-lg text-xs">
              {warning}
            </div>
          )}
          {errorMsg ? (
            <div className="bg-red-950/50 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">{errorMsg}</div>
          ) : results.length === 0 ? (
            <div className="text-center py-20 text-zinc-500">לא נמצאו המלצות. נסה לשנות את ההעדפות.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.map((rec, i) => (
                <RecommendationCard key={rec.ticker ?? i} rec={rec} resultType={resultType} />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Wizard view ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono flex flex-col">
      <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold tracking-wider uppercase">סינון AI</h1>
          <p className="text-xs text-zinc-500 mt-0.5">שלב {step} מתוך {totalSteps}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${(step / totalSteps) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-6">

          {/* Step 1: Goal */}
          {step === 1 && (
            <WizardStep title="מה מטרת ההשקעה שלך?">
              <div className="grid grid-cols-2 gap-3">
                {GOALS.map(g => (
                  <SelectCard key={g.value} selected={formData.goal === g.value}
                    onClick={() => setFormData({ ...formData, goal: g.value })}>
                    <div className="text-2xl mb-2">{g.icon}</div>
                    <div className="font-bold text-sm">{g.value}</div>
                    <div className="text-xs text-zinc-400 mt-1">{g.desc}</div>
                  </SelectCard>
                ))}
              </div>
            </WizardStep>
          )}

          {/* Step 2: Horizon */}
          {step === 2 && (
            <WizardStep title="מה אופק ההשקעה שלך?">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {HORIZONS.map(h => (
                  <SelectCard key={h.value} selected={formData.timeHorizon === h.value}
                    onClick={() => setFormData({ ...formData, timeHorizon: h.value })}>
                    <div className="font-bold text-sm">{h.label}</div>
                    <div className="text-xs text-zinc-400 mt-1">{h.sub}</div>
                  </SelectCard>
                ))}
              </div>
            </WizardStep>
          )}

          {/* Step 3: Risk */}
          {step === 3 && (
            <WizardStep title="מה רמת הסיכון שאתה מוכן לקחת?">
              <div className="flex gap-3 justify-center flex-wrap">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n}
                    onClick={() => setFormData({ ...formData, riskTolerance: n })}
                    className={`flex flex-col items-center justify-center w-24 h-24 rounded-lg border-2 transition-all ${
                      formData.riskTolerance === n
                        ? 'border-blue-500 bg-blue-950/50 text-blue-300'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
                    }`}>
                    <span className="text-3xl font-black">{n}</span>
                    <span className="text-[10px] mt-1 text-center">{RISK_LABELS[n]}</span>
                  </button>
                ))}
              </div>
            </WizardStep>
          )}

          {/* Step 4: Asset type (single-select) */}
          {step === 4 && (
            <WizardStep title="באיזה סוג נכס אתה מעוניין?">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(ASSET_CONFIGS).map(([key, cfg]) => (
                  <SelectCard key={key} selected={formData.assetType === key}
                    onClick={() => setFormData({ ...formData, assetType: key, extras: {} })}>
                    <div className="text-2xl mb-1">{cfg.icon}</div>
                    <div className="font-bold text-xs text-center">{cfg.label}</div>
                  </SelectCard>
                ))}
              </div>
            </WizardStep>
          )}

          {/* Steps 5...(budgetStep-1): dynamic extra steps */}
          {step >= 5 && step < budgetStep && (() => {
            const es = extraStep(step)
            if (!es) return null
            const vals = getExtraVal(es.field)
            return (
              <WizardStep title={es.title}>
                {es.type === 'single' ? (
                  <div className="grid grid-cols-2 gap-3">
                    {es.options.map(opt => (
                      <SelectCard key={opt.value} selected={vals.includes(opt.value)}
                        onClick={() => setExtraSingle(es.field, opt.value)}>
                        {opt.icon && <div className="text-2xl mb-1">{opt.icon}</div>}
                        <div className="font-bold text-sm text-center">{opt.label}</div>
                      </SelectCard>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {es.options.map(opt => (
                      <CheckChip key={opt.value} label={opt.label}
                        checked={vals.includes(opt.value)}
                        onChange={() => toggleExtraMulti(es.field, opt.value)} />
                    ))}
                  </div>
                )}
              </WizardStep>
            )
          })()}

          {/* Budget step (last) */}
          {step === budgetStep && (
            <WizardStep title="מה תקציב ההשקעה שלך?">
              <div className="grid grid-cols-2 gap-3">
                {BUDGETS.map(b => (
                  <SelectCard key={b.value} selected={formData.budget === b.value}
                    onClick={() => setFormData({ ...formData, budget: b.value })}>
                    <div className="font-bold text-sm">{b.label}</div>
                  </SelectCard>
                ))}
              </div>
            </WizardStep>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <Button variant="outline"
              onClick={() => setStep(s => Math.max(1, s - 1))}
              disabled={step === 1}
              className="border-zinc-700 text-zinc-400 hover:text-zinc-100 text-xs h-9 gap-1.5">
              <ChevronRight className="h-4 w-4" /> הקודם
            </Button>

            {step < totalSteps ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={!canAdvance()}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-9 gap-1.5">
                הבא <ChevronLeft className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={!canAdvance() || loading}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-9 gap-1.5 min-w-[120px]">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />
                    מסנן...
                  </span>
                ) : 'מצא המלצות'}
              </Button>
            )}
          </div>

          {loading && (
            <div className="text-center text-zinc-500 text-xs pt-4 space-y-1">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500 mx-auto" />
              <p>AI מנתח שווקים...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WizardStep({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-zinc-100 text-center">{title}</h2>
      {children}
    </div>
  )
}

function SelectCard({ children, selected, onClick }: {
  children: React.ReactNode; selected: boolean; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full flex flex-col items-center justify-center text-center p-4 rounded-lg border-2 transition-all ${
        selected
          ? 'border-blue-500 bg-blue-950/50 text-blue-100'
          : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800/50'
      }`}>
      {children}
    </button>
  )
}

function CheckChip({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: () => void
}) {
  return (
    <button type="button" onClick={onChange}
      className={`px-4 py-2 rounded-full text-xs font-medium border transition-all ${
        checked
          ? 'border-blue-500 bg-blue-900/50 text-blue-300'
          : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
      }`}>
      {checked && <span className="ml-1.5">✓</span>}
      {label}
    </button>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-800 rounded px-2 py-1.5 text-center">
      <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className="text-[11px] font-semibold mt-0.5 text-zinc-200">{value}</div>
    </div>
  )
}

function OutlookBadge({ label, text }: { label: string; text: string }) {
  const colorMap: Record<string, string> = {
    Bullish: 'text-green-400', Bearish: 'text-red-400', Neutral: 'text-yellow-400',
  }
  return (
    <div className="bg-zinc-800 rounded px-2 py-1.5 text-center">
      <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className={`text-[11px] font-semibold mt-0.5 ${colorMap[text] ?? 'text-zinc-400'}`}>{text || '—'}</div>
    </div>
  )
}

function RecommendationCard({ rec, resultType }: {
  rec: Recommendation
  resultType: 'standard' | 'crypto' | 'bond' | 'fund' | 'gemel' | 'forex'
}) {
  const showOutlook  = ['standard', 'crypto', 'fund', 'forex'].includes(resultType) && !!rec.shortOutlook
  const showLinks    = ['standard', 'crypto'].includes(resultType)
  const showBizportal = resultType === 'bond' && rec.ticker && /^\d{7}$/.test(rec.ticker)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4 hover:border-zinc-700 transition-colors">
      {/* Warning banner */}
      {rec.warning && (
        <div className="bg-amber-950/40 border border-amber-800 text-amber-400 px-3 py-2 rounded text-xs">
          {rec.warning}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl font-black text-blue-400">{rec.ticker}</div>
          <div className="text-xs text-zinc-400 mt-0.5">{rec.name}</div>
          {rec.category     && <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">{rec.category}</div>}
          {rec.managingBody && <div className="text-[10px] text-zinc-500 mt-0.5">{rec.managingBody}</div>}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${fitScoreColor(rec.fitScore)}`}>
            התאמה: {rec.fitScore}/10
          </span>
          {rec.price > 0 && (
            <span className="text-sm font-bold text-zinc-200">{formatCurrency(rec.price)}</span>
          )}
        </div>
      </div>

      {/* Reason */}
      <p className="text-xs text-zinc-400 leading-relaxed">{rec.reason}</p>

      {/* Bond fields */}
      {resultType === 'bond' && (
        <div className="grid grid-cols-2 gap-2">
          {rec.yieldToMaturity != null && (
            <MiniStat label="תשואה לפדיון" value={String(rec.yieldToMaturity)} />
          )}
          {rec.duration && <MiniStat label='מח"מ' value={rec.duration} />}
          {rec.linkage && <MiniStat label="הצמדה" value={rec.linkage} />}
          {rec.creditRating && <MiniStat label="דירוג" value={rec.creditRating} />}
        </div>
      )}

      {/* Fund / ETF fields */}
      {(resultType === 'fund' || resultType === 'gemel') && (
        <div className="grid grid-cols-2 gap-2">
          {rec.expenseRatio != null && (
            <MiniStat label="דמי ניהול" value={String(rec.expenseRatio)} />
          )}
          {rec.track && <MiniStat label="מסלול" value={rec.track} />}
        </div>
      )}

      {/* Forex pair info */}
      {resultType === 'forex' && rec.pairType && (
        <MiniStat label="סוג צמד" value={rec.pairType} />
      )}

      {/* Outlook */}
      {showOutlook && (
        <div className="grid grid-cols-3 gap-2">
          <OutlookBadge label="קצר"   text={rec.shortOutlook ?? ''} />
          <OutlookBadge label="בינוני" text={rec.mediumOutlook ?? ''} />
          <OutlookBadge label="ארוך"  text={rec.longOutlook ?? ''} />
        </div>
      )}

      {/* Stars */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">ציון</span>
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className={`h-3 w-3 ${
              i < Math.round(rec.fitScore / 2) ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-700'
            }`} />
          ))}
        </div>
      </div>

      {/* Links */}
      {showLinks && (
        <div className="flex gap-2 pt-1">
          <Link href={`/ai-analysis/${rec.ticker}`}
            className="flex-1 text-center text-[11px] py-1.5 rounded border border-blue-800 text-blue-400 hover:bg-blue-900/30 transition-colors">
            ניתוח AI
          </Link>
          <Link href={`/stock/${rec.ticker}`}
            className="flex-1 text-center text-[11px] py-1.5 rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors">
            צפה בנכס
          </Link>
        </div>
      )}
      {showBizportal && (
        <a href={`https://www.bizportal.co.il/capitalmarket/quote/generalview/${rec.ticker}`}
          target="_blank" rel="noopener noreferrer"
          className="block text-center text-[11px] py-1.5 rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors">
          פרטים ב-Bizportal ↗
        </a>
      )}
    </div>
  )
}
