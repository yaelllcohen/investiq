'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
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
  type UTCTimestamp,
  type IPriceLine,
} from 'lightweight-charts'
import { TrendingUp, TrendingDown, Target, X, ExternalLink, Bot, Loader2, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { calcTradeMetrics } from '@/lib/trade-calc'

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartData = { date: string; open: number; high: number; low: number; close: number; volume: number }
type ChartType = 'נרות' | 'OHLC' | 'קו' | 'שטח' | 'Base'
type TimeRange = '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y' | 'MAX'
type IndicatorKey = 'sma50' | 'sma200' | 'ema20' | 'rsi' | 'bb'
type LevelType = 'entry' | 'stop' | 'target'

const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: 'נרות', label: 'נרות' },
  { key: 'OHLC', label: 'OHLC' },
  { key: 'קו', label: 'קו' },
  { key: 'שטח', label: 'שטח' },
  { key: 'Base', label: 'Base' },
]
const TIME_RANGES: TimeRange[] = ['1D', '1W', '1M', '3M', '1Y', '5Y', 'MAX']

const IND_META: Record<IndicatorKey, { label: string; color: string }> = {
  sma50:  { label: 'SMA 50',    color: '#8b5cf6' },
  sma200: { label: 'SMA 200',   color: '#ec4899' },
  ema20:  { label: 'EMA 20',    color: '#f59e0b' },
  rsi:    { label: 'RSI 14',    color: '#a78bfa' },
  bb:     { label: 'Bollinger', color: '#38bdf8' },
}

const LEVEL_CFG: Record<LevelType, { color: string; label: string; icon: string }> = {
  entry:  { color: '#3b82f6', label: 'כניסה', icon: '🔵' },
  stop:   { color: '#ef4444', label: 'סטופ',  icon: '🔴' },
  target: { color: '#22c55e', label: 'יעד',   icon: '🟢' },
}

const IV_KEY = 'iv_indicators_v2'
const MAIN_H = 420
const RSI_H  = 110

// ─── Range → API params ───────────────────────────────────────────────────────

function rangeToQuery(r: TimeRange) {
  const m: Record<TimeRange, { range: string; interval: string }> = {
    '1D':  { range: '1d',  interval: '5m'  },
    '1W':  { range: '5d',  interval: '15m' },
    '1M':  { range: '1mo', interval: '1d'  },
    '3M':  { range: '3mo', interval: '1d'  },
    '1Y':  { range: '1y',  interval: '1d'  },
    '5Y':  { range: '5y',  interval: '1wk' },
    'MAX': { range: 'max', interval: '1mo' },
  }
  return m[r]
}

// ─── Indicator math ───────────────────────────────────────────────────────────

function t(d: ChartData) { return (new Date(d.date).getTime() / 1000) as UTCTimestamp }

function calcSMA(data: ChartData[], p: number) {
  return Array.from({ length: Math.max(0, data.length - p + 1) }, (_, i) => ({
    time: t(data[i + p - 1]),
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
    out.push({ time: t(d), value: e })
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
    out.push({ time: t(data[i]), value: 100 - 100 / (1 + (al === 0 ? 100 : ag / al)) })
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
    const ts = t(data[i])
    upper.push({ time: ts, value: avg + m * std })
    lower.push({ time: ts, value: avg - m * std })
  }
  return { upper, lower }
}

// ─── Add indicator series imperatively ───────────────────────────────────────

function buildIndicator(
  chart: IChartApi,
  key: IndicatorKey,
  data: ChartData[],
): ISeriesApi<'Line'>[] {
  const base = { priceLineVisible: false, lastValueVisible: false }
  if (key === 'sma50') {
    const s = chart.addSeries(LineSeries, { ...base, color: '#8b5cf6', lineWidth: 1 })
    s.setData(calcSMA(data, 50))
    return [s]
  }
  if (key === 'sma200') {
    const s = chart.addSeries(LineSeries, { ...base, color: '#ec4899', lineWidth: 1 })
    s.setData(calcSMA(data, 200))
    return [s]
  }
  if (key === 'ema20') {
    const s = chart.addSeries(LineSeries, { ...base, color: '#f59e0b', lineWidth: 1 })
    s.setData(calcEMA(data, 20))
    return [s]
  }
  if (key === 'bb') {
    const bbData = calcBB(data)
    const lo = { ...base, color: 'rgba(56,189,248,0.45)', lineWidth: 1 as const, lineStyle: LineStyle.Dotted }
    const u = chart.addSeries(LineSeries, lo)
    const l = chart.addSeries(LineSeries, lo)
    u.setData(bbData.upper)
    l.setData(bbData.lower)
    return [u, l]
  }
  return []
}

// ─── AI Levels types ──────────────────────────────────────────────────────────

interface AiLevelsResult {
  entry: number
  stop: number
  target1: number
  target2: number
  riskReward: string
  stopReason: string
  entryReason: string
  targetReason: string
  context: {
    curPrice: number
    sma20: number | null
    sma50: number | null
    sma200: number | null
    rsi: number | null
    support: number | null
    resistance: number | null
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StockChart({ ticker, currentPrice }: { ticker: string; currentPrice?: number }) {
  // ── Refs ─────────────────────────────────────────────────────────────────────
  const containerRef   = useRef<HTMLDivElement>(null)
  const rsiContainerRef = useRef<HTMLDivElement>(null)
  const chartRef       = useRef<IChartApi | null>(null)
  const rsiChartRef    = useRef<IChartApi | null>(null)
  const mainSeriesRef  = useRef<ISeriesApi<SeriesType> | null>(null)
  const rsiSeriesRef   = useRef<ISeriesApi<'Line'> | null>(null)
  const indSeriesRef   = useRef<Map<IndicatorKey, ISeriesApi<'Line'>[]>>(new Map())
  const priceLinesRef  = useRef<Map<LevelType, IPriceLine>>(new Map())
  const levelsRef      = useRef<Record<LevelType, number | null>>({ entry: null, stop: null, target: null })
  const activeIndRef   = useRef<Set<IndicatorKey>>(new Set())
  const placingRef     = useRef<LevelType | null>(null)
  const saveTmrRef     = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── State ────────────────────────────────────────────────────────────────────
  const [chartType, setChartType]         = useState<ChartType>('נרות')
  const [timeRange, setTimeRange]         = useState<TimeRange>('1Y')
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorKey>>(new Set())
  const [loading, setLoading]             = useState(true)
  const [chartData, setChartData]         = useState<ChartData[]>([])
  const [placingMode, setPlacingMode]     = useState<LevelType | null>(null)
  const [levels, setLevels]               = useState<Record<LevelType, number | null>>({ entry: null, stop: null, target: null })
  const [aiLoading, setAiLoading]             = useState(false)
  const [aiResult, setAiResult]               = useState<AiLevelsResult | null>(null)
  const [aiError, setAiError]                 = useState<string | null>(null)
  const [aiRateLimited, setAiRateLimited]     = useState(false)
  const [aiCooldownUntil, setAiCooldownUntil] = useState(0)
  const [aiCooldownSecs, setAiCooldownSecs]   = useState(0)
  const [portfolioSize, setPortfolioSize] = useState<number | null>(null)
  const aiPreviewLinesRef = useRef<Map<string, IPriceLine>>(new Map())

  // ── AI cooldown countdown ──────────────────────────────────────────────────
  useEffect(() => {
    if (aiCooldownUntil <= Date.now()) return
    setAiCooldownSecs(Math.ceil((aiCooldownUntil - Date.now()) / 1000))
    const id = setInterval(() => {
      const left = Math.ceil((aiCooldownUntil - Date.now()) / 1000)
      setAiCooldownSecs(left > 0 ? left : 0)
      if (left <= 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [aiCooldownUntil])

  // ── Load indicators + portfolio size from localStorage ───────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(IV_KEY)
      if (saved) {
        const arr = JSON.parse(saved) as IndicatorKey[]
        const s = new Set(arr)
        setActiveIndicators(s)
        activeIndRef.current = s
      }
    } catch { /* ignore */ }
    try {
      const ps = localStorage.getItem('iv_portfolio_size')
      if (ps) setPortfolioSize(parseInt(ps) || null)
    } catch { /* ignore */ }
  }, [])

  // ── Load chart levels from DB ─────────────────────────────────────────────────
  useEffect(() => {
    let dead = false
    fetch(`/api/chart-levels/${ticker}`)
      .then(r => r.ok ? r.json() : { entry: null, stop: null, target: null })
      .then((d: Record<LevelType, number | null>) => {
        if (dead) return
        levelsRef.current = d
        setLevels(d)
      })
      .catch(() => { /* ignore */ })
    return () => { dead = true }
  }, [ticker])

  // ── Sync placingRef ───────────────────────────────────────────────────────────
  useEffect(() => { placingRef.current = placingMode }, [placingMode])

  // ── Fetch chart data ──────────────────────────────────────────────────────────
  useEffect(() => {
    let dead = false
    setLoading(true)
    const { range, interval } = rangeToQuery(timeRange)
    fetch(`/api/stock/${ticker}/history?range=${range}&interval=${interval}`)
      .then(r => r.json())
      .then((json: unknown) => {
        if (dead) return
        const rows = Array.isArray(json) ? json as ChartData[]
          : ((json as { data?: ChartData[] })?.data ?? [])
        setChartData(rows)
      })
      .catch(() => { if (!dead) setChartData([]) })
      .finally(() => { if (!dead) setLoading(false) })
    return () => { dead = true }
  }, [ticker, timeRange])

  // ── Save level to DB (debounced) ──────────────────────────────────────────────
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

  // ── Create / refresh a price line ─────────────────────────────────────────────
  const syncPriceLine = useCallback((type: LevelType, price: number | null) => {
    const series = mainSeriesRef.current
    if (!series) return
    const old = priceLinesRef.current.get(type)
    if (old) { try { series.removePriceLine(old) } catch { /* ignore */ } priceLinesRef.current.delete(type) }
    if (price === null) return
    const { color, label } = LEVEL_CFG[type]
    // draggable exists at runtime (added in v4.2) but is absent from v5 TS types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineOpts: any = {
      price, color, lineWidth: 2, lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: `${label}: ${price.toFixed(2)}`,
      draggable: true,
    }
    const line = series.createPriceLine(lineOpts)
    priceLinesRef.current.set(type, line)

    // Drag handler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(series as any).subscribePriceLineDragged?.(
      (params: { customPriceLine: IPriceLine; fromPrice: number; toPrice: number }) => {
        if (params.customPriceLine !== line) return
        const np = params.toPrice
        line.applyOptions({ title: `${label}: ${np.toFixed(2)}` })
        levelsRef.current = { ...levelsRef.current, [type]: np }
        setLevels(prev => ({ ...prev, [type]: np }))
        saveLevel(type, np)
      }
    )
  }, [saveLevel])

  // ── Build main chart ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || loading || chartData.length === 0) return

    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }
    mainSeriesRef.current = null
    indSeriesRef.current.clear()
    priceLinesRef.current.clear()

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.parentElement?.clientHeight || MAIN_H,
      layout: { background: { type: ColorType.Solid, color: '#111827' }, textColor: '#e2e8f0' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      crosshair: { vertLine: { color: '#334155' }, horzLine: { color: '#334155' } },
      rightPriceScale: { borderColor: '#1e293b' },
      timeScale: { borderColor: '#1e293b', timeVisible: true, secondsVisible: false },
    })
    chartRef.current = chart

    // Main series
    const co = { upColor: '#22c55e', downColor: '#ef4444', borderUpColor: '#22c55e', borderDownColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444' }
    let ms: ISeriesApi<SeriesType>
    if      (chartType === 'נרות') ms = chart.addSeries(CandlestickSeries, co)
    else if (chartType === 'OHLC') ms = chart.addSeries(BarSeries, { upColor: '#22c55e', downColor: '#ef4444', openVisible: true })
    else if (chartType === 'קו')   ms = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2 })
    else if (chartType === 'שטח')  ms = chart.addSeries(AreaSeries, { lineColor: '#3b82f6', topColor: 'rgba(59,130,246,0.4)', bottomColor: 'rgba(59,130,246,0)', lineWidth: 2 })
    else                            ms = chart.addSeries(BaselineSeries, { baseValue: { type: 'price', price: chartData[0].close }, topLineColor: '#22c55e', topFillColor1: 'rgba(34,197,94,0.28)', topFillColor2: 'rgba(34,197,94,0.05)', bottomLineColor: '#ef4444', bottomFillColor1: 'rgba(239,68,68,0.05)', bottomFillColor2: 'rgba(239,68,68,0.28)', lineWidth: 2 })
    mainSeriesRef.current = ms

    const isOHLC = chartType === 'נרות' || chartType === 'OHLC'
    if (isOHLC) {
      ms.setData(chartData.filter(d => d.open && d.high && d.low && d.close).map(d => ({ time: t(d), open: d.open, high: d.high, low: d.low, close: d.close })))
    } else {
      ms.setData(chartData.filter(d => d.close).map(d => ({ time: t(d), value: d.close })))
    }

    // Volume
    const vol = chart.addSeries(HistogramSeries, { color: '#3b82f6', priceFormat: { type: 'volume' }, priceScaleId: 'vol' })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } })
    vol.setData(chartData.map(d => ({ time: t(d), value: d.volume, color: d.close >= d.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)' })))

    // Indicators from ref (no rebuild dep)
    for (const key of activeIndRef.current) {
      if (key === 'rsi') continue
      const series = buildIndicator(chart, key, chartData)
      if (series.length) indSeriesRef.current.set(key, series)
    }

    // Re-draw existing price levels
    for (const [type, price] of Object.entries(levelsRef.current) as [LevelType, number | null][]) {
      if (price !== null) syncPriceLine(type, price)
    }

    // ── Crosshair tooltip ────────────────────────────────────────────────────
    const tIdx = new Map<number, number>()
    chartData.forEach((d, i) => tIdx.set(Math.floor(new Date(d.date).getTime() / 1000), i))

    const tip = document.createElement('div')
    Object.assign(tip.style, {
      position: 'absolute', display: 'none', zIndex: '10', pointerEvents: 'none',
      background: 'rgba(17,24,39,0.97)', border: '1px solid #334155', borderRadius: '8px',
      padding: '9px 13px', fontSize: '11px', color: '#e2e8f0', whiteSpace: 'nowrap',
      boxShadow: '0 6px 20px rgba(0,0,0,0.6)', direction: 'rtl', lineHeight: '1.6',
    })
    containerRef.current.appendChild(tip)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chart.subscribeCrosshairMove((param: any) => {
      if (!param.time || !param.point) { tip.style.display = 'none'; return }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sd: any = param.seriesData?.get(ms)
      if (!sd) { tip.style.display = 'none'; return }
      const close: number = isOHLC ? (sd.close ?? 0) : (sd.value ?? 0)
      if (close <= 0) { tip.style.display = 'none'; return }

      const idx = tIdx.get(param.time as number) ?? -1
      const raw = idx >= 0 ? chartData[idx] : null
      const prev = idx > 0 ? (chartData[idx - 1]?.close ?? 0) : 0
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

      const cw = containerRef.current?.clientWidth ?? 400
      let lx = param.point.x + 16, ty = param.point.y + 16
      if (lx + 220 > cw) lx = param.point.x - 220 - 8
      if (ty + 120 > (containerRef.current?.clientHeight ?? MAIN_H)) ty = param.point.y - 120 - 8
      tip.style.left = `${Math.max(0, lx)}px`
      tip.style.top  = `${Math.max(0, ty)}px`
      tip.style.display = 'block'
    })

    // ── Click-to-place price level ───────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chart.subscribeClick((param: any) => {
      const mode = placingRef.current
      if (!mode || !param.point) return
      const price = ms.coordinateToPrice(param.point.y)
      if (price === null) return
      levelsRef.current = { ...levelsRef.current, [mode]: price }
      setLevels(prev => ({ ...prev, [mode]: price }))
      syncPriceLine(mode, price)
      saveLevel(mode, price)
      setPlacingMode(null)
    })

    // ── Sync RSI chart (if already built) ────────────────────────────────────
    if (rsiChartRef.current) {
      const mts = chart.timeScale()
      const rts = rsiChartRef.current.timeScale()
      mts.subscribeVisibleLogicalRangeChange(r => { if (r) rts.setVisibleLogicalRange(r) })
      rts.subscribeVisibleLogicalRangeChange(r => { if (r) mts.setVisibleLogicalRange(r) })
    }

    chart.timeScale().fitContent()

    const obs = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
    })
    obs.observe(containerRef.current)

    return () => {
      obs.disconnect()
      tip.remove()
      chart.remove()
      chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData, chartType])

  // ── RSI separate chart ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!rsiContainerRef.current) return

    if (rsiChartRef.current) {
      rsiChartRef.current.remove()
      rsiChartRef.current = null
      rsiSeriesRef.current = null
    }

    if (!activeIndicators.has('rsi') || chartData.length === 0) return

    const rsiData = calcRSI(chartData)
    if (rsiData.length === 0) return

    const rc = createChart(rsiContainerRef.current, {
      width: rsiContainerRef.current.clientWidth,
      height: RSI_H,
      layout: { background: { type: ColorType.Solid, color: '#0f172a' }, textColor: '#64748b' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      crosshair: { vertLine: { color: '#334155' }, horzLine: { color: '#334155' } },
      rightPriceScale: { borderColor: '#1e293b', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: '#1e293b', visible: false },
      handleScroll: false,
      handleScale: false,
    })
    rsiChartRef.current = rc

    const rsiLine = rc.addSeries(LineSeries, { color: '#a78bfa', lineWidth: 2, priceLineVisible: false, lastValueVisible: true })
    rsiLine.setData(rsiData)
    rsiSeriesRef.current = rsiLine

    // 70 / 30 reference lines
    const refBase = { priceLineVisible: false, lastValueVisible: false, lineWidth: 1 as const, lineStyle: LineStyle.Dashed }
    const ob = rc.addSeries(LineSeries, { ...refBase, color: 'rgba(239,68,68,0.45)' })
    const os = rc.addSeries(LineSeries, { ...refBase, color: 'rgba(34,197,94,0.45)' })
    const refTimes = rsiData.map(d => d.time)
    ob.setData(refTimes.map(time => ({ time, value: 70 })))
    os.setData(refTimes.map(time => ({ time, value: 30 })))

    rc.timeScale().fitContent()

    // Sync with main chart
    if (chartRef.current) {
      const mts = chartRef.current.timeScale()
      const rts = rc.timeScale()
      mts.subscribeVisibleLogicalRangeChange(r => { if (r) { try { rts.setVisibleLogicalRange(r) } catch { /* ignore */ } } })
      rts.subscribeVisibleLogicalRangeChange(r => { if (r) { try { mts.setVisibleLogicalRange(r) } catch { /* ignore */ } } })
    }

    const obs = new ResizeObserver(() => {
      if (rsiContainerRef.current && rsiChartRef.current) rsiChartRef.current.applyOptions({ width: rsiContainerRef.current.clientWidth })
    })
    obs.observe(rsiContainerRef.current)

    return () => { obs.disconnect(); rc.remove(); rsiChartRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData, activeIndicators])

  // ── Update price lines when levels change from DB load ─────────────────────
  useEffect(() => {
    if (!mainSeriesRef.current) return
    for (const [type, price] of Object.entries(levels) as [LevelType, number | null][]) {
      const existing = priceLinesRef.current.get(type)
      if (!existing && price !== null) syncPriceLine(type, price)
    }
  }, [levels, syncPriceLine])

  // ── Toggle indicator ──────────────────────────────────────────────────────────
  const toggleIndicator = useCallback((key: IndicatorKey) => {
    setActiveIndicators(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
        // Remove series from chart
        const ss = indSeriesRef.current.get(key)
        if (ss && chartRef.current) {
          for (const s of ss) { try { chartRef.current.removeSeries(s) } catch { /* ignore */ } }
        }
        indSeriesRef.current.delete(key)
      } else {
        next.add(key)
        // Add series if chart & data ready (RSI handled by its own effect)
        if (key !== 'rsi' && chartRef.current && chartData.length > 0) {
          const ss = buildIndicator(chartRef.current, key, chartData)
          if (ss.length) indSeriesRef.current.set(key, ss)
        }
      }
      activeIndRef.current = next
      try { localStorage.setItem(IV_KEY, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }, [chartData])

  // ── Remove a price level ──────────────────────────────────────────────────────
  const clearLevel = useCallback((type: LevelType) => {
    const old = priceLinesRef.current.get(type)
    if (old && mainSeriesRef.current) { try { mainSeriesRef.current.removePriceLine(old) } catch { /* ignore */ } priceLinesRef.current.delete(type) }
    levelsRef.current = { ...levelsRef.current, [type]: null }
    setLevels(prev => ({ ...prev, [type]: null }))
    saveLevel(type, null)
    if (placingRef.current === type) { setPlacingMode(null) }
  }, [saveLevel])

  // ── AI Level helpers ──────────────────────────────────────────────────────────

  const clearAiPreview = useCallback(() => {
    const series = mainSeriesRef.current
    if (!series) return
    for (const line of aiPreviewLinesRef.current.values()) {
      try { series.removePriceLine(line) } catch { /* ignore */ }
    }
    aiPreviewLinesRef.current.clear()
  }, [])

  const drawAiPreview = useCallback((result: AiLevelsResult) => {
    const series = mainSeriesRef.current
    if (!series) return
    clearAiPreview()

    const previews: { key: string; price: number; color: string; label: string }[] = [
      { key: 'ai_entry',   price: result.entry,   color: '#3b82f6', label: `AI כניסה: ${result.entry.toFixed(2)}`   },
      { key: 'ai_stop',    price: result.stop,    color: '#ef4444', label: `AI סטופ: ${result.stop.toFixed(2)}`    },
      { key: 'ai_target1', price: result.target1, color: '#22c55e', label: `AI יעד1: ${result.target1.toFixed(2)}` },
      { key: 'ai_target2', price: result.target2, color: '#86efac', label: `AI יעד2: ${result.target2.toFixed(2)}` },
    ]
    for (const p of previews) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lineOpts: any = { price: p.price, color: p.color, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: p.label, draggable: false }
      const line = series.createPriceLine(lineOpts)
      aiPreviewLinesRef.current.set(p.key, line)
    }
  }, [clearAiPreview])

  const fetchAiLevels = useCallback(() => {
    setAiLoading(true)
    setAiError(null)
    setAiRateLimited(false)
    setAiResult(null)
    fetch(`/api/ai-levels/${encodeURIComponent(ticker)}`)
      .then(async (r) => {
        const d: AiLevelsResult & { error?: string; rateLimited?: boolean } = await r.json()
        if (r.status === 429 || d.rateLimited) {
          setAiRateLimited(true)
          setAiError(d.error ?? 'הגעת למגבלת השימוש היומית של AI. נסי שוב מחר.')
          return
        }
        if (d.error) { setAiError(d.error); return }
        setAiResult(d)
        drawAiPreview(d)
      })
      .catch(() => setAiError('שגיאת רשת — נסה שוב'))
      .finally(() => {
        setAiLoading(false)
        // 10-second cooldown after every call (success or failure)
        setAiCooldownUntil(Date.now() + 10_000)
      })
  }, [ticker, drawAiPreview])

  const applyAiLevels = useCallback((result: AiLevelsResult) => {
    // Apply entry, stop, target1 to the chart and DB
    const toApply: { type: LevelType; price: number }[] = [
      { type: 'entry',  price: result.entry   },
      { type: 'stop',   price: result.stop    },
      { type: 'target', price: result.target1 },
    ]
    // Clear existing preview lines first
    clearAiPreview()
    for (const { type, price } of toApply) {
      levelsRef.current = { ...levelsRef.current, [type]: price }
      setLevels(prev => ({ ...prev, [type]: price }))
      syncPriceLine(type, price)
      saveLevel(type, price)
    }
    setAiResult(null)
  }, [clearAiPreview, syncPriceLine, saveLevel])

  // ── Trade Coach R:R panel ─────────────────────────────────────────────────────
  const tradeMetrics = useMemo(() => {
    const { entry, stop, target } = levels
    if (!entry || !stop || !target || entry <= 0 || stop <= 0 || target <= 0) return null
    return calcTradeMetrics(
      entry, stop, target,
      portfolioSize ?? undefined,
      portfolioSize ? 2 : undefined,
    )
  }, [levels, portfolioSize])

  // ── Style helper ──────────────────────────────────────────────────────────────
  const btn = (active: boolean, color = '#3b82f6') =>
    `px-2.5 py-1 rounded text-xs font-medium border transition-all focus:outline-none ${
      active
        ? `border-transparent text-white`
        : 'border-zinc-800 bg-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
    }`

  const rsiActive = activeIndicators.has('rsi')

  return (
    <div className="rounded-xl overflow-hidden border border-white/5" style={{ background: '#111827' }}>

      {/* ── Controls row 1: chart type + indicators ─────────────────────────── */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-white/5 overflow-x-auto scrollbar-none flex-nowrap">
        {/* Chart types */}
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

        {/* Indicators */}
        <div className="flex flex-wrap gap-1">
          {(Object.keys(IND_META) as IndicatorKey[]).map(key => {
            const { label, color } = IND_META[key]
            const on = activeIndicators.has(key)
            return (
              <button key={key} onClick={() => toggleIndicator(key)}
                className={btn(on, color)}
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

        {/* Level buttons */}
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
                  <span className="text-[9px] font-mono" style={{ color }}>
                    {levels[type]!.toFixed(2)}
                  </span>
                )}
              </button>
            )
          })}

          {/* AI recommendation button */}
          <button
            onClick={fetchAiLevels}
            disabled={aiLoading || aiCooldownSecs > 0}
            title={aiCooldownSecs > 0 ? `המתן ${aiCooldownSecs} שניות לפני בקשה חדשה` : 'קבל המלצת רמות מ-AI'}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-all disabled:opacity-50"
            style={{ borderColor: '#6366f1', color: '#6366f1', background: aiResult ? 'rgba(99,102,241,0.15)' : 'transparent' }}>
            {aiLoading
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Bot className="h-3 w-3" />}
            <span>
              {aiLoading ? 'מחשב...' : aiCooldownSecs > 0 ? `${aiCooldownSecs}ש׳` : 'המלצת AI'}
            </span>
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

      {/* ── AI error banner ────────────────────────────────────────────────── */}
      {aiError && (
        <div className="flex items-center justify-between px-3 py-2 text-xs border-b"
          style={aiRateLimited
            ? { background: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.2)', color: '#eab308' }
            : { background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)', color: '#ef4444' }}>
          <span>{aiRateLimited ? '⏳' : '⚠'} {aiError}</span>
          <button onClick={() => { setAiError(null); setAiRateLimited(false) }}
            className={aiRateLimited ? 'hover:text-yellow-300' : 'hover:text-red-300'}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Main chart area ──────────────────────────────────────────────────── */}
      <div className="relative h-[250px] md:h-[420px]" style={{ cursor: placingMode ? 'crosshair' : 'default' }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#111827' }}>
            <div className="flex flex-col items-center gap-3">
              <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: '#3b82f6', borderTopColor: 'transparent' }} />
              <span className="text-xs" style={{ color: '#64748b' }}>טוען נתונים...</span>
            </div>
          </div>
        )}
        {!loading && chartData.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#111827' }}>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium" style={{ color: '#94a3b8' }}>אין נתונים לתקופה זו</p>
              <p className="text-xs" style={{ color: '#64748b' }}>הבורסה אולי סגורה — נסה טווח אחר</p>
            </div>
          </div>
        )}

        {/* ── AI levels modal overlay ────────────────────────────────────────── */}
        {aiResult && (
          <div className="absolute inset-0 z-20 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)' }}>
            <div className="rounded-xl border shadow-2xl w-80 max-w-[90%]"
              style={{ background: '#0f172a', borderColor: '#6366f133', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#1e293b' }}>
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4" style={{ color: '#6366f1' }} />
                  <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>המלצת AI — {ticker}</span>
                </div>
                <button onClick={() => { clearAiPreview(); setAiResult(null) }}
                  className="text-zinc-600 hover:text-zinc-300 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-4 py-3 space-y-2.5">

                {/* R:R badge */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: '#64748b' }}>יחס סיכון/סיכוי</span>
                  <span className="text-sm font-black px-2 py-0.5 rounded"
                    style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid #6366f133' }}>
                    {aiResult.riskReward}
                  </span>
                </div>

                {/* Level rows */}
                {([
                  { label: 'כניסה',  price: aiResult.entry,   color: '#3b82f6', reason: aiResult.entryReason,  icon: '🔵' },
                  { label: 'סטופ',   price: aiResult.stop,    color: '#ef4444', reason: aiResult.stopReason,   icon: '🔴' },
                  { label: 'יעד 1',  price: aiResult.target1, color: '#22c55e', reason: aiResult.targetReason, icon: '🟢' },
                  { label: 'יעד 2',  price: aiResult.target2, color: '#86efac', reason: '',                    icon: '🟩' },
                ] as { label: string; price: number; color: string; reason: string; icon: string }[]).map(row => (
                  <div key={row.label} className="rounded-lg px-3 py-2 space-y-0.5"
                    style={{ background: row.color + '10', border: `1px solid ${row.color}30` }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium" style={{ color: row.color }}>
                        {row.icon} {row.label}
                      </span>
                      <span className="text-sm font-black tabular-nums" style={{ color: row.color }}>
                        {row.price.toFixed(2)}
                      </span>
                    </div>
                    {row.reason && (
                      <p className="text-[10px]" style={{ color: '#64748b' }}>{row.reason}</p>
                    )}
                  </div>
                ))}

                {/* Technical context strip */}
                <div className="grid grid-cols-3 gap-1 pt-1">
                  {[
                    { k: 'RSI', v: aiResult.context.rsi?.toFixed(0) ?? '—' },
                    { k: 'SMA50', v: aiResult.context.sma50?.toFixed(2) ?? '—' },
                    { k: 'SMA200', v: aiResult.context.sma200?.toFixed(2) ?? '—' },
                  ].map(({ k, v }) => (
                    <div key={k} className="text-center rounded px-1 py-1" style={{ background: '#1e293b' }}>
                      <div className="text-[8px] uppercase tracking-wider" style={{ color: '#475569' }}>{k}</div>
                      <div className="text-[10px] font-mono font-semibold" style={{ color: '#94a3b8' }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => applyAiLevels(aiResult)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{ background: '#22c55e', color: '#fff' }}>
                    <CheckCircle className="h-3.5 w-3.5" />
                    אמץ המלצה
                  </button>
                  <button
                    onClick={() => { clearAiPreview(); setAiResult(null) }}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}>
                    בטל
                  </button>
                </div>

                {/* Disclaimer */}
                <p className="text-[9px] text-center pt-1" style={{ color: '#334155' }}>
                  המלצה טכנית בלבד — אינה מהווה ייעוץ השקעות
                </p>
              </div>
            </div>
          </div>
        )}

        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
      </div>

      {/* ── RSI panel ────────────────────────────────────────────────────────── */}
      {rsiActive && (
        <div className="border-t border-zinc-800">
          <div className="flex items-center justify-between px-3 py-1" style={{ background: '#0f172a' }}>
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#a78bfa' }}>RSI 14</span>
            <div className="flex gap-3 text-[9px]" style={{ color: '#64748b' }}>
              <span style={{ color: 'rgba(239,68,68,0.8)' }}>— 70 קנייתיות יתר</span>
              <span style={{ color: 'rgba(34,197,94,0.8)' }}>— 30 מכירתיות יתר</span>
            </div>
          </div>
          <div ref={rsiContainerRef} style={{ height: RSI_H, width: '100%', background: '#0f172a' }} />
        </div>
      )}

      {/* ── Trade Coach R:R panel ────────────────────────────────────────────── */}
      {tradeMetrics && (() => {
        const rr = tradeMetrics.rrRatio
        const rrColor  = rr >= 2   ? '#22c55e' : rr >= 1.5 ? '#f59e0b' : '#ef4444'
        const rrBg     = rr >= 2   ? 'rgba(34,197,94,0.08)'   : rr >= 1.5 ? 'rgba(245,158,11,0.08)'  : 'rgba(239,68,68,0.08)'
        const rrBorder = rr >= 2   ? '1px solid rgba(34,197,94,0.25)' : rr >= 1.5 ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(239,68,68,0.25)'
        const rrIcon   = rr >= 2.5 ? '✅' : rr >= 2 ? '✅' : rr >= 1.5 ? '⚠️' : '❌'
        const rrLabel  = rr >= 2.5 ? 'יחס מצוין'
          : rr >= 2   ? 'יחס טוב — עסקה ראויה לשקול'
          : rr >= 1.5 ? 'יחס בינוני — שקול להרחיק יעד'
          : 'יחס גרוע — לא מומלץ'
        const rewardPer100 = (rr * 100).toFixed(0)

        return (
          <div className="border-t border-zinc-800 px-4 py-3 space-y-3" style={{ background: '#0d1117' }}>

            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#64748b' }}>
                ניתוח עסקה
              </span>
              <Link
                href={`/trade-coach?ticker=${ticker}&entry=${levels.entry ?? ''}&stop=${levels.stop ?? ''}&target=${levels.target ?? ''}`}
                className="flex items-center gap-1 text-[10px] hover:underline"
                style={{ color: '#3b82f6' }}>
                מאמן מלא <ExternalLink className="h-2.5 w-2.5" />
              </Link>
            </div>

            {/* Levels strip */}
            <div className="flex items-center justify-around text-xs rounded-lg py-2 px-1"
              style={{ background: '#111827', border: '1px solid #1e293b' }}>
              {([
                { label: 'כניסה', val: levels.entry,  color: '#3b82f6' },
                { label: 'סטופ',  val: levels.stop,   color: '#ef4444' },
                { label: 'יעד',   val: levels.target, color: '#22c55e' },
              ] as { label: string; val: number | null; color: string }[]).map((item, i) => (
                <div key={item.label} className="flex flex-col items-center gap-0.5">
                  {i > 0 && <div className="hidden" />}
                  <span className="text-[9px] uppercase tracking-wider" style={{ color: '#475569' }}>{item.label}</span>
                  <span className="text-sm font-black tabular-nums" style={{ color: item.color }}>
                    {item.val?.toFixed(2) ?? '—'}
                  </span>
                </div>
              ))}
            </div>

            {/* 3 metric boxes */}
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center rounded-lg p-2.5" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>
                  <TrendingUp className="h-3 w-3 inline mr-0.5" />פוטנציאל
                </div>
                <div className="text-sm font-black" style={{ color: '#22c55e' }}>
                  +{tradeMetrics.targetPct.toFixed(2)}%
                </div>
              </div>
              <div className="text-center rounded-lg p-2.5" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>
                  <TrendingDown className="h-3 w-3 inline mr-0.5" />סיכון
                </div>
                <div className="text-sm font-black" style={{ color: '#ef4444' }}>
                  -{tradeMetrics.stopPct.toFixed(2)}%
                </div>
              </div>
              <div className="text-center rounded-lg p-2.5" style={{ background: rrBg, border: rrBorder }}>
                <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>R:R</div>
                <div className="text-sm font-black" style={{ color: rrColor }}>
                  1:{rr.toFixed(1)}
                </div>
              </div>
            </div>

            {/* What does this mean + quality badge */}
            <div className="rounded-lg px-3 py-2 space-y-1.5" style={{ background: '#111827', border: '1px solid #1e293b' }}>
              <p className="text-[10.5px]" style={{ color: '#94a3b8' }}>
                <span style={{ color: '#64748b' }}>מה זה אומר? </span>
                על כל ₪100 שמסכן, הפוטנציאל הוא להרוויח ₪{rewardPer100}
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-sm leading-none">{rrIcon}</span>
                <span className="text-[10.5px] font-semibold" style={{ color: rrColor }}>{rrLabel}</span>
              </div>
            </div>

            {/* Position size */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] shrink-0" style={{ color: '#475569' }}>גודל תיק לחישוב:</span>
              <div className="flex items-center gap-1">
                <span className="text-[10px]" style={{ color: '#64748b' }}>₪</span>
                <input
                  type="number"
                  min="0"
                  value={portfolioSize ?? ''}
                  onChange={e => {
                    const v = parseInt(e.target.value) || 0
                    const next = v > 0 ? v : null
                    setPortfolioSize(next)
                    try { next ? localStorage.setItem('iv_portfolio_size', String(next)) : localStorage.removeItem('iv_portfolio_size') } catch { /* ignore */ }
                  }}
                  placeholder="הזן גודל"
                  className="w-24 text-left text-[10px] px-1.5 py-0.5 rounded border outline-none"
                  style={{ background: '#1e293b', borderColor: '#334155', color: '#e2e8f0' }}
                />
              </div>
            </div>
            {tradeMetrics.positionSize != null && tradeMetrics.positionSize > 0 && (
              <p className="text-[10px]" style={{ color: '#64748b' }}>
                גודל פוזיציה מומלץ (2% סיכון):{' '}
                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                  ₪{tradeMetrics.positionSize.toFixed(0)}
                </span>
                {tradeMetrics.shares != null && ` · ${tradeMetrics.shares.toFixed(0)} מניות`}
              </p>
            )}

          </div>
        )
      })()}
    </div>
  )
}
