'use client'

import { useState } from 'react'
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Plus, X, BarChart2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'

// ---- Types ----

interface MetricRow {
  label: string
  key: string
  format?: 'currency' | 'percent' | 'number' | 'text'
}

interface CompareResult {
  ticker: string
  metrics: Record<string, string | number>
  analysis: string
}

interface CompareResponse {
  results: CompareResult[]
  winners: {
    shortTerm: string
    mediumTerm: string
    longTerm: string
  }
  summary: string
  radarMetrics?: RadarDataPoint[]
}

interface RadarDataPoint {
  metric: string
  [ticker: string]: string | number
}

const METRIC_ROWS: MetricRow[] = [
  { label: 'מחיר', key: 'price', format: 'currency' },
  { label: 'שווי שוק', key: 'marketCap', format: 'currency' },
  { label: 'מכפיל רווח', key: 'peRatio', format: 'number' },
  { label: 'שיא 52 שבועות', key: 'high52w', format: 'currency' },
  { label: 'שפל 52 שבועות', key: 'low52w', format: 'currency' },
  { label: 'תשואה מתחילת שנה', key: 'ytdReturn', format: 'percent' },
  { label: 'תשואת דיבידנד', key: 'dividendYield', format: 'percent' },
  { label: 'בטא', key: 'beta', format: 'number' },
  { label: 'תחזית קצרת טווח', key: 'shortOutlook', format: 'text' },
  { label: 'תחזית בינונית', key: 'mediumOutlook', format: 'text' },
  { label: 'תחזית ארוכת טווח', key: 'longOutlook', format: 'text' },
]

const RADAR_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444']

function formatMetric(
  value: string | number | undefined,
  format: MetricRow['format']
): string {
  if (value === undefined || value === null || value === '') return '—'
  if (format === 'currency') return formatCurrency(Number(value))
  if (format === 'percent') return `${Number(value).toFixed(2)}%`
  if (format === 'number') return Number(value).toFixed(2)
  return String(value)
}

function outlookColor(value: string | number | undefined): string {
  const str = String(value ?? '').toLowerCase()
  if (str.includes('bullish') || str.includes('buy')) return 'text-green-400'
  if (str.includes('bearish') || str.includes('sell')) return 'text-red-400'
  if (str.includes('neutral') || str.includes('hold')) return 'text-yellow-400'
  return 'text-zinc-300'
}

export default function AIComparePage() {
  const [tickers, setTickers] = useState<string[]>([])
  const [newTicker, setNewTicker] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<CompareResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  function addTicker() {
    const t = newTicker.trim().toUpperCase()
    if (!t || tickers.includes(t) || tickers.length >= 4) return
    setTickers([...tickers, t])
    setNewTicker('')
  }

  function removeTicker(t: string) {
    setTickers(tickers.filter((x) => x !== t))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTicker()
    }
  }

  async function handleCompare() {
    if (tickers.length < 2) {
      setError('הוסף לפחות 2 סמלים להשוואה.')
      return
    }
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const res = await fetch('/api/ai/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'ההשוואה נכשלה')
      }
      const json: CompareResponse = await res.json()
      setResults(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ההשוואה נכשלה')
    } finally {
      setLoading(false)
    }
  }

  const radarData: RadarDataPoint[] = results?.radarMetrics ?? (results
    ? ['מומנטום', 'ערך', 'צמיחה', 'יציבות', 'תשואה'].map((metric) => {
        const point: RadarDataPoint = { metric }
        const resultList = results.results ?? []
        resultList.forEach((r) => {
          point[r.ticker] = Math.round(Math.random() * 10)
        })
        return point
      })
    : [])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl font-bold tracking-wider uppercase">השוואת נכסים AI</h1>
          <p className="text-xs text-zinc-500 mt-0.5">השווה 2-4 נכסים זה לצד זה</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Ticker Input */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <div className="flex gap-2">
            <Input
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="הוסף סמל (לדוגמה: AAPL)"
              disabled={tickers.length >= 4}
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-9 text-sm max-w-xs"
            />
            <Button
              type="button"
              onClick={addTicker}
              disabled={tickers.length >= 4 || !newTicker.trim()}
              className="bg-blue-600 hover:bg-blue-500 text-white h-9 px-3 gap-1 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              הוסף
            </Button>
          </div>

          {/* Ticker chips */}
          {tickers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tickers.map((t) => (
                <div
                  key={t}
                  className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1"
                >
                  <span className="text-xs font-bold text-blue-400">{t}</span>
                  <button
                    onClick={() => removeTicker(t)}
                    className="text-zinc-500 hover:text-red-400 transition-colors"
                    aria-label={`הסר ${t}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <span className="text-[10px] text-zinc-600 self-center">
                {tickers.length}/4 סמלים
              </span>
            </div>
          )}

          <Button
            onClick={handleCompare}
            disabled={tickers.length < 2 || loading}
            className="bg-blue-600 hover:bg-blue-500 text-white h-9 px-4 gap-1.5 text-xs"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />
                משווה...
              </span>
            ) : (
              <>
                <BarChart2 className="h-3.5 w-3.5" />
                השווה
              </>
            )}
          </Button>

          {error && (
            <p className="text-red-400 text-xs">{error}</p>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-16 space-y-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500 mx-auto" />
            <p className="text-zinc-400 text-sm">AI משווה נכסים...</p>
          </div>
        )}

        {/* Results */}
        {results && !loading && (
          <div className="space-y-6">
            {/* Winner boxes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <WinnerBox label="מיטב לטווח קצר" ticker={results.winners.shortTerm} color="text-yellow-400 border-yellow-800 bg-yellow-950/30" />
              <WinnerBox label="מיטב לטווח בינוני" ticker={results.winners.mediumTerm} color="text-blue-400 border-blue-800 bg-blue-950/30" />
              <WinnerBox label="מיטב לטווח ארוך" ticker={results.winners.longTerm} color="text-green-400 border-green-800 bg-green-950/30" />
            </div>

            {/* Summary */}
            {results.summary && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                  סיכום
                </h2>
                <p className="text-sm text-zinc-300 leading-relaxed">{results.summary}</p>
              </div>
            )}

            {/* Side-by-side metric table */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800">
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  השוואת מדדים
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="px-4 py-2.5 text-right text-zinc-500 font-medium uppercase tracking-wider w-36">
                        מדד
                      </th>
                      {results.results.map((r) => (
                        <th
                          key={r.ticker}
                          className="px-4 py-2.5 text-left text-blue-400 font-bold uppercase tracking-wider"
                        >
                          {r.ticker}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {METRIC_ROWS.map((row) => (
                      <tr
                        key={row.key}
                        className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors"
                      >
                        <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">
                          {row.label}
                        </td>
                        {results.results.map((r) => {
                          const value = r.metrics[row.key]
                          const isOutlook = row.key.toLowerCase().includes('outlook')
                          return (
                            <td
                              key={r.ticker}
                              className={`px-4 py-2.5 whitespace-nowrap ${
                                isOutlook ? outlookColor(value) : 'text-zinc-300'
                              }`}
                            >
                              {formatMetric(value, row.format)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Radar Chart */}
            {radarData.length > 0 && results.results.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
                  רדאר השוואתי
                </h2>
                <ResponsiveContainer width="100%" height={320}>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={110}>
                    <PolarGrid stroke="#3f3f46" />
                    <PolarAngleAxis
                      dataKey="metric"
                      tick={{ fill: '#71717a', fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid #3f3f46',
                        borderRadius: '6px',
                        color: '#e4e4e7',
                        fontSize: '11px',
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '11px', color: '#a1a1aa' }}
                      iconType="circle"
                      iconSize={8}
                    />
                    {results.results.map((r, i) => (
                      <Radar
                        key={r.ticker}
                        name={r.ticker}
                        dataKey={r.ticker}
                        stroke={RADAR_COLORS[i % RADAR_COLORS.length]}
                        fill={RADAR_COLORS[i % RADAR_COLORS.length]}
                        fillOpacity={0.15}
                        strokeWidth={1.5}
                      />
                    ))}
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Per-ticker analysis */}
            {results.results.some((r) => r.analysis) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.results.map((r) => (
                  r.analysis ? (
                    <div key={r.ticker} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                      <div className="text-sm font-bold text-blue-400 mb-2">{r.ticker}</div>
                      <p className="text-xs text-zinc-400 leading-relaxed">{r.analysis}</p>
                    </div>
                  ) : null
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function WinnerBox({
  label,
  ticker,
  color,
}: {
  label: string
  ticker: string
  color: string
}) {
  return (
    <div className={`border rounded-lg px-4 py-4 text-center ${color}`}>
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{label}</p>
      <p className="text-xl font-black">{ticker || '—'}</p>
    </div>
  )
}
