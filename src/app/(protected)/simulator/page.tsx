'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { Search, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatCurrency, formatPercent } from '@/lib/utils'

interface SimHolding {
  ticker: string
  quantity: number
  avgPrice: number
  currentPrice: number
  pl: number
  plPercent: number
}

interface Trade {
  id: string
  date: string
  ticker: string
  action: 'BUY' | 'SELL'
  quantity: number
  price: number
  total: number
}

interface SimulatorState {
  balance: number
  holdings: SimHolding[]
  trades: Trade[]
}

interface TradeForm {
  ticker: string
  action: 'BUY' | 'SELL'
  quantity: string
  price: number | null
}

export default function SimulatorPage() {
  const [state, setState] = useState<SimulatorState>({
    balance: 100000,
    holdings: [],
    trades: [],
  })
  const [loading, setLoading] = useState(true)
  const [showTradeModal, setShowTradeModal] = useState(false)
  const [tradeForm, setTradeForm] = useState<TradeForm>({
    ticker: '',
    action: 'BUY',
    quantity: '',
    price: null,
  })
  const [searchTicker, setSearchTicker] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResult, setSearchResult] = useState<{ ticker: string; price: number } | null>(null)
  const [tradeLoading, setTradeLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchState() {
    try {
      const res = await fetch('/api/simulator')
      if (!res.ok) throw new Error('שגיאה בטעינת הסימולטור')
      const json = await res.json()
      setState({ ...json, trades: json.trades ?? [], holdings: json.holdings ?? [] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchState()
  }, [])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!searchTicker.trim()) return
    setSearchLoading(true)
    setSearchResult(null)
    try {
      const res = await fetch(`/api/simulator/quote?ticker=${searchTicker.toUpperCase()}`)
      if (!res.ok) throw new Error('הסמל לא נמצא')
      const json = await res.json()
      setSearchResult({ ticker: searchTicker.toUpperCase(), price: json.price })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הסמל לא נמצא')
    } finally {
      setSearchLoading(false)
    }
  }

  function openTradeModal(ticker: string, price: number, action: 'BUY' | 'SELL' = 'BUY') {
    setTradeForm({ ticker, action, quantity: '', price })
    setShowTradeModal(true)
  }

  async function executeTrade(e: React.FormEvent) {
    e.preventDefault()
    if (!tradeForm.price || !tradeForm.quantity) return
    setTradeLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: tradeForm.ticker,
          action: tradeForm.action.toLowerCase(),
          quantity: parseFloat(tradeForm.quantity),
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'העסקה נכשלה')
      }
      const json = await res.json()
      setState(json)
      setShowTradeModal(false)
      setSearchResult(null)
      setSearchTicker('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'העסקה נכשלה')
    } finally {
      setTradeLoading(false)
    }
  }

  async function handleReset() {
    const confirmed = window.confirm(
      'לאפס את חשבון המסחר הנייר? פעולה זו תמחק את כל האחזקות והיסטוריית העסקאות.'
    )
    if (!confirmed) return
    try {
      const res = await fetch('/api/simulator/reset', { method: 'POST' })
      if (!res.ok) throw new Error('האיפוס נכשל')
      const json = await res.json()
      setState(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'האיפוס נכשל')
    }
  }

  const performanceData = useMemo(() => {
    const recentTrades = [...(state.trades ?? [])].reverse().slice(0, 20).reverse()
    let runningBalance = state.balance
    const points = recentTrades.map((t) => {
      const delta = t.action === 'BUY' ? -t.total : t.total
      runningBalance += delta
      return {
        date: new Date(t.date).toLocaleDateString('he-IL', { month: 'short', day: 'numeric' }),
        balance: runningBalance,
      }
    })
    return points
  }, [state.trades, state.balance])

  const tradeTotal =
    tradeForm.price && tradeForm.quantity
      ? tradeForm.price * parseInt(tradeForm.quantity || '0', 10)
      : 0

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
          <span className="text-zinc-400 text-sm">טוען סימולטור...</span>
        </div>
      </div>
    )
  }

  const recentTrades = (state.trades ?? []).slice(0, 20)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-zinc-100 tracking-wider uppercase">
              סימולטור מסחר נייר
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              יתרה:{' '}
              <span className="text-green-400 font-bold">{formatCurrency(state.balance)} וירטואלי</span>
            </p>
          </div>
          <Button
            onClick={handleReset}
            variant="destructive"
            className="text-xs h-8 px-3 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            אפס חשבון
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-400 px-4 py-2 rounded text-sm">
            {error}
            <button
              onClick={() => setError(null)}
              className="mr-3 text-red-600 hover:text-red-400"
            >
              ✕
            </button>
          </div>
        )}

        {/* Search Bar */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            חיפוש סמל
          </h2>
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              value={searchTicker}
              onChange={(e) => setSearchTicker(e.target.value.toUpperCase())}
              placeholder="הזן סמל (לדוגמה: AAPL)"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-9 text-sm max-w-xs"
            />
            <Button
              type="submit"
              disabled={searchLoading}
              className="bg-blue-600 hover:bg-blue-500 text-white h-9 px-4 gap-1.5 text-xs"
            >
              <Search className="h-3.5 w-3.5" />
              {searchLoading ? 'מחפש...' : 'חפש'}
            </Button>
          </form>

          {searchResult && (
            <div className="mt-3 flex items-center gap-4 bg-zinc-800 rounded px-4 py-3">
              <span className="text-blue-400 font-bold text-sm">{searchResult.ticker}</span>
              <span className="text-zinc-300 text-sm">{formatCurrency(searchResult.price)}</span>
              <Button
                onClick={() => openTradeModal(searchResult.ticker, searchResult.price, 'BUY')}
                className="bg-green-700 hover:bg-green-600 text-white h-7 px-3 text-xs gap-1"
              >
                <TrendingUp className="h-3 w-3" />
                קנה
              </Button>
            </div>
          )}
        </div>

        {/* Holdings Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              פוזיציות פתוחות
            </h2>
          </div>
          {(state.holdings ?? []).length === 0 ? (
            <div className="py-10 text-center text-zinc-500 text-sm">
              אין פוזיציות פתוחות. חפש סמל כדי להתחיל במסחר.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {['סמל', 'כמות', 'מחיר ממוצע', 'נוכחי', 'רו"ה', 'רו"ה %', 'פעולות'].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-right text-zinc-500 font-medium uppercase tracking-wider whitespace-nowrap"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(state.holdings ?? []).map((h) => (
                    <tr
                      key={h.ticker}
                      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-bold text-blue-400">{h.ticker}</td>
                      <td className="px-4 py-3 text-zinc-300">{h.quantity}</td>
                      <td className="px-4 py-3 text-zinc-300">{formatCurrency(h.avgPrice)}</td>
                      <td className="px-4 py-3 text-zinc-300">{formatCurrency(h.currentPrice)}</td>
                      <td
                        className={`px-4 py-3 font-medium ${
                          h.pl >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {formatCurrency(h.pl)}
                      </td>
                      <td
                        className={`px-4 py-3 font-medium ${
                          (h.plPercent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {formatPercent(h.plPercent ?? 0)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => openTradeModal(h.ticker, h.currentPrice, 'BUY')}
                            className="flex items-center gap-0.5 text-[10px] bg-green-900/50 text-green-400 border border-green-800 px-2 py-1 rounded hover:bg-green-800/50 transition-colors"
                          >
                            <TrendingUp className="h-2.5 w-2.5" />
                            קנה עוד
                          </button>
                          <button
                            onClick={() => openTradeModal(h.ticker, h.currentPrice, 'SELL')}
                            className="flex items-center gap-0.5 text-[10px] bg-red-900/50 text-red-400 border border-red-800 px-2 py-1 rounded hover:bg-red-800/50 transition-colors"
                          >
                            <TrendingDown className="h-2.5 w-2.5" />
                            מכור
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Performance Chart */}
        {performanceData.length > 1 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
              יתרה לאורך זמן
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={performanceData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  axisLine={{ stroke: '#3f3f46' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #3f3f46',
                    borderRadius: '6px',
                    color: '#e4e4e7',
                    fontSize: '11px',
                  }}
                  formatter={(v) => [formatCurrency(Number(v ?? 0)), 'יתרה']}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  fill="url(#balanceGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Trade History */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              היסטוריית עסקאות (20 אחרונות)
            </h2>
          </div>
          {recentTrades.length === 0 ? (
            <div className="py-10 text-center text-zinc-500 text-sm">אין עסקאות עדיין.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {['תאריך', 'סמל', 'פעולה', 'כמות', 'מחיר', 'סה"כ'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-right text-zinc-500 font-medium uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-zinc-400">
                        {new Date(t.date).toLocaleString('he-IL', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 font-bold text-blue-400">{t.ticker}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            t.action === 'BUY'
                              ? 'bg-green-900/50 text-green-400'
                              : 'bg-red-900/50 text-red-400'
                          }`}
                        >
                          {t.action === 'BUY' ? 'קנה' : 'מכור'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{t.quantity}</td>
                      <td className="px-4 py-3 text-zinc-300">{formatCurrency(t.price)}</td>
                      <td className="px-4 py-3 text-zinc-100 font-medium">
                        {formatCurrency(t.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Trade Modal */}
      <Dialog open={showTradeModal} onOpenChange={setShowTradeModal}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-zinc-100 font-mono text-base">
              {tradeForm.action === 'BUY' ? 'קנה' : 'מכור'} {tradeForm.ticker}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={executeTrade} className="space-y-4 mt-2">
            {/* Action toggle */}
            <div className="flex rounded overflow-hidden border border-zinc-700">
              <button
                type="button"
                onClick={() => setTradeForm({ ...tradeForm, action: 'BUY' })}
                className={`flex-1 py-2 text-xs font-bold transition-colors ${
                  tradeForm.action === 'BUY'
                    ? 'bg-green-700 text-white'
                    : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                קנה
              </button>
              <button
                type="button"
                onClick={() => setTradeForm({ ...tradeForm, action: 'SELL' })}
                className={`flex-1 py-2 text-xs font-bold transition-colors ${
                  tradeForm.action === 'SELL'
                    ? 'bg-red-700 text-white'
                    : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                מכור
              </button>
            </div>

            <div className="bg-zinc-800 rounded px-3 py-2 flex justify-between items-center">
              <span className="text-zinc-400 text-xs">מחיר</span>
              <span className="text-zinc-100 text-sm font-bold">
                {tradeForm.price ? formatCurrency(tradeForm.price) : '—'}
              </span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">כמות</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={tradeForm.quantity}
                onChange={(e) => setTradeForm({ ...tradeForm, quantity: e.target.value })}
                placeholder="0"
                required
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-9 text-sm"
              />
            </div>

            <div className="bg-zinc-800 rounded px-3 py-2 flex justify-between items-center">
              <span className="text-zinc-400 text-xs">סה&quot;כ</span>
              <span className="text-zinc-100 text-sm font-bold">
                {tradeTotal > 0 ? formatCurrency(tradeTotal) : '—'}
              </span>
            </div>

            {error && (
              <p className="text-red-400 text-xs">{error}</p>
            )}

            <DialogFooter className="pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowTradeModal(false)}
                className="border-zinc-700 text-zinc-400 hover:text-zinc-100 text-xs h-8"
              >
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={tradeLoading}
                className={`text-white text-xs h-8 ${
                  tradeForm.action === 'BUY'
                    ? 'bg-green-700 hover:bg-green-600'
                    : 'bg-red-700 hover:bg-red-600'
                }`}
              >
                {tradeLoading
                  ? 'מבצע...'
                  : tradeForm.action === 'BUY'
                  ? 'אשר קנייה'
                  : 'אשר מכירה'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
