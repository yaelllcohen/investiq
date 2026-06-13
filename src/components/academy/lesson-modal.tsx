'use client'

import { useState } from 'react'
import { X, ChevronLeft, Loader2, CheckCircle, XCircle, Star } from 'lucide-react'
import type { Lesson } from '@/lib/lessons'

interface Props {
  lesson: Lesson
  personalNote?: string
  onClose: () => void
  onComplete: (score: number) => void
}

type Step = 'explanation' | 'simulation' | 'quiz' | 'complete'

// ─── fetch helper ─────────────────────────────────────────────────────────────

// Gemini sometimes returns objects like { explanation, is_correct, correct_answer, ... }
// instead of plain strings. Normalize either format to a plain string.
function extractExplanationText(item: unknown): string {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object') {
    const obj = item as Record<string, unknown>
    // Try common field names Gemini uses
    for (const key of ['explanation', 'text', 'message', 'content']) {
      if (typeof obj[key] === 'string') return obj[key] as string
    }
    // Last resort: stringify so it never renders as [object Object]
    return JSON.stringify(item)
  }
  return ''
}

async function fetchExplanations(
  lessonTitle: string,
  items: { question: string; options: string[]; selectedIdx: number; correctIdx: number }[]
): Promise<string[]> {
  try {
    const res = await fetch('/api/academy/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonTitle, items }),
    })
    const data = await res.json() as { explanations?: unknown[] }
    const raw = data.explanations ?? []
    return raw.length > 0
      ? raw.map(extractExplanationText)
      : items.map(() => '')
  } catch {
    return items.map(() => '')
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StepDots({ step }: { step: Step }) {
  const steps: Step[] = ['explanation', 'simulation', 'quiz']
  const idx = steps.indexOf(step)
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <div
          key={s}
          className="rounded-full transition-all"
          style={{
            width: i === idx ? 16 : 6,
            height: 6,
            background: i <= idx ? '#6366f1' : 'rgba(99,102,241,0.2)',
          }}
        />
      ))}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function LessonModal({ lesson, personalNote, onClose, onComplete }: Props) {
  const [step, setStep]                           = useState<Step>('explanation')
  const [simChoice, setSimChoice]                 = useState<number | null>(null)
  const [simExplaining, setSimExplaining]         = useState(false)
  const [simExplanation, setSimExplanation]       = useState<string | null>(null)
  const [quizChoices, setQuizChoices]             = useState<number[]>(lesson.quiz.map(() => -1))
  const [quizSubmitted, setQuizSubmitted]         = useState(false)
  const [quizExplaining, setQuizExplaining]       = useState(false)
  const [quizExplanations, setQuizExplanations]   = useState<string[]>(lesson.quiz.map(() => ''))
  const [score, setScore]                         = useState(0)
  const [completing, setCompleting]               = useState(false)

  // ── Simulation ──────────────────────────────────────────────────────────────
  async function handleSimChoice(idx: number) {
    if (simChoice !== null) return
    setSimChoice(idx)
    setSimExplaining(true)
    const explanations = await fetchExplanations(lesson.title, [{
      question: lesson.simulationQuestion.question,
      options:  lesson.simulationQuestion.options,
      selectedIdx: idx,
      correctIdx:  lesson.simulationQuestion.correct,
    }])
    setSimExplanation(extractExplanationText(explanations[0] ?? ''))
    setSimExplaining(false)
  }

  // ── Quiz ────────────────────────────────────────────────────────────────────
  function handleQuizChoice(qIdx: number, optIdx: number) {
    if (quizSubmitted) return
    setQuizChoices(prev => { const n = [...prev]; n[qIdx] = optIdx; return n })
  }

  async function handleQuizSubmit() {
    if (quizChoices.some(c => c === -1)) return
    setQuizSubmitted(true)

    const correct = quizChoices.filter((c, i) => c === lesson.quiz[i].correct).length
    setScore(correct)

    // Fetch explanations for wrong answers
    const wrongItems = lesson.quiz
      .map((q, i) => ({ q, i, wrong: quizChoices[i] !== q.correct }))
      .filter(x => x.wrong)

    if (wrongItems.length > 0) {
      setQuizExplaining(true)
      const items = wrongItems.map(x => ({
        question:    x.q.question,
        options:     x.q.options,
        selectedIdx: quizChoices[x.i],
        correctIdx:  x.q.correct,
      }))
      const explanations = await fetchExplanations(lesson.title, items)
      const filled = [...quizExplanations]
      wrongItems.forEach((x, ei) => { filled[x.i] = extractExplanationText(explanations[ei] ?? '') })
      setQuizExplanations(filled)
      setQuizExplaining(false)
    }
  }

  async function handleComplete() {
    setCompleting(true)
    try {
      await fetch('/api/academy/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id, score }),
      })
    } catch { /* ignore */ } finally {
      setCompleting(false)
    }
    onComplete(score)
  }

  // ── Colors ──────────────────────────────────────────────────────────────────
  function optionStyle(idx: number, correct: number, chosen: number | null, submitted: boolean): React.CSSProperties {
    if (!submitted && chosen === null) return { background: 'var(--iq-elevated)', border: '1px solid var(--iq-border)', color: 'var(--iq-text)' }
    if (!submitted && chosen === idx) return { background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.5)', color: 'var(--iq-indigo)' }
    if (!submitted) return { background: 'var(--iq-elevated)', border: '1px solid var(--iq-border)', color: 'var(--iq-text-3)' }
    if (idx === correct) return { background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e' }
    if (idx === chosen) return { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444' }
    return { background: 'var(--iq-elevated)', border: '1px solid var(--iq-border)', color: 'var(--iq-text-3)' }
  }

  const stepLabels: Record<Step, string> = {
    explanation: 'הסבר',
    simulation:  'סימולציה',
    quiz:        'חידון',
    complete:    'סיום',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          background: 'var(--iq-surface)',
          border: '1px solid var(--iq-border)',
          maxHeight: '92vh',
        }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--iq-border)' }}>
          <div className="flex items-center gap-3">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
              {lesson.category}
            </span>
            <span className="font-semibold text-sm" style={{ color: 'var(--iq-text)' }}>
              {lesson.title}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {step !== 'complete' && <StepDots step={step} />}
            <span className="text-xs" style={{ color: 'var(--iq-text-3)' }}>
              {stepLabels[step]}
            </span>
            <button onClick={onClose} className="p-1 rounded hover:bg-white/5 transition-colors">
              <X className="h-4 w-4" style={{ color: 'var(--iq-text-3)' }} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* EXPLANATION */}
          {step === 'explanation' && (
            <>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--iq-text)', lineHeight: 1.75 }}>
                {lesson.content}
              </p>
              {personalNote && (
                <div className="rounded-xl px-4 py-3 text-sm"
                  style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8' }}>
                  💡 {personalNote}
                </div>
              )}
            </>
          )}

          {/* SIMULATION */}
          {step === 'simulation' && (
            <>
              <p className="font-medium text-sm" style={{ color: 'var(--iq-text)' }}>
                {lesson.simulationQuestion.question}
              </p>
              <div className="space-y-2">
                {lesson.simulationQuestion.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSimChoice(i)}
                    disabled={simChoice !== null || simExplaining}
                    className="w-full text-right px-4 py-3 rounded-xl text-sm transition-all hover:brightness-110 disabled:cursor-default"
                    style={optionStyle(i, lesson.simulationQuestion.correct, simChoice, simChoice !== null)}
                  >
                    <span className="font-semibold ml-2" style={{ color: 'inherit' }}>
                      {['א', 'ב', 'ג', 'ד'][i]}.
                    </span>
                    {opt}
                  </button>
                ))}
              </div>

              {simExplaining && (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--iq-text-3)' }}>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  מנתח תשובה...
                </div>
              )}

              {simExplanation && !simExplaining && (
                <div className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    background: simChoice === lesson.simulationQuestion.correct
                      ? 'rgba(34,197,94,0.1)'
                      : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${simChoice === lesson.simulationQuestion.correct ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.25)'}`,
                    color: 'var(--iq-text-2)',
                  }}>
                  {simChoice === lesson.simulationQuestion.correct
                    ? <CheckCircle className="h-4 w-4 inline ml-1.5 text-green-400" />
                    : <XCircle className="h-4 w-4 inline ml-1.5 text-red-400" />}
                  {String(simExplanation)}
                </div>
              )}
            </>
          )}

          {/* QUIZ */}
          {step === 'quiz' && (
            <div className="space-y-6">
              {lesson.quiz.map((q, qIdx) => (
                <div key={qIdx} className="space-y-2">
                  <p className="font-medium text-sm" style={{ color: 'var(--iq-text)' }}>
                    {qIdx + 1}. {q.question}
                  </p>
                  <div className="space-y-1.5">
                    {q.options.map((opt, oIdx) => (
                      <button
                        key={oIdx}
                        onClick={() => handleQuizChoice(qIdx, oIdx)}
                        disabled={quizSubmitted}
                        className="w-full text-right px-4 py-2.5 rounded-xl text-sm transition-all hover:brightness-110 disabled:cursor-default"
                        style={optionStyle(oIdx, q.correct, quizChoices[qIdx] === -1 ? null : quizChoices[qIdx], quizSubmitted)}
                      >
                        <span className="font-semibold ml-2">{['א', 'ב', 'ג'][oIdx]}.</span>
                        {opt}
                      </button>
                    ))}
                  </div>
                  {quizSubmitted && quizExplanations[qIdx] && (
                    <div className="rounded-lg px-3 py-2 text-xs mt-1"
                      style={{
                        background: quizChoices[qIdx] === q.correct ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.07)',
                        border: `1px solid ${quizChoices[qIdx] === q.correct ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.2)'}`,
                        color: 'var(--iq-text-2)',
                      }}>
                      {String(quizExplanations[qIdx])}
                    </div>
                  )}
                </div>
              ))}

              {quizExplaining && (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--iq-text-3)' }}>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  מנתח תשובות...
                </div>
              )}
            </div>
          )}

          {/* COMPLETE */}
          {step === 'complete' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex">
                {Array.from({ length: lesson.quiz.length }, (_, i) => (
                  <Star
                    key={i}
                    className="h-8 w-8"
                    style={{ color: i < score ? '#f59e0b' : 'rgba(255,255,255,0.1)', fill: i < score ? '#f59e0b' : 'transparent' }}
                  />
                ))}
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold mb-1" style={{ color: 'var(--iq-text)' }}>
                  {score === lesson.quiz.length ? '🎉 מושלם!' : score > 0 ? '👍 כל הכבוד!' : '💪 נסה שוב בפעם הבאה'}
                </div>
                <div className="text-sm" style={{ color: 'var(--iq-text-3)' }}>
                  ענית נכון על {score}/{lesson.quiz.length} שאלות
                </div>
              </div>
              <div className="rounded-xl px-5 py-3 text-sm text-center"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8' }}>
                השיעור "{lesson.title}" הושלם ✅
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-4 border-t" style={{ borderColor: 'var(--iq-border)' }}>
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: 'var(--iq-text-3)' }}>
            סגור
          </button>

          {step === 'explanation' && (
            <button
              onClick={() => setStep('simulation')}
              className="flex items-center gap-1.5 text-sm font-semibold px-5 py-2 rounded-xl transition-all hover:brightness-110"
              style={{ background: '#6366f1', color: '#fff' }}>
              הבנתי — המשך
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}

          {step === 'simulation' && simChoice !== null && !simExplaining && (
            <button
              onClick={() => setStep('quiz')}
              className="flex items-center gap-1.5 text-sm font-semibold px-5 py-2 rounded-xl transition-all hover:brightness-110"
              style={{ background: '#6366f1', color: '#fff' }}>
              המשך לחידון
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}

          {step === 'quiz' && !quizSubmitted && (
            <button
              onClick={handleQuizSubmit}
              disabled={quizChoices.some(c => c === -1) || quizExplaining}
              className="flex items-center gap-1.5 text-sm font-semibold px-5 py-2 rounded-xl transition-all hover:brightness-110 disabled:opacity-40"
              style={{ background: '#6366f1', color: '#fff' }}>
              בדוק תשובות
            </button>
          )}

          {step === 'quiz' && quizSubmitted && !quizExplaining && (
            <button
              onClick={() => setStep('complete')}
              className="flex items-center gap-1.5 text-sm font-semibold px-5 py-2 rounded-xl transition-all hover:brightness-110"
              style={{ background: '#22c55e', color: '#fff' }}>
              סיים שיעור ✅
            </button>
          )}

          {step === 'complete' && (
            <button
              onClick={handleComplete}
              disabled={completing}
              className="flex items-center gap-1.5 text-sm font-semibold px-5 py-2 rounded-xl transition-all hover:brightness-110 disabled:opacity-60"
              style={{ background: '#6366f1', color: '#fff' }}>
              {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              חזור לאקדמיה
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
