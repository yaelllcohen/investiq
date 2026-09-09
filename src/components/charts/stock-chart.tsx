'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  BarSeries,
  LineSeries,
  AreaSeries,
  BaselineSeries,
  HistogramSeries,
  LineStyle,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type IPaneApi,
  type Time,
  type UTCTimestamp,
  type IPriceLine,
} from 'lightweight-charts'
import { X, Bot, Loader2, CheckCircle, Sparkles } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartData = { date: string; open: number; high: number; low: number; close: number; volume: number }
type TimeRange = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'MAX'
type ChartType = 'candles' | 'ohlc' | 'line' | 'area' | 'baseline'
type IndicatorKey = 'ema8' | 'sma200' | 'ema20' | 'sma50' | 'rsi' | 'bb'
type LevelType = 'entry' | 'stop' | 'target'

const TIME_RANGES: TimeRange[] = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'MAX']

const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: 'candles',  label: 'נרות' },
  { key: 'ohlc',     label: 'OHLC' },
  { key: 'line',     label: 'קו' },
  { key: 'area',     label: 'שטח' },
  { key: 'baseline', label: 'Baseline' },
]

// '1D' fetches a 4-day intraday window (weekend-safe) and is sliced down to
// the last trading day actually present in the results — see filterLastDay().
const RANGE_MAP: Record<TimeRange, { range: string; interval: string }> = {
  '1D':  { range: '1d',  interval: '5m'  },
  '1W':  { range: '5d',  interval: '60m' },
  '1M':  { range: '1mo', interval: '1d'  },
  '3M':  { range: '3mo', interval: '1d'  },
  '6M':  { range: '6mo', interval: '1d'  },
  '1Y':  { range: '1y',  interval: '1d'  },
  '5Y':  { range: '5y',  interval: '1wk' },
  'MAX': { range: 'max', interval: '1mo' },
}

// Keep only bars from the most recent calendar date present — turns the
// (deliberately wider, weekend-safe) 4-day intraday fetch into "just the
// last trading day".
function filterLastTradingDay(rows: ChartData[]): ChartData[] {
  if (rows.length === 0) return rows
  const lastDay = rows[rows.length - 1].date.slice(0, 10)
  return rows.filter(r => r.date.slice(0, 10) === lastDay)
}

const IND_META: Record<IndicatorKey, { label: string; color: string }> = {
  ema8:   { label: 'EMA 8',     color: '#f97316' },
  sma200: { label: 'SMA 200',   color: '#3b82f6' },
  ema20:  { label: 'EMA 20',    color: '#f59e0b' },
  sma50:  { label: 'SMA 50',    color: '#8b5cf6' },
  rsi:    { label: 'RSI 14',    color: '#a78bfa' },
  bb:     { label: 'Bollinger', color: '#38bdf8' },
}

const DEFAULT_INDICATORS: IndicatorKey[] = ['ema8', 'sma200']

const LEVEL_CFG: Record<LevelType, { color: string; label: string; icon: string }> = {
  entry:  { color: '#3b82f6', label: 'כניסה', icon: '🔵' },
  stop:   { color: '#ef4444', label: 'סטופ',  icon: '🔴' },
  target: { color: '#22c55e', label: 'יעד',   icon: '🟢' },
}

const CHART_H = 600

// ─── Pure indicator math ──────────────────────────────────────────────────────

function toTime(d: ChartData) { return (new Date(d.date).getTime() / 1000) as UTCTimestamp }

function calcSMA(data: ChartData[], p: number) {
  return Array.from({ length: Math.max(0, data.length - p + 1) }, (_, i) => ({
    time: toTime(data[i + p - 1]),
    value: data.slice(i, i + p).reduce((s, d) => s + d.close, 0) / p,
  }))
}

function calcEMA(data: ChartData[], p: number) {
  if (data.length < p) return []
  const k = 2 / (p + 1)
  const out: { time: UTCTimestamp; value: number }[] = []
  let e = data.slice(0, p).reduce((s, d) => s + d.close, 0) / p
  data.slice(p - 1).forEach((d, i) => {
    if (i > 0) e = d.close * k + e * (1 - k)
    out.push({ time: toTime(d), value: e })
  })
  return out
}

function calcRSI(data: ChartData[], p = 14) {
  if (data.length <= p) return []
  let ag = 0, al = 0
  for (let i = 1; i <= p; i++) {
    const d = data[i].close - data[i - 1].close
    ag += d > 0 ? d : 0; al += d < 0 ? -d : 0
  }
  ag /= p; al /= p
  const out: { time: UTCTimestamp; value: number }[] = []
  for (let i = p; i < data.length; i++) {
    if (i > p) {
      const d = data[i].close - data[i - 1].close
      ag = (ag * (p - 1) + (d > 0 ? d : 0)) / p
      al = (al * (p - 1) + (d < 0 ? -d : 0)) / p
    }
    out.push({ time: toTime(data[i]), value: 100 - 100 / (1 + (al === 0 ? 100 : ag / al)) })
  }
  return out
}

function calcBB(data: ChartData[], p = 20, m = 2) {
  const upper: { time: UTCTimestamp; value: number }[] = []
  const lower: { time: UTCTimestamp; value: number }[] = []
  for (let i = p - 1; i < data.length; i++) {
    const sl = data.slice(i - p + 1, i + 1)
    const avg = sl.reduce((s, d) => s + d.close, 0) / p
    const std = Math.sqrt(sl.reduce((s, d) => s + (d.close - avg) ** 2, 0) / p)
    const ts = toTime(data[i])
    upper.push({ time: ts, value: avg + m * std })
    lower.push({ time: ts, value: avg - m * std })
  }
  return { upper, lower }
}

// Overlays live on the main pane (0) and are computed from the long daily
// indicatorData — a "SMA 200" means 200 DAYS regardless of the chart's own
// displayed interval, so it needs its own always-daily, always-long-enough
// dataset (the visible chartData is often 5-minute bars for "1D", nowhere
// near 200 bars deep). The full history is needed to COMPUTE correct values,
// but only the portion overlapping the main series' own visible range should
// actually be plotted — otherwise chart.timeScale().fitContent() zooms out
// to fit the indicator line's full (up to 1-year) span instead of the
// candles' actual range.
function clipToRange<T extends { time: UTCTimestamp }>(points: T[], range: { from: UTCTimestamp; to: UTCTimestamp }): T[] {
  const inRange = points.filter(p => p.time >= range.from && p.time <= range.to)
  if (inRange.length > 0) return inRange
  // No point falls exactly within the visible window — this is the normal
  // case for '1D', where the indicator's daily-granularity timestamps never
  // land inside a same-day intraday window. Fall back to a flat reference
  // line at the most recent known value instead of rendering nothing.
  let mostRecent: T | undefined
  for (const p of points) { if (p.time <= range.to) mostRecent = p }
  if (!mostRecent) return []
  return [{ ...mostRecent, time: range.from }, { ...mostRecent, time: range.to }]
}

function buildOverlayIndicator(
  chart: IChartApi,
  key: Exclude<IndicatorKey, 'rsi'>,
  data: ChartData[],
  visibleRange: { from: UTCTimestamp; to: UTCTimestamp },
): ISeriesApi<'Line'>[] {
  const base = { priceLineVisible: false, lastValueVisible: false }
  if (key === 'ema8')   { const s = chart.addSeries(LineSeries, { ...base, color: IND_META.ema8.color, lineWidth: 1 }); s.setData(clipToRange(calcEMA(data, 8), visibleRange)); return [s] }
  if (key === 'sma200') { const s = chart.addSeries(LineSeries, { ...base, color: IND_META.sma200.color, lineWidth: 1 }); s.setData(clipToRange(calcSMA(data, 200), visibleRange)); return [s] }
  if (key === 'ema20')  { const s = chart.addSeries(LineSeries, { ...base, color: IND_META.ema20.color, lineWidth: 1 }); s.setData(clipToRange(calcEMA(data, 20), visibleRange)); return [s] }
  if (key === 'sma50')  { const s = chart.addSeries(LineSeries, { ...base, color: IND_META.sma50.color, lineWidth: 1 }); s.setData(clipToRange(calcSMA(data, 50), visibleRange)); return [s] }
  if (key === 'bb') {
    const bbData = calcBB(data)
    const opts = { ...base, color: 'rgba(56,189,248,0.45)', lineWidth: 1 as const, lineStyle: LineStyle.Dotted }
    const u = chart.addSeries(LineSeries, opts)
    const l = chart.addSeries(LineSeries, opts)
    u.setData(clipToRange(bbData.upper, visibleRange))
    l.setData(clipToRange(bbData.lower, visibleRange))
    return [u, l]
  }
  return []
}

// ─── AI result types ──────────────────────────────────────────────────────────

interface AiLevelsResult {
  symbol: string
  direction: 'buy' | 'sell' | 'wait'
  entry: number
  stop: number
  target: number
  riskReward: string
  reasoning: string
}

interface PatternResult {
  symbol: string
  pattern: string
  patternLabel: string
  confidence: number
  entry: number
  stop: number
  target: number
  riskReward: string
  expectedDays: number
  reasoning: string
}

const DIRECTION_CFG: Record<AiLevelsResult['direction'], { label: string; color: string }> = {
  buy:  { label: 'קנייה',  color: '#22c55e' },
  sell: { label: 'מכירה',  color: '#ef4444' },
  wait: { label: 'המתנה',  color: '#94a3b8' },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StockChart({ ticker }: { ticker: string; currentPrice?: number }) {
  // Chart object refs — the ONLY effect below owns these
  const containerRef  = useRef<HTMLDivElement>(null)
  const chartRef       = useRef<IChartApi | null>(null)
  const mainSeriesRef  = useRef<ISeriesApi<SeriesType> | null>(null)
  const volSeriesRef   = useRef<ISeriesApi<'Histogram'> | null>(null)
  const rsiSeriesRef   = useRef<ISeriesApi<'Line'> | null>(null)
  const rsiPaneRef     = useRef<IPaneApi<Time> | null>(null)
  const indSeriesRef   = useRef<Map<IndicatorKey, ISeriesApi<'Line'>[]>>(new Map())
  const priceLinesRef  = useRef<Map<LevelType, IPriceLine>>(new Map())
  const levelsRef      = useRef<Record<LevelType, number | null>>({ entry: null, stop: null, target: null })
  const placingRef     = useRef<LevelType | null>(null)
  const saveTmrRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chartDataRef      = useRef<ChartData[]>([])
  const indicatorDataRef  = useRef<ChartData[]>([])
  const activeIndicatorsRef = useRef<Set<IndicatorKey>>(new Set(DEFAULT_INDICATORS))

  // ── State ────────────────────────────────────────────────────────────────────
  const [timeRange, setTimeRange]     = useState<TimeRange>('3M')
  const [chartType, setChartType]     = useState<ChartType>('candles')
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorKey>>(new Set(DEFAULT_INDICATORS))
  const [loading, setLoading]         = useState(true)
  const [hasData, setHasData]         = useState(true)
  const [placingMode, setPlacingMode] = useState<LevelType | null>(null)
  const [levels, setLevels]           = useState<Record<LevelType, number | null>>({ entry: null, stop: null, target: null })

  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult]   = useState<AiLevelsResult | null>(null)
  const [aiError, setAiError]     = useState<string | null>(null)
  const [aiCooldown, setAiCooldown] = useState(0)

  const [patternLoading, setPatternLoading] = useState(false)
  const [patternResult, setPatternResult]   = useState<PatternResult | null>(null)
  const [patternError, setPatternError]     = useState<string | null>(null)
  const [patternCooldown, setPatternCooldown] = useState(0)

  // ── Cooldown ticker — unrelated to the chart object, kept as its own tiny effect ──
  useEffect(() => {
    const id = setInterval(() => {
      setAiCooldown(v => (v > 0 ? v - 1 : 0))
      setPatternCooldown(v => (v > 0 ? v - 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Debounced level persistence ───────────────────────────────────────────────
  const saveLevel = useCallback((type: LevelType, price: number | null) => {
    if (saveTmrRef.current) clearTimeout(saveTmrRef.current)
    saveTmrRef.current = setTimeout(() => {
      if (price === null) {
        fetch(`/api/chart-levels/${ticker}?type=${type}`, { method: 'DELETE' }).catch(() => {})
      } else {
        fetch(`/api/chart-levels/${ticker}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, price }),
        }).catch(() => {})
      }
    }, 700)
  }, [ticker])

  // ── Draw/clear a price line on the (already built) main series ───────────────
  const drawPriceLine = useCallback((type: LevelType, price: number | null) => {
    const series = mainSeriesRef.current
    if (!series) return
    const old = priceLinesRef.current.get(type)
    if (old) { try { series.removePriceLine(old) } catch { /* ignore */ } priceLinesRef.current.delete(type) }
    if (price === null) return
    const { color, label } = LEVEL_CFG[type]
    const line = series.createPriceLine({
      price, color, lineWidth: 2, lineStyle: LineStyle.Dashed,
      axisLabelVisible: true, title: `${label}: ${price.toFixed(2)}`,
    })
    priceLinesRef.current.set(type, line)
  }, [])

  const applyLevel = useCallback((type: LevelType, price: number) => {
    levelsRef.current = { ...levelsRef.current, [type]: price }
    setLevels(prev => ({ ...prev, [type]: price }))
    drawPriceLine(type, price)
    saveLevel(type, price)
  }, [drawPriceLine, saveLevel])

  const clearLevel = useCallback((type: LevelType) => {
    drawPriceLine(type, null)
    levelsRef.current = { ...levelsRef.current, [type]: null }
    setLevels(prev => ({ ...prev, [type]: null }))
    saveLevel(type, null)
    if (placingRef.current === type) setPlacingMode(null)
  }, [drawPriceLine, saveLevel])

  // ── RSI pane add/remove — imperative, no chart rebuild ────────────────────────
  const addRsiPane = useCallback(() => {
    const chart = chartRef.current
    if (!chart || rsiPaneRef.current) return
    const rsiData = calcRSI(chartDataRef.current)
    if (rsiData.length === 0) return
    const pane = chart.addPane()
    pane.setStretchFactor(1)
    rsiPaneRef.current = pane

    const line = chart.addSeries(LineSeries, {
      color: IND_META.rsi.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
    }, pane.paneIndex())
    line.setData(rsiData)
    rsiSeriesRef.current = line

    const refBase = { priceLineVisible: false, lastValueVisible: false, lineWidth: 1 as const, lineStyle: LineStyle.Dashed }
    const ob = chart.addSeries(LineSeries, { ...refBase, color: 'rgba(239,68,68,0.45)' }, pane.paneIndex())
    const os = chart.addSeries(LineSeries, { ...refBase, color: 'rgba(34,197,94,0.45)' }, pane.paneIndex())
    const times = rsiData.map(d => d.time)
    ob.setData(times.map(time => ({ time, value: 70 })))
    os.setData(times.map(time => ({ time, value: 30 })))
  }, [])

  const removeRsiPane = useCallback(() => {
    const chart = chartRef.current
    const pane = rsiPaneRef.current
    if (!chart || !pane) return
    try { chart.removePane(pane.paneIndex()) } catch { /* ignore */ }
    rsiPaneRef.current = null
    rsiSeriesRef.current = null
  }, [])

  // ── Toggle indicator — imperative add/remove, never rebuilds the chart ───────
  const toggleIndicator = useCallback((key: IndicatorKey) => {
    setActiveIndicators(prev => {
      const next = new Set(prev)
      const turningOn = !next.has(key)
      if (turningOn) next.add(key); else next.delete(key)
      activeIndicatorsRef.current = next

      const chart = chartRef.current
      if (chart) {
        if (key === 'rsi') {
          if (turningOn) addRsiPane(); else removeRsiPane()
        } else if (turningOn) {
          const mainRows = chartDataRef.current
          if (mainRows.length > 0) {
            const visibleRange = { from: toTime(mainRows[0]), to: toTime(mainRows[mainRows.length - 1]) }
            const ss = buildOverlayIndicator(chart, key, indicatorDataRef.current, visibleRange)
            if (ss.length) indSeriesRef.current.set(key, ss)
          }
        } else {
          const ss = indSeriesRef.current.get(key)
          if (ss) { for (const s of ss) { try { chart.removeSeries(s) } catch { /* ignore */ } } }
          indSeriesRef.current.delete(key)
        }
      }
      return next
    })
  }, [addRsiPane, removeRsiPane])

  // ── Build & own the ENTIRE chart lifecycle ────────────────────────────────────
  // The only effect that ever touches the Lightweight Charts instance. Fully
  // refetches + rebuilds on ticker/timeRange change; indicator toggles and
  // level placement are handled by the imperative callbacks above instead of
  // re-running this effect, so switching an indicator on/off never refetches
  // data or tears down the chart.
  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    let dead = false
    let chart: IChartApi | null = null
    let resizeObs: ResizeObserver | null = null
    const tip = document.createElement('div')

    setLoading(true)
    const { range, interval } = RANGE_MAP[timeRange]

    Promise.all([
      fetch(`/api/stock/${ticker}/history?range=${range}&interval=${interval}`).then(r => r.json()),
      fetch(`/api/stock/${ticker}/history?range=1y&interval=1d`).then(r => r.json()),
      fetch(`/api/chart-levels/${ticker}`)
        .then(r => (r.ok ? r.json() : { entry: null, stop: null, target: null }))
        .catch(() => ({ entry: null, stop: null, target: null })),
    ])
      .then(([mainJson, indJson, levelsJson]: [unknown, unknown, Record<LevelType, number | null>]) => {
        if (dead) return

        const parseRows = (json: unknown): ChartData[] =>
          Array.isArray(json) ? json as ChartData[] : ((json as { data?: ChartData[] })?.data ?? [])
        const rows = timeRange === '1D' ? filterLastTradingDay(parseRows(mainJson)) : parseRows(mainJson)
        const indRows = parseRows(indJson)

        chartDataRef.current = rows
        indicatorDataRef.current = indRows
        levelsRef.current = levelsJson
        setLevels(levelsJson)
        setHasData(rows.length > 0)
        setLoading(false)

        if (rows.length === 0) return

        // ── Create chart ──────────────────────────────────────────────────────
        chart = createChart(container, {
          width: container.clientWidth,
          height: CHART_H,
          layout: { background: { type: ColorType.Solid, color: '#111827' }, textColor: '#e2e8f0' },
          grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
          crosshair: { vertLine: { color: '#334155' }, horzLine: { color: '#334155' } },
          rightPriceScale: { borderColor: '#1e293b' },
          timeScale: {
            borderColor: '#1e293b', timeVisible: true, secondsVisible: false,
            // 1D packs ~70-80 five-minute bars into the chart — a wider
            // spacing there leaves too few, oversized candles. Other ranges
            // (daily+ bars) read better at the wider spacing.
            barSpacing: timeRange === '1D' ? 6 : 12,
            minBarSpacing: timeRange === '1D' ? 4 : 8,
          },
        })
        chartRef.current = chart

        // ── Main series (pane 0) — type per chartType ───────────────────────────
        const isOHLC = chartType === 'candles' || chartType === 'ohlc'
        let ms: ISeriesApi<SeriesType>
        if (chartType === 'candles') {
          ms = chart.addSeries(CandlestickSeries, {
            upColor: '#22c55e', downColor: '#ef4444',
            borderUpColor: '#22c55e', borderDownColor: '#ef4444',
            wickUpColor: '#22c55e', wickDownColor: '#ef4444',
          })
        } else if (chartType === 'ohlc') {
          ms = chart.addSeries(BarSeries, { upColor: '#22c55e', downColor: '#ef4444', openVisible: true })
        } else if (chartType === 'line') {
          ms = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2 })
        } else if (chartType === 'area') {
          ms = chart.addSeries(AreaSeries, { lineColor: '#3b82f6', topColor: 'rgba(59,130,246,0.4)', bottomColor: 'rgba(59,130,246,0)', lineWidth: 2 })
        } else {
          ms = chart.addSeries(BaselineSeries, {
            baseValue: { type: 'price', price: rows[0].close },
            topLineColor: '#22c55e', topFillColor1: 'rgba(34,197,94,0.28)', topFillColor2: 'rgba(34,197,94,0.05)',
            bottomLineColor: '#ef4444', bottomFillColor1: 'rgba(239,68,68,0.05)', bottomFillColor2: 'rgba(239,68,68,0.28)',
            lineWidth: 2,
          })
        }
        mainSeriesRef.current = ms
        if (isOHLC) {
          ms.setData(rows.filter(d => d.open && d.high && d.low && d.close).map(d => ({
            time: toTime(d), open: d.open, high: d.high, low: d.low, close: d.close,
          })))
        } else {
          ms.setData(rows.filter(d => d.close).map(d => ({ time: toTime(d), value: d.close })))
        }
        chart.panes()[0]?.setStretchFactor(3)

        // ── Volume pane (pane 1) — always visible ──────────────────────────────
        const volPane = chart.addPane()
        volPane.setStretchFactor(1)
        const volSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false,
        }, volPane.paneIndex())
        volSeriesRef.current = volSeries
        volSeries.setData(rows.map(d => ({
          time: toTime(d), value: d.volume,
          color: d.close >= d.open ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)',
        })))

        // ── Indicator overlays (pane 0), per currently-active set ──────────────
        const mainVisibleRange = { from: toTime(rows[0]), to: toTime(rows[rows.length - 1]) }
        indSeriesRef.current.clear()
        for (const key of activeIndicatorsRef.current) {
          if (key === 'rsi') continue
          const ss = buildOverlayIndicator(chart, key, indRows, mainVisibleRange)
          if (ss.length) indSeriesRef.current.set(key, ss)
        }

        // ── RSI pane (pane 2) — only if active ─────────────────────────────────
        rsiPaneRef.current = null
        rsiSeriesRef.current = null
        if (activeIndicatorsRef.current.has('rsi')) addRsiPane()

        // ── Price levels ────────────────────────────────────────────────────────
        priceLinesRef.current.clear()
        for (const [type, price] of Object.entries(levelsJson) as [LevelType, number | null][]) {
          if (price !== null) drawPriceLine(type, price)
        }

        // ── Crosshair tooltip ───────────────────────────────────────────────────
        Object.assign(tip.style, {
          position: 'absolute', display: 'none', zIndex: '10', pointerEvents: 'none',
          background: 'rgba(17,24,39,0.97)', border: '1px solid #334155', borderRadius: '8px',
          padding: '9px 13px', fontSize: '11px', color: '#e2e8f0', whiteSpace: 'nowrap',
          boxShadow: '0 6px 20px rgba(0,0,0,0.6)', direction: 'rtl', lineHeight: '1.6',
        })
        container.appendChild(tip)

        const tIdx = new Map<number, number>()
        rows.forEach((d, i) => tIdx.set(Math.floor(new Date(d.date).getTime() / 1000), i))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chart.subscribeCrosshairMove((param: any) => {
          if (!param.time || !param.point) { tip.style.display = 'none'; return }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sd: any = param.seriesData?.get(ms)
          if (!sd) { tip.style.display = 'none'; return }
          const close: number = isOHLC ? (sd.close ?? 0) : (sd.value ?? 0)
          if (close <= 0) { tip.style.display = 'none'; return }

          const idx = tIdx.get(param.time as number) ?? -1
          const raw = idx >= 0 ? rows[idx] : null
          const prev = idx > 0 ? (rows[idx - 1]?.close ?? 0) : 0
          const chg = prev > 0 ? close - prev : 0
          const pct = prev > 0 ? (chg / prev) * 100 : 0
          const col = chg >= 0 ? '#22c55e' : '#ef4444'
          const sign = chg >= 0 ? '+' : ''
          const dt = new Date((param.time as number) * 1000)
          const dateStr = dt.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })

          let html = `<div style="font-weight:800;font-size:13px;color:${col};margin-bottom:5px;">
            ${close.toFixed(2)} <span style="font-size:10px;font-weight:600;">${sign}${chg.toFixed(2)} (${sign}${pct.toFixed(2)}%)</span>
          </div>`
          if (isOHLC && raw) {
            html += `<div style="font-size:10.5px;color:#94a3b8;display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;margin-bottom:4px;">
              <span>פתיחה <b style="color:#e2e8f0">${raw.open.toFixed(2)}</b></span>
              <span>סגירה <b style="color:#e2e8f0">${close.toFixed(2)}</b></span>
              <span>שיא <b style="color:#22c55e">${raw.high.toFixed(2)}</b></span>
              <span>שפל <b style="color:#ef4444">${raw.low.toFixed(2)}</b></span>
            </div>`
          }
          if (raw?.volume) {
            html += `<div style="font-size:10px;color:#64748b;">מחזור: <b style="color:#94a3b8">${raw.volume.toLocaleString('he-IL')}</b></div>`
          }
          html += `<div style="font-size:10px;color:#475569;margin-top:2px;">${dateStr}</div>`
          tip.innerHTML = html

          const cw = container.clientWidth
          let lx = param.point.x + 16, ty = param.point.y + 16
          if (lx + 220 > cw) lx = param.point.x - 220 - 8
          if (ty + 120 > CHART_H) ty = param.point.y - 120 - 8
          tip.style.left = `${Math.max(0, lx)}px`
          tip.style.top  = `${Math.max(0, ty)}px`
          tip.style.display = 'block'
        })

        // ── Click-to-place level ───────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chart.subscribeClick((param: any) => {
          const mode = placingRef.current
          if (!mode || !param.point) return
          const price = ms.coordinateToPrice(param.point.y)
          if (price === null) return
          applyLevel(mode, price)
          setPlacingMode(null)
        })

        // ── Resize + final positioning ─────────────────────────────────────────
        resizeObs = new ResizeObserver(() => {
          if (chartRef.current) chartRef.current.applyOptions({ width: container.clientWidth })
        })
        resizeObs.observe(container)

        // fitContent() now works correctly because the indicator overlays
        // above were clipped to mainVisibleRange — without that clip, this
        // would zoom out to fit their full (up to 1-year) span instead of
        // the candles' actual range.
        chart.timeScale().fitContent()
      })
      .catch(() => {
        if (!dead) { setHasData(false); setLoading(false) }
      })

    return () => {
      dead = true
      resizeObs?.disconnect()
      tip.remove()
      chart?.remove()
      chartRef.current = null
      mainSeriesRef.current = null
      volSeriesRef.current = null
      rsiSeriesRef.current = null
      rsiPaneRef.current = null
      indSeriesRef.current.clear()
      priceLinesRef.current.clear()
    }
  }, [ticker, timeRange, chartType, applyLevel, drawPriceLine, addRsiPane])

  // ── AI recommendation ──────────────────────────────────────────────────────
  const fetchAiLevels = useCallback(() => {
    if (aiLoading || aiCooldown > 0) return
    setAiLoading(true)
    setAiError(null)
    setAiResult(null)
    setPatternResult(null)
    fetch(`/api/ai-levels/${encodeURIComponent(ticker)}`)
      .then(async (r) => {
        const d = await r.json()
        if (r.status === 429 || d.rateLimited) { setAiError(d.error ?? 'הגעת למגבלת השימוש היומית של AI. נסי שוב מחר.'); return }
        if (d.error) { setAiError(d.error); return }
        setAiResult(d)
      })
      .catch(() => setAiError('שגיאת רשת — נסה שוב'))
      .finally(() => { setAiLoading(false); setAiCooldown(10) })
  }, [ticker, aiLoading, aiCooldown])

  const applyAiLevels = useCallback((r: AiLevelsResult) => {
    if (r.direction !== 'wait') {
      applyLevel('entry', r.entry)
      applyLevel('stop', r.stop)
      applyLevel('target', r.target)
    }
    setAiResult(null)
  }, [applyLevel])

  // ── Pattern analysis ───────────────────────────────────────────────────────
  const fetchPatternAnalysis = useCallback(() => {
    if (patternLoading || patternCooldown > 0) return
    setPatternLoading(true)
    setPatternError(null)
    setPatternResult(null)
    setAiResult(null)
    fetch(`/api/swing-analysis/${encodeURIComponent(ticker)}`)
      .then(async (r) => {
        const d = await r.json()
        if (r.status === 429 || d.rateLimited) { setPatternError(d.error ?? 'הגעת למגבלת השימוש היומית של AI. נסי שוב מחר.'); return }
        if (d.error) { setPatternError(d.error); return }
        setPatternResult(d)
      })
      .catch(() => setPatternError('שגיאת רשת — נסה שוב'))
      .finally(() => { setPatternLoading(false); setPatternCooldown(10) })
  }, [ticker, patternLoading, patternCooldown])

  const applyPatternLevels = useCallback((r: PatternResult) => {
    applyLevel('entry', r.entry)
    applyLevel('stop', r.stop)
    applyLevel('target', r.target)
    setPatternResult(null)
  }, [applyLevel])

  // ── Style helper ──────────────────────────────────────────────────────────────
  const btn = (active: boolean) =>
    `px-2.5 py-1 rounded text-xs font-medium border transition-all focus:outline-none ${
      active ? 'border-transparent text-white' : 'border-zinc-800 bg-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
    }`

  return (
    <div className="rounded-xl overflow-hidden border border-white/5" style={{ background: '#111827' }}>

      {/* ── Chart type + indicators row ───────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-white/5 overflow-x-auto scrollbar-none flex-nowrap">
        <div className="flex gap-1">
          {CHART_TYPES.map(({ key, label }) => (
            <button key={key} onClick={() => setChartType(key)}
              className={btn(chartType === key)}
              style={chartType === key ? { background: '#3b82f6' } : {}}>
              {label}
            </button>
          ))}
        </div>

        <div className="w-px h-4 self-center bg-zinc-800" />

        <div className="flex flex-wrap gap-1">
          {(Object.keys(IND_META) as IndicatorKey[]).map(key => {
            const { label, color } = IND_META[key]
            const on = activeIndicators.has(key)
            return (
              <button key={key} onClick={() => toggleIndicator(key)}
                className={btn(on)}
                style={on ? { background: color + '22', borderColor: color, color } : {}}>
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Time range row ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 overflow-x-auto scrollbar-none">
        <div className="flex gap-0.5 flex-shrink-0">
          {TIME_RANGES.map(r => (
            <button key={r} onClick={() => setTimeRange(r)}
              className="px-2.5 py-1 rounded text-xs font-medium transition-colors focus:outline-none"
              style={timeRange === r
                ? { background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid #3b82f6' }
                : { color: '#64748b', border: '1px solid transparent' }}>
              {r}
            </button>
          ))}
        </div>

        {/* Level + AI buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0 mr-auto">
          {((['entry', 'stop', 'target'] as LevelType[])).map(type => {
            const { color, label, icon } = LEVEL_CFG[type]
            const isPlacing = placingMode === type
            const hasLevel  = levels[type] !== null
            return (
              <button key={type}
                onClick={() => {
                  if (isPlacing) { setPlacingMode(null); return }
                  if (hasLevel) { clearLevel(type); return }
                  setPlacingMode(type)
                }}
                title={hasLevel ? `הסר ${label}` : isPlacing ? 'לחץ לביטול' : `הוסף ${label}`}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-all"
                style={isPlacing
                  ? { background: color + '33', borderColor: color, color }
                  : hasLevel
                  ? { background: color + '18', borderColor: color + '60', color }
                  : { borderColor: '#1e293b', color: '#475569' }}>
                <span>{icon}</span>
                <span>{label}</span>
                {hasLevel && !isPlacing && (
                  <span className="text-[9px] font-mono" style={{ color }}>{levels[type]!.toFixed(2)}</span>
                )}
              </button>
            )
          })}

          <button
            onClick={fetchAiLevels}
            disabled={aiLoading || aiCooldown > 0}
            title={aiCooldown > 0 ? `המתן ${aiCooldown} שניות` : 'קבל המלצת AI'}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-all disabled:opacity-50"
            style={{ borderColor: '#6366f1', color: '#6366f1', background: aiResult ? 'rgba(99,102,241,0.15)' : 'transparent' }}>
            {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />}
            <span>{aiLoading ? 'מחשב...' : aiCooldown > 0 ? `${aiCooldown}ש׳` : 'המלצת AI'}</span>
          </button>

          <button
            onClick={fetchPatternAnalysis}
            disabled={patternLoading || patternCooldown > 0}
            title={patternCooldown > 0 ? `המתן ${patternCooldown} שניות` : 'זיהוי תבנית סווינג'}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-all disabled:opacity-50"
            style={{ borderColor: '#f97316', color: '#f97316', background: patternResult ? 'rgba(249,115,22,0.15)' : 'transparent' }}>
            {patternLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            <span>{patternLoading ? 'מנתח...' : patternCooldown > 0 ? `${patternCooldown}ש׳` : 'נתח תבניות'}</span>
          </button>
        </div>
      </div>

      {/* ── Placing mode banner ──────────────────────────────────────────────── */}
      {placingMode && (
        <div className="flex items-center justify-between px-3 py-1.5 text-xs"
          style={{ background: LEVEL_CFG[placingMode].color + '18', borderBottom: `1px solid ${LEVEL_CFG[placingMode].color}40` }}>
          <span style={{ color: LEVEL_CFG[placingMode].color }}>
            לחץ על הגרף להצבת קו <b>{LEVEL_CFG[placingMode].label}</b>
          </span>
          <button onClick={() => setPlacingMode(null)} className="text-zinc-500 hover:text-zinc-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Error banners ─────────────────────────────────────────────────────── */}
      {aiError && (
        <div className="flex items-center justify-between px-3 py-2 text-xs border-b" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)', color: '#ef4444' }}>
          <span>⚠ {aiError}</span>
          <button onClick={() => setAiError(null)} className="hover:text-red-300"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {patternError && (
        <div className="flex items-center justify-between px-3 py-2 text-xs border-b" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)', color: '#ef4444' }}>
          <span>⚠ {patternError}</span>
          <button onClick={() => setPatternError(null)} className="hover:text-red-300"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* ── Chart area ────────────────────────────────────────────────────────── */}
      <div className="relative" style={{ height: CHART_H, width: '100%', cursor: placingMode ? 'crosshair' : 'default' }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#111827' }}>
            <div className="flex flex-col items-center gap-3">
              <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: '#3b82f6', borderTopColor: 'transparent' }} />
              <span className="text-xs" style={{ color: '#64748b' }}>טוען נתונים...</span>
            </div>
          </div>
        )}
        {!loading && !hasData && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#111827' }}>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium" style={{ color: '#94a3b8' }}>אין נתונים לתקופה זו</p>
              <p className="text-xs" style={{ color: '#64748b' }}>הבורסה אולי סגורה — נסה טווח אחר</p>
            </div>
          </div>
        )}

        {/* AI levels modal */}
        {aiResult && (
          <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)' }}>
            <div className="rounded-xl border shadow-2xl w-80 max-w-[90%]" style={{ background: '#0f172a', borderColor: '#6366f133', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#1e293b' }}>
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4" style={{ color: '#6366f1' }} />
                  <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>המלצת AI — {ticker}</span>
                </div>
                <button onClick={() => setAiResult(null)} className="text-zinc-600 hover:text-zinc-300"><X className="h-4 w-4" /></button>
              </div>
              <div className="px-4 py-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-base font-black" style={{ color: DIRECTION_CFG[aiResult.direction].color }}>
                    {DIRECTION_CFG[aiResult.direction].label}
                  </span>
                  {aiResult.direction !== 'wait' && (
                    <span className="text-sm font-black px-2 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid #6366f133' }}>
                      {aiResult.riskReward}
                    </span>
                  )}
                </div>
                {aiResult.reasoning && <p className="text-[11px]" style={{ color: '#94a3b8' }}>{aiResult.reasoning}</p>}

                {aiResult.direction !== 'wait' && (
                  <>
                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      {([
                        { label: 'כניסה', val: aiResult.entry,  color: '#3b82f6' },
                        { label: 'סטופ',  val: aiResult.stop,   color: '#ef4444' },
                        { label: 'יעד',   val: aiResult.target, color: '#22c55e' },
                      ]).map(row => (
                        <div key={row.label} className="text-center rounded-lg p-2" style={{ background: row.color + '10', border: `1px solid ${row.color}30` }}>
                          <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: '#64748b' }}>{row.label}</div>
                          <div className="text-xs font-black tabular-nums" style={{ color: row.color }}>{row.val.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => applyAiLevels(aiResult)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold" style={{ background: '#22c55e', color: '#fff' }}>
                        <CheckCircle className="h-3.5 w-3.5" /> אמץ המלצה
                      </button>
                      <button onClick={() => setAiResult(null)} className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}>
                        בטל
                      </button>
                    </div>
                  </>
                )}
                <p className="text-[9px] text-center pt-1" style={{ color: '#334155' }}>המלצה טכנית בלבד — אינה מהווה ייעוץ השקעות</p>
              </div>
            </div>
          </div>
        )}

        {/* Pattern analysis modal */}
        {patternResult && (
          <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)' }}>
            <div className="rounded-xl border shadow-2xl w-80 max-w-[90%]" style={{ background: '#0f172a', borderColor: '#f9731633', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#1e293b' }}>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" style={{ color: '#f97316' }} />
                  <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>זיהוי תבניות — {ticker}</span>
                </div>
                <button onClick={() => setPatternResult(null)} className="text-zinc-600 hover:text-zinc-300"><X className="h-4 w-4" /></button>
              </div>
              <div className="px-4 py-3 space-y-2.5">
                {patternResult.pattern === 'none' ? (
                  <div className="text-center py-4 space-y-1.5">
                    <p className="text-sm font-medium" style={{ color: '#94a3b8' }}>לא זוהתה תבנית סווינג ברורה כרגע</p>
                    {patternResult.reasoning && <p className="text-[11px]" style={{ color: '#64748b' }}>{patternResult.reasoning}</p>}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-base font-black" style={{ color: '#f97316' }}>{patternResult.patternLabel}</span>
                      <span className="text-xs font-black px-2 py-0.5 rounded" style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid #f9731633' }}>
                        ביטחון {patternResult.confidence}%
                      </span>
                    </div>
                    {patternResult.reasoning && <p className="text-[11px]" style={{ color: '#94a3b8' }}>{patternResult.reasoning}</p>}
                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      {([
                        { label: 'כניסה', val: patternResult.entry,  color: '#3b82f6' },
                        { label: 'סטופ',  val: patternResult.stop,   color: '#ef4444' },
                        { label: 'יעד',   val: patternResult.target, color: '#22c55e' },
                      ]).map(row => (
                        <div key={row.label} className="text-center rounded-lg p-2" style={{ background: row.color + '10', border: `1px solid ${row.color}30` }}>
                          <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: '#64748b' }}>{row.label}</div>
                          <div className="text-xs font-black tabular-nums" style={{ color: row.color }}>{row.val.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-1 text-[10.5px]">
                      <span style={{ color: '#64748b' }}>יחס R:R: <b style={{ color: '#818cf8' }}>{patternResult.riskReward}</b></span>
                      <span style={{ color: '#64748b' }}>משך צפוי: <b style={{ color: '#e2e8f0' }}>{patternResult.expectedDays} ימי מסחר</b></span>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => applyPatternLevels(patternResult)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold" style={{ background: '#f97316', color: '#fff' }}>
                        <CheckCircle className="h-3.5 w-3.5" /> אמץ רמות
                      </button>
                      <button onClick={() => setPatternResult(null)} className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}>
                        בטל
                      </button>
                    </div>
                  </>
                )}
                <p className="text-[9px] text-center pt-1" style={{ color: '#334155' }}>זיהוי תבניות טכני בלבד — אינו מהווה ייעוץ השקעות</p>
              </div>
            </div>
          </div>
        )}

        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
      </div>
    </div>
  )
}
