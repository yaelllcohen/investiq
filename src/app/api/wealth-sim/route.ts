import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { gemini, GEMINI_MODEL } from '@/lib/gemini'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

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
  warning?: string
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmt(v: number): string {
  if (v >= 1_000_000) return `₪${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `₪${(v / 1_000).toFixed(0)}K`
  return `₪${v.toFixed(0)}`
}

// ─── Simulation engines ───────────────────────────────────────────────────────

function simulateSavings(initial: number, monthlyAdd: number, annualReturn: number, years: number): SimResult {
  const chartData: ChartPoint[] = []
  let baseline = initial
  let scenario = initial
  for (let y = 0; y <= years; y++) {
    chartData.push({ year: y, baseline: Math.round(baseline), scenario: Math.round(scenario) })
    if (y < years) {
      baseline = baseline * (1 + annualReturn / 100)
      scenario = scenario * (1 + annualReturn / 100) + monthlyAdd * 12
    }
  }
  const totalDeposited = initial + monthlyAdd * 12 * years
  const table = [
    { label: 'שווי סופי',        baseline: fmt(baseline),                       scenario: fmt(scenario) },
    { label: 'סה"כ הפקדות',     baseline: fmt(initial),                        scenario: fmt(totalDeposited) },
    { label: 'רווח תשואה',       baseline: fmt(baseline - initial),             scenario: fmt(scenario - totalDeposited) },
    { label: 'הפקדה חודשית',     baseline: '₪0',                               scenario: fmt(monthlyAdd) },
  ]
  return { chartData, table, finalBaseline: baseline, finalScenario: scenario, type: 'savings', params: { initial, monthlyAdd, annualReturn, years } }
}

function simulateCrash(initial: number, crashPercent: number, recoveryYears: number, annualReturn: number): SimResult {
  const totalYears = Math.max(recoveryYears + 5, 10)
  const chartData: ChartPoint[] = []
  let baseline = initial
  let scenario = initial
  for (let y = 0; y <= totalYears; y++) {
    chartData.push({ year: y, baseline: Math.round(baseline), scenario: Math.round(Math.max(0, scenario)) })
    if (y < totalYears) {
      baseline = baseline * (1 + annualReturn / 100)
      scenario = y === 0
        ? scenario * (1 - crashPercent / 100)
        : scenario * (1 + (annualReturn + 2) / 100)
    }
  }
  const afterCrash = initial * (1 - crashPercent / 100)
  const finalScen = Math.max(0, scenario)
  const table = [
    { label: 'מיד אחרי הנפילה',              baseline: fmt(initial),                           scenario: fmt(afterCrash) },
    { label: `אחרי ${recoveryYears} שנים`,   baseline: fmt(chartData[recoveryYears]?.baseline ?? baseline), scenario: fmt(chartData[recoveryYears]?.scenario ?? scenario) },
    { label: `אחרי ${totalYears} שנים`,      baseline: fmt(baseline),                          scenario: finalScen < initial ? `${fmt(finalScen)} (מתחת לבסיס)` : fmt(finalScen) },
  ]
  return {
    chartData, table, finalBaseline: baseline, finalScenario: finalScen, type: 'crash',
    params: { initial, crashPercent, recoveryYears, annualReturn },
    warning: finalScen < initial
      ? `גם לאחר ${totalYears} שנים, התיק עדיין מתחת לערכו המקורי — הנפילה של ${crashPercent}% השאירה נזק ארוך טווח עם תשואה של ${annualReturn}% בלבד.`
      : undefined,
  }
}

function simulateRetirement(initial: number, monthlyAdd: number, annualReturn: number, years: number, withdrawalRate: number): SimResult {
  const chartData: ChartPoint[] = []
  let baseline = initial
  let scenario = initial
  for (let y = 0; y <= years; y++) {
    chartData.push({ year: y, baseline: Math.round(baseline), scenario: Math.round(scenario) })
    if (y < years) {
      baseline = baseline * (1 + annualReturn / 100)
      scenario = scenario * (1 + annualReturn / 100) + monthlyAdd * 12
    }
  }
  const monthlyIncomeBase = Math.round((baseline * withdrawalRate / 100) / 12)
  const monthlyIncomeScen = Math.round((scenario * withdrawalRate / 100) / 12)
  const table = [
    { label: 'תיק בגיל פרישה',       baseline: fmt(baseline),                         scenario: fmt(scenario) },
    { label: `הכנסה חודשית (${withdrawalRate}%)`, baseline: `₪${monthlyIncomeBase.toLocaleString()}`, scenario: `₪${monthlyIncomeScen.toLocaleString()}` },
    { label: 'הפקדה חודשית',          baseline: '₪0',                                 scenario: monthlyAdd > 0 ? fmt(monthlyAdd) : '₪0' },
  ]
  return { chartData, table, finalBaseline: baseline, finalScenario: scenario, type: 'retirement', params: { initial, monthlyAdd, annualReturn, years, withdrawalRate } }
}

function simulateReturnRate(initial: number, baseReturn: number, newReturn: number, years: number): SimResult {
  const chartData: ChartPoint[] = []
  let baseline = initial
  let scenario = initial
  for (let y = 0; y <= years; y++) {
    chartData.push({ year: y, baseline: Math.round(baseline), scenario: Math.round(scenario) })
    if (y < years) {
      baseline = baseline * (1 + baseReturn / 100)
      scenario = scenario * (1 + newReturn / 100)
    }
  }
  const diff = scenario - baseline
  const table = [
    { label: `תיק לאחר ${years} שנים`,  baseline: fmt(baseline),                                    scenario: fmt(scenario) },
    { label: 'הפרש בין התרחישים',       baseline: '—',                                              scenario: (diff >= 0 ? '+' : '') + fmt(Math.abs(diff)) },
    { label: 'תשואה מצטברת',           baseline: `${((baseline / initial - 1) * 100).toFixed(0)}%`, scenario: `${((scenario / initial - 1) * 100).toFixed(0)}%` },
  ]
  return { chartData, table, finalBaseline: baseline, finalScenario: scenario, type: 'return_rate', params: { initial, baseReturn, newReturn, years } }
}

function simulateWithdrawal(initial: number, withdrawalRate: number, annualReturn: number, years: number): SimResult {
  const chartData: ChartPoint[] = []
  let baseline = initial
  let scenario = initial
  const annualWithdrawal = initial * withdrawalRate / 100
  let runsOutYear: number | null = null
  for (let y = 0; y <= years; y++) {
    chartData.push({ year: y, baseline: Math.round(baseline), scenario: Math.round(Math.max(0, scenario)) })
    if (y < years) {
      baseline = baseline * (1 + annualReturn / 100)
      scenario = scenario * (1 + annualReturn / 100) - annualWithdrawal
      if (scenario <= 0 && runsOutYear === null) runsOutYear = y + 1
    }
  }
  const monthly = Math.round(annualWithdrawal / 12)
  const finalScen = Math.max(0, scenario)
  const table = [
    { label: 'משיכה חודשית',          baseline: '₪0',                                  scenario: `₪${monthly.toLocaleString()}` },
    { label: `תיק לאחר ${years} שנים`, baseline: fmt(baseline),                          scenario: finalScen > 0 ? fmt(finalScen) : '₪0 (נגמר)' },
    { label: 'סה"כ נמשך',            baseline: '₪0',                                  scenario: fmt(annualWithdrawal * (runsOutYear ?? years)) },
  ]
  return {
    chartData, table, finalBaseline: baseline, finalScenario: finalScen, type: 'withdrawal',
    params: { initial, withdrawalRate, annualReturn, years },
    warning: runsOutYear
      ? `בשיעור משיכה של ${withdrawalRate}% ותשואה של ${annualReturn}% — הכסף ייגמר בשנה ${runsOutYear}. שקול להפחית משיכה או להגדיל חשיפה למניות.`
      : undefined,
  }
}

// ─── AI helpers ───────────────────────────────────────────────────────────────

interface ParsedQuestion {
  type: SimType
  params: Record<string, number>
  questionSummary: string
}

async function parseQuestion(question: string, portfolioValue: number): Promise<ParsedQuestion> {
  const prompt = `Parse this Hebrew investment question. Return JSON only. No markdown, no backticks.

User portfolio value: ${Math.round(portfolioValue)} ILS.

Simulation types:
- "savings": monthlyAdd (ILS), annualReturn (% default 7), years (default 20)
- "crash": crashPercent (1-100), recoveryYears (default 3), annualReturn (% default 7)
- "retirement": years (to retirement, default 20), monthlyAdd (ILS default 0), annualReturn (% default 7), withdrawalRate (% default 4)
- "return_rate": newReturn (%), baseReturn (% default 7), years (default 20)
- "withdrawal": withdrawalRate (%), annualReturn (% default 5), years (default 30)

Question: "${question}"

JSON format: {"type":"savings","params":{"monthlyAdd":2000,"annualReturn":7,"years":20},"questionSummary":"תחזית עם הפקדה חודשית"}`

  const res = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      maxOutputTokens: 300,
      responseMimeType: 'application/json',
      temperature: 0.1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      thinkingConfig: { thinkingBudget: 0 } as any,
    },
  })
  const raw = (res.text ?? '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(raw) as ParsedQuestion
}

async function generateInsight(result: SimResult): Promise<string> {
  const diff = result.finalScenario - result.finalBaseline
  const pct  = result.finalBaseline > 0 ? (Math.abs(diff) / result.finalBaseline * 100).toFixed(0) : '0'

  const prompt = `You are a Hebrew financial advisor. Based on the simulation below, write exactly 2 Hebrew sentences of insight — practical, numbers-specific, no generic advice. Hebrew only.

Type: ${result.type}
Params: ${JSON.stringify(result.params)}
Baseline: ₪${Math.round(result.finalBaseline).toLocaleString()}
Scenario: ₪${Math.round(result.finalScenario).toLocaleString()}
Difference: ${diff >= 0 ? '+' : ''}₪${Math.round(Math.abs(diff)).toLocaleString()} (${diff >= 0 ? '+' : '-'}${pct}%)
${result.warning ? `Warning: ${result.warning}` : ''}

2 Hebrew sentences only:`

  const res = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      maxOutputTokens: 200,
      temperature: 0.3,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      thinkingConfig: { thinkingBudget: 0 } as any,
    },
  })
  return (res.text ?? '').trim()
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimit(session.user.id, 'ai')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const body = await req.json() as {
    question?: string
    type?: SimType
    params?: Record<string, number>
    portfolioValue?: number
  }

  const initial = Math.max(body.portfolioValue ?? 100_000, 1000)

  let simType: SimType
  let simParams: Record<string, number>
  let questionSummary = ''

  if (body.type && body.params) {
    simType  = body.type
    simParams = body.params
    questionSummary = body.question ?? ''
  } else if (body.question) {
    try {
      const parsed = await parseQuestion(body.question, initial)
      simType  = parsed.type
      simParams = parsed.params
      questionSummary = parsed.questionSummary
    } catch {
      return NextResponse.json({ error: 'לא הצלחתי לפרש את השאלה — נסה לנסח מחדש' }, { status: 422 })
    }
  } else {
    return NextResponse.json({ error: 'חסרה שאלה' }, { status: 400 })
  }

  // ── Run simulation ────────────────────────────────────────────────────────
  let simResult: SimResult

  if (simType === 'savings') {
    simResult = simulateSavings(initial, simParams.monthlyAdd ?? 1000, simParams.annualReturn ?? 7, simParams.years ?? 20)
  } else if (simType === 'crash') {
    simResult = simulateCrash(initial, simParams.crashPercent ?? 30, simParams.recoveryYears ?? 3, simParams.annualReturn ?? 7)
  } else if (simType === 'retirement') {
    simResult = simulateRetirement(initial, simParams.monthlyAdd ?? 0, simParams.annualReturn ?? 7, simParams.years ?? 20, simParams.withdrawalRate ?? 4)
  } else if (simType === 'return_rate') {
    simResult = simulateReturnRate(initial, simParams.baseReturn ?? 7, simParams.newReturn ?? 10, simParams.years ?? 20)
  } else {
    simResult = simulateWithdrawal(initial, simParams.withdrawalRate ?? 4, simParams.annualReturn ?? 5, simParams.years ?? 30)
  }

  // ── AI insight ─────────────────────────────────────────────────────────────
  let insight = ''
  try { insight = await generateInsight(simResult) } catch { /* no insight on error */ }

  return NextResponse.json({ ...simResult, insight, questionSummary: questionSummary || body.question || '' })
}
