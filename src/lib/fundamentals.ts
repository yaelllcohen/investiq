// Turns a yahoo-finance2 quoteSummary() result (with the fundamentals
// modules — see FUNDAMENTAL_MODULES below) into the 10 scored rows shown on
// the stock page's "ניתוח פונדמנטלי" section, plus a compact `facts` object
// reused to build the AI-forecast prompt so the two never disagree.

// recommendationTrend, earningsHistory and calendarEvents aren't in the
// original 6-module request, but they're the only Yahoo modules that
// actually carry the analyst buy/hold/sell breakdown, the EPS-beat/miss
// history, and the next earnings date that the requested rows need.
export const FUNDAMENTAL_MODULES = [
  'incomeStatementHistory',
  'incomeStatementHistoryQuarterly',
  'cashflowStatementHistory',
  'balanceSheetHistory',
  'defaultKeyStatistics',
  'financialData',
  'earningsTrend',
  'earningsHistory',
  'recommendationTrend',
  'calendarEvents',
] as const

export type FundamentalStatus = 'good' | 'warn' | 'bad'

export interface FundamentalRow {
  id: string
  label: string
  status: FundamentalStatus
  value: string
  detail: string
}

export interface FundamentalFacts {
  revenueYoYPct: number | null
  revenueQoQPct: number | null
  netIncomeYoYPct: number | null
  trailingEps: number | null
  epsSurprisePct: number | null
  grossMarginPct: number | null
  operatingMarginPct: number | null
  netMarginPct: number | null
  freeCashflow: number | null
  debtToEquity: number | null
  analystBuy: number | null
  analystHold: number | null
  analystSell: number | null
  trailingPE: number | null
  forwardPE: number | null
  nextQuarterGrowthPct: number | null
  nextYearGrowthPct: number | null
  sharesTrend: 'up' | 'down' | 'flat' | 'unknown'
}

export interface QuarterlyEarningsRow {
  quarterLabel: string
  revenue: number | null
  epsActual: number | null
  epsEstimate: number | null
  surprisePct: number | null
  netIncome: number | null
  beat: boolean | null
}

export interface FundamentalAnalysis {
  rows: FundamentalRow[]
  facts: FundamentalFacts
  quarterlyEarnings: QuarterlyEarningsRow[]
  nextEarningsDate: string | null
  earningsSoon: boolean
  currency: string
}

const pct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`)
const money = (v: number | null, currency: string) => {
  if (v == null) return '—'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B ${currency}`
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M ${currency}`
  return `${sign}${abs.toFixed(0)} ${currency}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildFundamentalAnalysis(summary: any): FundamentalAnalysis {
  const financialData = summary?.financialData ?? {}
  const keyStats = summary?.defaultKeyStatistics ?? {}
  const incomeAnnual: Array<Record<string, unknown>> = summary?.incomeStatementHistory?.incomeStatementHistory ?? []
  const incomeQuarterly: Array<Record<string, unknown>> = summary?.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? []
  const balanceSheets: Array<Record<string, unknown>> = summary?.balanceSheetHistory?.balanceSheetStatements ?? []
  const earningsHistory: Array<Record<string, unknown>> = summary?.earningsHistory?.history ?? []
  const recTrend: Array<Record<string, unknown>> = summary?.recommendationTrend?.trend ?? []
  const earningsTrend: Array<Record<string, unknown>> = summary?.earningsTrend?.trend ?? []

  const currency = (financialData.financialCurrency as string) || '$'
  const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null)

  // ── Revenue YoY / QoQ ──────────────────────────────────────────────────────
  const revYoY = incomeAnnual.length >= 2
    ? ((num(incomeAnnual[0].totalRevenue)! - num(incomeAnnual[1].totalRevenue)!) / Math.abs(num(incomeAnnual[1].totalRevenue)!)) * 100
    : null
  const revYoYPct = num(revYoY) ?? (num(financialData.revenueGrowth) != null ? num(financialData.revenueGrowth)! * 100 : null)
  const revQoQPct = incomeQuarterly.length >= 2 && num(incomeQuarterly[1].totalRevenue) !== 0
    ? ((num(incomeQuarterly[0].totalRevenue)! - num(incomeQuarterly[1].totalRevenue)!) / Math.abs(num(incomeQuarterly[1].totalRevenue)!)) * 100
    : null

  // ── Net income YoY ─────────────────────────────────────────────────────────
  const netIncomeYoYPct = incomeAnnual.length >= 2 && num(incomeAnnual[1].netIncome) !== 0
    ? ((num(incomeAnnual[0].netIncome)! - num(incomeAnnual[1].netIncome)!) / Math.abs(num(incomeAnnual[1].netIncome)!)) * 100
    : (num(financialData.earningsGrowth) != null ? num(financialData.earningsGrowth)! * 100 : null)

  // ── EPS + surprise ─────────────────────────────────────────────────────────
  // Yahoo's surprisePercent is a fraction (0.045 = +4.5%), not a percent.
  const trailingEps = num(keyStats.trailingEps)
  const lastEarnings = earningsHistory[earningsHistory.length - 1]
  const lastSurpriseRaw = lastEarnings ? num(lastEarnings.surprisePercent as number) : null
  const epsSurprisePct = lastSurpriseRaw != null ? lastSurpriseRaw * 100 : null
  const epsBeat = epsSurprisePct != null ? epsSurprisePct >= 0 : null

  // ── Margins ────────────────────────────────────────────────────────────────
  const grossMarginPct = num(financialData.grossMargins) != null ? num(financialData.grossMargins)! * 100 : null
  const operatingMarginPct = num(financialData.operatingMargins) != null ? num(financialData.operatingMargins)! * 100 : null
  const netMarginPct = num(financialData.profitMargins) != null ? num(financialData.profitMargins)! * 100
    : (num(keyStats.profitMargins) != null ? num(keyStats.profitMargins)! * 100 : null)

  // ── Free cash flow ─────────────────────────────────────────────────────────
  const freeCashflow = num(financialData.freeCashflow)

  // ── Debt/Equity ────────────────────────────────────────────────────────────
  const debtToEquity = num(financialData.debtToEquity)

  // ── Guidance proxy (analyst consensus growth — Yahoo exposes no literal
  // company-issued guidance text via quoteSummary) ────────────────────────────
  const nextQ = earningsTrend.find(t => t.period === '+1q')
  const nextY = earningsTrend.find(t => t.period === '+1y') ?? earningsTrend.find(t => t.period === '0y')
  const nextQuarterGrowthPct = nextQ && num((nextQ.earningsEstimate as Record<string, unknown>)?.growth as number) != null
    ? num((nextQ.earningsEstimate as Record<string, unknown>).growth as number)! * 100 : null
  const nextYearGrowthPct = nextY && num((nextY.earningsEstimate as Record<string, unknown>)?.growth as number) != null
    ? num((nextY.earningsEstimate as Record<string, unknown>).growth as number)! * 100 : null

  // ── Analyst recommendations ────────────────────────────────────────────────
  const rec = recTrend.find(t => t.period === '0m') ?? recTrend[0]
  const analystBuy = rec ? (num(rec.strongBuy) ?? 0) + (num(rec.buy) ?? 0) : null
  const analystHold = rec ? num(rec.hold) : null
  const analystSell = rec ? (num(rec.sell) ?? 0) + (num(rec.strongSell) ?? 0) : null

  // ── P/E ────────────────────────────────────────────────────────────────────
  const summaryDetail = summary?.summaryDetail ?? {}
  const trailingPE = num(summaryDetail.trailingPE)
    ?? (num(financialData.currentPrice) != null && trailingEps
      ? financialData.currentPrice / trailingEps
      : null)
  const forwardPE = num(keyStats.forwardPE)

  // ── Share count trend — Yahoo's free balance-sheet module rarely carries a
  // historical share count anymore; only report a trend when it actually does.
  const shareCounts = balanceSheets
    .map(b => num((b as Record<string, unknown>).commonStockSharesOutstanding as number))
    .filter((v): v is number => v != null)
  const sharesTrend: FundamentalFacts['sharesTrend'] = shareCounts.length >= 2
    ? (shareCounts[0] > shareCounts[shareCounts.length - 1] * 1.01 ? 'up'
      : shareCounts[0] < shareCounts[shareCounts.length - 1] * 0.99 ? 'down' : 'flat')
    : 'unknown'

  // ── Quarterly earnings table — merges earningsHistory (EPS actual/estimate,
  // ascending oldest→newest) with incomeStatementHistoryQuarterly (revenue,
  // net income, descending newest→oldest) by matching each entry's quarter
  // end date, since the two modules don't share a common index order.
  const dateKey = (v: unknown): string | null => {
    const d = v instanceof Date ? v : new Date(v as string)
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }
  const incomeByDate = new Map<string, Record<string, unknown>>()
  for (const inc of incomeQuarterly) {
    const key = dateKey(inc.endDate)
    if (key) incomeByDate.set(key, inc)
  }
  const quarterlyEarnings: QuarterlyEarningsRow[] = earningsHistory
    .slice()
    .reverse() // newest first
    .slice(0, 4)
    .map(e => {
      const key = dateKey(e.quarter)
      const inc = key ? incomeByDate.get(key) : undefined
      const epsActual = num(e.epsActual as number)
      const epsEstimate = num(e.epsEstimate as number)
      const surpriseRaw = num(e.surprisePercent as number)
      const qDate = e.quarter instanceof Date ? e.quarter : (key ? new Date(key) : null)
      const quarterLabel = qDate ? `Q${Math.floor(qDate.getUTCMonth() / 3) + 1} ${qDate.getUTCFullYear()}` : '—'
      return {
        quarterLabel,
        revenue: inc ? num(inc.totalRevenue as number) : null,
        epsActual, epsEstimate,
        surprisePct: surpriseRaw != null ? surpriseRaw * 100 : null,
        netIncome: inc ? num(inc.netIncome as number) : null,
        beat: epsActual != null && epsEstimate != null ? epsActual >= epsEstimate : null,
      }
    })

  // ── Next earnings date ──────────────────────────────────────────────────────
  const nextEarningsRaw = summary?.calendarEvents?.earnings?.earningsDate?.[0] as Date | string | undefined
  const nextEarningsDateObj = nextEarningsRaw ? new Date(nextEarningsRaw) : null
  const nextEarningsDate = nextEarningsDateObj && !isNaN(nextEarningsDateObj.getTime())
    ? nextEarningsDateObj.toISOString().slice(0, 10)
    : null
  const earningsSoon = nextEarningsDateObj != null
    && (nextEarningsDateObj.getTime() - Date.now()) <= 14 * 86_400_000
    && (nextEarningsDateObj.getTime() - Date.now()) >= 0

  const rows: FundamentalRow[] = []

  rows.push({
    id: 'revenue',
    label: 'הכנסות — צמיחה YoY / QoQ',
    status: revYoYPct == null ? 'warn' : revYoYPct >= 5 ? 'good' : revYoYPct >= 0 ? 'warn' : 'bad',
    value: `YoY ${pct(revYoYPct)} · QoQ ${pct(revQoQPct)}`,
    detail: revYoYPct == null ? 'אין מספיק נתונים היסטוריים להשוואה' : revYoYPct >= 5 ? 'צמיחה בריאה בהכנסות' : revYoYPct >= 0 ? 'צמיחה איטית' : 'הכנסות מתכווצות',
  })

  rows.push({
    id: 'net_income',
    label: 'רווח נקי',
    status: netIncomeYoYPct == null ? 'warn' : netIncomeYoYPct >= 0 ? 'good' : 'bad',
    value: pct(netIncomeYoYPct),
    detail: netIncomeYoYPct == null ? 'אין מספיק נתונים היסטוריים' : netIncomeYoYPct >= 0 ? 'רווח נקי גדל לעומת אשתקד' : 'רווח נקי קטן לעומת אשתקד',
  })

  rows.push({
    id: 'eps',
    label: 'EPS — רווח למניה',
    status: epsBeat == null ? 'warn' : epsBeat ? 'good' : 'bad',
    value: trailingEps != null ? `${currency}${trailingEps.toFixed(2)}${epsSurprisePct != null ? ` (${pct(epsSurprisePct)} מהצפי)` : ''}` : '—',
    detail: epsBeat == null ? 'אין נתוני ציפיות אנליסטים לרבעון האחרון' : epsBeat ? 'עקף את ציפיות האנליסטים ברבעון האחרון' : 'לא עמד בציפיות האנליסטים ברבעון האחרון',
  })

  const marginsOk = [grossMarginPct, operatingMarginPct, netMarginPct].filter(v => v != null) as number[]
  rows.push({
    id: 'margins',
    label: 'שולי רווח (Gross / Operating / Net)',
    status: marginsOk.length === 0 ? 'warn' : netMarginPct != null && netMarginPct >= 10 ? 'good' : netMarginPct != null && netMarginPct >= 0 ? 'warn' : 'bad',
    value: `${pct(grossMarginPct)} / ${pct(operatingMarginPct)} / ${pct(netMarginPct)}`,
    detail: marginsOk.length === 0 ? 'אין נתוני שולי רווח זמינים' : 'Gross / Operating / Net מהשנה הפיננסית האחרונה',
  })

  rows.push({
    id: 'fcf',
    label: 'Free Cash Flow',
    status: freeCashflow == null ? 'warn' : freeCashflow > 0 ? 'good' : 'bad',
    value: money(freeCashflow, currency),
    detail: freeCashflow == null ? 'אין נתוני תזרים מזומנים חופשי' : freeCashflow > 0 ? 'תזרים מזומנים חופשי חיובי' : 'תזרים מזומנים חופשי שלילי',
  })

  rows.push({
    id: 'debt',
    label: 'חוב — Debt/Equity',
    status: debtToEquity == null ? 'warn' : debtToEquity <= 100 ? 'good' : debtToEquity <= 200 ? 'warn' : 'bad',
    value: debtToEquity != null ? debtToEquity.toFixed(1) : '—',
    detail: debtToEquity == null ? 'אין נתוני מינוף זמינים' : debtToEquity <= 100 ? 'רמת מינוף סבירה' : debtToEquity <= 200 ? 'מינוף גבוה יחסית' : 'מינוף גבוה מאוד',
  })

  rows.push({
    id: 'guidance',
    label: 'Guidance — תחזית קדימה',
    status: nextYearGrowthPct == null && nextQuarterGrowthPct == null ? 'warn' : (nextYearGrowthPct ?? nextQuarterGrowthPct)! >= 0 ? 'good' : 'bad',
    value: `רבעון הבא ${pct(nextQuarterGrowthPct)} · שנה הבאה ${pct(nextYearGrowthPct)}`,
    detail: 'תחזית צמיחת רווחים לפי קונצנזוס אנליסטים (Yahoo אינו חושף את הגיידנס הרשמי של החברה עצמה)',
  })

  const analystTotal = (analystBuy ?? 0) + (analystHold ?? 0) + (analystSell ?? 0)
  rows.push({
    id: 'analysts',
    label: 'ציפיות אנליסטים',
    status: analystTotal === 0 ? 'warn' : (analystBuy ?? 0) >= (analystHold ?? 0) + (analystSell ?? 0) ? 'good' : (analystSell ?? 0) > (analystBuy ?? 0) ? 'bad' : 'warn',
    value: analystTotal === 0 ? '—' : `קנייה ${analystBuy} · המתנה ${analystHold} · מכירה ${analystSell}`,
    detail: analystTotal === 0 ? 'אין כיסוי אנליסטים זמין' : `מבוסס על ${analystTotal} אנליסטים`,
  })

  rows.push({
    id: 'pe',
    label: 'P/E — מכפיל רווח',
    status: trailingPE == null ? 'warn' : trailingPE < 0 ? 'bad' : trailingPE <= 25 ? 'good' : trailingPE <= 40 ? 'warn' : 'bad',
    value: trailingPE != null ? trailingPE.toFixed(1) : '—',
    detail: trailingPE == null ? 'אין רווח חיובי לחישוב מכפיל' : 'הושווה לטווח מכפיל "הוגן" כללי בשוק (~25), לא לממוצע סקטור מדויק — Yahoo אינו חושף ממוצע סקטור בזמן אמת',
  })

  rows.push({
    id: 'dilution',
    label: 'דילול מניות',
    status: sharesTrend === 'unknown' ? 'warn' : sharesTrend === 'down' ? 'good' : sharesTrend === 'flat' ? 'good' : 'bad',
    value: sharesTrend === 'unknown' ? '—' : sharesTrend === 'up' ? 'עולה' : sharesTrend === 'down' ? 'יורד' : 'יציב',
    detail: sharesTrend === 'unknown' ? 'אין נתונים היסטוריים על מספר המניות מהמודולים הזמינים' : sharesTrend === 'up' ? 'מספר המניות במחזור גדל — דילול לבעלי המניות' : 'מספר המניות במחזור לא גדל משמעותית',
  })

  return {
    rows,
    currency,
    quarterlyEarnings,
    nextEarningsDate,
    earningsSoon,
    facts: {
      revenueYoYPct: revYoYPct, revenueQoQPct: revQoQPct, netIncomeYoYPct,
      trailingEps, epsSurprisePct,
      grossMarginPct, operatingMarginPct, netMarginPct,
      freeCashflow, debtToEquity,
      analystBuy, analystHold, analystSell,
      trailingPE, forwardPE,
      nextQuarterGrowthPct, nextYearGrowthPct,
      sharesTrend,
    },
  }
}
