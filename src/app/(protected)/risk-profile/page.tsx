'use client'

import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronRight, ChevronLeft, CheckCircle2, Save } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type Answers = {
  age?: number
  experience?: number
  income?: number
  reaction?: number
  goal?: number
}

// ─── Data (Hebrew) ────────────────────────────────────────────────────────────

const STEPS = [
  {
    id: 1,
    title: 'טווח גיל',
    question: 'מה טווח הגיל שלך?',
    key: 'age' as keyof Answers,
    options: [
      { label: 'מתחת ל-25', points: 5 },
      { label: '25-35', points: 4 },
      { label: '35-50', points: 3 },
      { label: '50-65', points: 2 },
      { label: '65+', points: 1 },
    ],
  },
  {
    id: 2,
    title: 'ניסיון השקעה',
    question: 'כמה זמן אתה משקיע?',
    key: 'experience' as keyof Answers,
    options: [
      { label: 'מתחיל (<1 שנה)', points: 1 },
      { label: 'בינוני (1-5 שנים)', points: 2 },
      { label: 'מנוסה (5-10 שנים)', points: 4 },
      { label: 'מומחה (10+ שנים)', points: 5 },
    ],
  },
  {
    id: 3,
    title: 'יציבות הכנסה',
    question: 'עד כמה ההכנסה שלך יציבה?',
    key: 'income' as keyof Answers,
    options: [
      { label: 'יציבה מאוד', points: 5 },
      { label: 'יציבה', points: 4 },
      { label: 'משתנה', points: 2 },
      { label: 'לא יציבה', points: 1 },
    ],
  },
  {
    id: 4,
    title: 'תגובה לשוק',
    question: 'אם התיק שלך ירד 20%, היית...',
    key: 'reaction' as keyof Answers,
    options: [
      { label: 'מוכר הכל בפאניקה', points: 1 },
      { label: 'מוכר חלק להפחתת סיכון', points: 2 },
      { label: 'מחזיק וממתין להתאוששות', points: 3 },
      { label: 'קונה עוד במחירים נמוכים', points: 4 },
      { label: 'קונה בצורה אגרסיבית', points: 5 },
    ],
  },
  {
    id: 5,
    title: 'מטרה עיקרית',
    question: 'מה מטרת ההשקעה העיקרית שלך?',
    key: 'goal' as keyof Answers,
    options: [
      { label: 'שימור הון', points: 1 },
      { label: 'הכנסה שוטפת', points: 2 },
      { label: 'צמיחה מאוזנת', points: 3 },
      { label: 'צמיחה לטווח ארוך', points: 4 },
      { label: 'צמיחה מקסימלית', points: 5 },
    ],
  },
]

const ALLOCATIONS: Record<number, { name: string; value: number; color: string }[]> = {
  1: [
    { name: 'אג"ח', value: 60, color: '#06b6d4' },
    { name: 'מזומן', value: 20, color: '#64748b' },
    { name: 'מניות', value: 20, color: '#3b82f6' },
  ],
  2: [
    { name: 'אג"ח', value: 40, color: '#3b82f6' },
    { name: 'מניות', value: 40, color: '#6366f1' },
    { name: 'מזומן', value: 20, color: '#64748b' },
  ],
  3: [
    { name: 'מניות', value: 60, color: '#22c55e' },
    { name: 'אג"ח', value: 30, color: '#3b82f6' },
    { name: 'מזומן', value: 10, color: '#64748b' },
  ],
  4: [
    { name: 'מניות', value: 80, color: '#f97316' },
    { name: 'אג"ח', value: 10, color: '#3b82f6' },
    { name: 'קריפטו', value: 10, color: '#a855f7' },
  ],
  5: [
    { name: 'מניות', value: 60, color: '#ef4444' },
    { name: 'קריפטו', value: 30, color: '#a855f7' },
    { name: 'OTC', value: 10, color: '#f97316' },
  ],
}

const PROFILE_META: Record<number, { label: string; color: string; textColor: string }> = {
  1: { label: 'שמרן מאוד', color: 'border-cyan-400/40 bg-cyan-400/5', textColor: 'text-cyan-400' },
  2: { label: 'שמרן', color: 'border-blue-400/40 bg-blue-400/5', textColor: 'text-blue-400' },
  3: { label: 'מאוזן', color: 'border-green-400/40 bg-green-400/5', textColor: 'text-green-400' },
  4: { label: 'אגרסיבי', color: 'border-orange-400/40 bg-orange-400/5', textColor: 'text-orange-400' },
  5: { label: 'ספקולטיבי', color: 'border-red-400/40 bg-red-400/5', textColor: 'text-red-400' },
}

// ─── Score Calculation ────────────────────────────────────────────────────────

function calculateScore(answers: Answers): number {
  const values = [answers.age, answers.experience, answers.income, answers.reaction, answers.goal]
  const total = values.reduce<number>((sum, v) => sum + (v ?? 0), 0)
  const normalized = Math.round(((total - 5) / 20) * 4) + 1
  return Math.max(1, Math.min(5, normalized))
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RiskProfilePage() {
  const [step, setStep] = useState(1)
  const [answers, setAnswers] = useState<Answers>({})
  const [score, setScore] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const currentStepData = STEPS[step - 1]
  const selectedPoints = answers[currentStepData?.key]
  const progress = ((step - 1) / STEPS.length) * 100
  const isComplete = score !== null

  function handleSelect(points: number) {
    setAnswers((prev) => ({ ...prev, [currentStepData.key]: points }))
  }

  function handleNext() {
    if (step < STEPS.length) {
      setStep((s) => s + 1)
    } else {
      const s = calculateScore(answers)
      setScore(s)
    }
  }

  function handleBack() {
    if (step > 1) setStep((s) => s - 1)
  }

  function handleRetake() {
    setStep(1)
    setAnswers({})
    setScore(null)
    setSaved(false)
    setSaveError('')
  }

  async function handleSave() {
    if (score === null) return
    setSaving(true)
    setSaveError('')
    try {
      const meta = PROFILE_META[score]
      const res = await fetch('/api/risk-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, label: meta.label, answers }),
      })
      if (!res.ok) throw new Error('Failed to save')
      try { localStorage.setItem('iv_investment_score_stale', '1') } catch {}
      setSaved(true)
    } catch {
      setSaveError('שמירת הפרופיל נכשלה. אנא נסה שוב.')
    } finally {
      setSaving(false)
    }
  }

  // ── Result Screen ──
  if (isComplete && score !== null) {
    const meta = PROFILE_META[score]
    const allocation = ALLOCATIONS[score]

    return (
      <div className="max-w-2xl mx-auto">
        <div className={cn('rounded-xl border p-8 space-y-8', meta.color)}>
          {/* Header */}
          <div className="text-center space-y-2">
            <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">
              פרופיל הסיכון שלך
            </p>
            <h1 className={cn('text-5xl font-bold tracking-tight', meta.textColor)}>
              {meta.label}
            </h1>
          </div>

          {/* Score Meter */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground font-mono">
              <span>שמרן מאוד</span>
              <span>ספקולטיבי</span>
            </div>
            <div className="relative h-3 rounded-full bg-background/60 border border-border overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-700', meta.textColor.replace('text-', 'bg-'))}
                style={{ width: `${(score / 5) * 100}%` }}
              />
            </div>
            <div className="flex justify-center gap-1 mt-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <div
                  key={n}
                  className={cn(
                    'h-2 w-2 rounded-full border',
                    n <= score ? meta.textColor.replace('text-', 'bg-') : 'bg-transparent border-border'
                  )}
                />
              ))}
            </div>
          </div>

          {/* Allocation Chart */}
          <div className="space-y-3">
            <h2 className="text-sm font-mono text-muted-foreground uppercase tracking-wider text-center">
              הקצאה מומלצת
            </h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocation}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {allocation.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value) => [`${Number(value ?? 0)}%`, '']}
                  />
                  <Legend
                    formatter={(value) => (
                      <span className="text-xs text-muted-foreground">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Allocation Breakdown */}
          <div className="grid grid-cols-3 gap-3">
            {allocation.map((item) => (
              <div
                key={item.name}
                className="rounded-lg bg-background/40 border border-border p-3 text-center"
              >
                <div
                  className="text-2xl font-bold font-mono"
                  style={{ color: item.color }}
                >
                  {item.value}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">{item.name}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleRetake}
            >
              בצע מחדש
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleSave}
              disabled={saving || saved}
            >
              {saved ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  פרופיל נשמר
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {saving ? 'שומר...' : 'שמור פרופיל'}
                </>
              )}
            </Button>
          </div>

          {saveError && (
            <p className="text-sm text-red-400 text-center">{saveError}</p>
          )}
        </div>
      </div>
    )
  }

  // ── Wizard ──
  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-bold text-foreground">הערכת סיכון</h1>
        <p className="text-sm text-muted-foreground">
          ענה על 5 שאלות לגילוי פרופיל המשקיע שלך
        </p>
      </div>

      {/* Progress */}
      <div className="mb-8 space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground font-mono">
          <span>שלב {step} מתוך {STEPS.length}</span>
          <span>{Math.round(progress)}% הושלם</span>
        </div>
        <div className="h-1.5 rounded-full bg-border overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex gap-1">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={cn(
                'flex-1 h-1 rounded-full transition-all duration-300',
                s.id < step
                  ? 'bg-primary'
                  : s.id === step
                  ? 'bg-primary/50'
                  : 'bg-border'
              )}
            />
          ))}
        </div>
      </div>

      {/* Question Card */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-6">
        <div className="space-y-1">
          <p className="text-xs font-mono text-primary uppercase tracking-widest">
            {currentStepData.title}
          </p>
          <h2 className="text-xl font-semibold text-foreground">
            {currentStepData.question}
          </h2>
        </div>

        <div className="space-y-2">
          {currentStepData.options.map((option) => {
            const isSelected = selectedPoints === option.points
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => handleSelect(option.points)}
                className={cn(
                  'w-full text-right px-4 py-3 rounded-lg border text-sm font-medium transition-all duration-150',
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background/40 text-foreground hover:border-primary/50 hover:bg-primary/5'
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'h-4 w-4 rounded-full border-2 flex-shrink-0 transition-all',
                      isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
                    )}
                  />
                  {option.label}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Navigation — RTL: Back uses ChevronRight, Next uses ChevronLeft */}
      <div className="mt-6 flex gap-3">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={step === 1}
          className="gap-1"
        >
          <ChevronRight className="h-4 w-4" />
          הקודם
        </Button>
        <Button
          className="flex-1 gap-1"
          onClick={handleNext}
          disabled={selectedPoints === undefined}
        >
          {step === STEPS.length ? 'ראה את הפרופיל שלי' : 'הבא'}
          {step < STEPS.length && <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
