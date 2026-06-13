'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Trash2, TrendingUp, TrendingDown, Plus, ExternalLink, Eraser } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, formatPercent } from '@/lib/utils'

function isPaperNumber(ticker: string) {
  return /^\d{6,9}$/.test(ticker)
}

function tickerHref(ticker: string) {
  return isPaperNumber(ticker)
    ? `https://www.bizportal.co.il/capitalmarket/quote/generalview/${ticker}`
    : `/stock/${ticker}`
}

const SparklineChart = dynamic(() => import('./sparkline-chart'), {
  ssr: false,
  loading: () => <span style={{ color: 'var(--iq-text-3)' }}>—</span>,
})

export interface WatchlistItem {
  id: string
  userId: string
  ticker: string
  addedAt: Date | string
  name: string
  price: number
  change: number
  changePercent: number
  history?: { value: number }[]
  currency?: string
}

// ─── Add ticker form ─────────────────────────────────────────────────────────

function AddTickerForm({ onAdded }: { onAdded: (item: WatchlistItem) => void }) {
  const [ticker, setTicker] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const t = ticker.trim().toUpperCase()
    if (!t) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: t }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'הוספת הסמל נכשלה')
      onAdded({ ...data, name: data.ticker, price: 0, change: 0, changePercent: 0, history: [] })
      setTicker('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'הוספת הסמל נכשלה')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleAdd} className="flex gap-2 items-start">
      <div className="flex-1 space-y-1">
        <Input
          value={ticker}
          onChange={(e) => {
            const v = e.target.value
            setTicker(/^\d+$/.test(v) ? v : v.toUpperCase())
          }}
          placeholder="לדוגמה: AAPL, BTC-USD, DORL.TA, 1143700"
          className="font-jakarta"
          maxLength={15}
        />
        {error && <p className="text-xs mt-1" style={{ color: 'var(--iq-red)' }}>{error}</p>}
      </div>
      <Button type="submit" disabled={loading || !ticker.trim()} className="gap-1.5 shrink-0">
        <Plus className="h-4 w-4" />
        {loading ? 'מוסיף...' : 'הוסף'}
      </Button>
    </form>
  )
}

// ─── Main Table Component ────────────────────────────────────────────────────

export default function WatchlistTable({ items: initialItems }: { items: WatchlistItem[] }) {
  const [items, setItems] = useState<WatchlistItem[]>(initialItems)
  const [fetching, setFetching] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)
  const [clearingAll, setClearingAll] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/watchlist?history=true')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setItems(data) })
      .catch(console.error)
      .finally(() => setFetching(false))
  }, [])

  function handleAdded(newItem: WatchlistItem) {
    // Add optimistically, then re-fetch to get enriched data
    setItems((prev) => [{ ...newItem, history: [] }, ...prev])
    fetch('/api/watchlist?history=true')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setItems(data) })
      .catch(console.error)
  }

  async function handleRemove(ticker: string) {
    setRemoving(ticker)
    setRemoveError(null)
    try {
      const res = await fetch(`/api/watchlist?ticker=${encodeURIComponent(ticker)}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('[watchlist] delete failed', res.status, data)
        throw new Error(data.error ?? `מחיקה נכשלה (${res.status})`)
      }
      setItems((prev) => prev.filter((i) => i.ticker !== ticker))
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'מחיקה נכשלה')
    } finally {
      setRemoving(null)
    }
  }

  async function handleClearAll() {
    if (!window.confirm('למחוק את כל רשימת המעקב?')) return
    setClearingAll(true)
    setRemoveError(null)
    try {
      const res = await fetch('/api/watchlist?clearAll=1', { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('[watchlist] clearAll failed', res.status, data)
        throw new Error(data.error ?? `מחיקה נכשלה (${res.status})`)
      }
      console.log('[watchlist] clearAll success', data)
      setItems([])
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'מחיקה נכשלה')
    } finally {
      setClearingAll(false)
    }
  }

  if (fetching) {
    return (
      <div className="rounded-xl p-12 flex items-center justify-center" style={{ background: 'var(--iq-surface)', border: '1px solid var(--iq-border)' }}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-yellow-500" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Add ticker + clear all */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--iq-surface)', border: '1px solid var(--iq-border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--iq-text-3)' }}>
            הוסף לרשימת מעקב
          </p>
          {items.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              disabled={clearingAll}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
              style={{ color: 'var(--iq-red)', background: 'var(--iq-red-glow)' }}
            >
              <Eraser className="h-3 w-3" />
              {clearingAll ? 'מוחק...' : 'נקה הכל'}
            </button>
          )}
        </div>
        <AddTickerForm onAdded={handleAdded} />
        {removeError && (
          <p className="text-xs mt-2" style={{ color: 'var(--iq-red)' }}>{removeError}</p>
        )}
      </div>

      {/* Empty state */}
      {items.length === 0 ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{ background: 'var(--iq-surface)', border: '1px solid var(--iq-border)' }}
        >
          <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-20" style={{ color: 'var(--iq-text-2)' }} />
          <p className="text-sm" style={{ color: 'var(--iq-text-2)' }}>רשימת המעקב שלך ריקה.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--iq-text-3)' }}>הוסף סמל למעלה כדי להתחיל לעקוב.</p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--iq-surface)', border: '1px solid var(--iq-border)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--iq-border)' }}>
                  {['סמל', 'שם', 'מחיר', 'שינוי', 'שינוי %', '14 יום', ''].map((h) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${
                        h === 'סמל' || h === 'שם' ? 'text-right' : h === '' ? '' : 'text-left'
                      }`}
                      style={{ color: 'var(--iq-text-3)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const isUp      = item.changePercent >= 0
                  const color     = isUp ? 'var(--iq-green)' : 'var(--iq-red)'
                  const sparkColor = isUp ? '#10B981' : '#F43F5E'

                  return (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-white/[0.025]"
                      style={idx < items.length - 1 ? { borderBottom: '1px solid var(--iq-border)' } : undefined}
                    >
                      {/* Ticker */}
                      <td className="px-4 py-3.5">
                        <Link
                          href={tickerHref(item.ticker)}
                          target={isPaperNumber(item.ticker) ? '_blank' : undefined}
                          rel={isPaperNumber(item.ticker) ? 'noopener noreferrer' : undefined}
                          className="flex items-center gap-1.5 font-bold font-jakarta ticker-sym group/link"
                          style={{ color: 'var(--iq-text)' }}
                        >
                          {item.ticker}
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover/link:opacity-50 transition-opacity" style={{ color: 'var(--iq-text-2)' }} />
                        </Link>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--iq-text-3)' }}>
                          {new Date(item.addedAt).toLocaleDateString('he-IL')}
                        </p>
                      </td>

                      {/* Name */}
                      <td className="px-4 py-3.5 text-sm hidden sm:table-cell" style={{ color: 'var(--iq-text-2)', maxWidth: 180 }}>
                        <span className="block truncate">{item.name}</span>
                      </td>

                      {/* Price */}
                      <td className="px-4 py-3.5 text-left">
                        <span className="font-semibold font-jakarta price" style={{ color: 'var(--iq-text)' }}>
                          {item.price > 0 ? formatCurrency(item.price, item.currency ?? 'USD') : '—'}
                        </span>
                      </td>

                      {/* Change $ */}
                      <td className="px-4 py-3.5 text-left hidden md:table-cell">
                        {item.change !== 0 ? (
                          <span className="flex items-center gap-1 font-jakarta font-medium" style={{ color }}>
                            {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                            {isUp ? '+' : ''}{formatCurrency(item.change, item.currency ?? 'USD')}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--iq-text-3)' }}>—</span>
                        )}
                      </td>

                      {/* Change % */}
                      <td className="px-4 py-3.5 text-left">
                        {item.changePercent !== 0 ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-bold font-jakarta px-2 py-0.5 rounded-full"
                            style={{ color, background: isUp ? 'var(--iq-green-glow)' : 'var(--iq-red-glow)' }}
                          >
                            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {formatPercent(item.changePercent)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--iq-text-3)' }}>—</span>
                        )}
                      </td>

                      {/* Sparkline */}
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        {(item.history?.length ?? 0) >= 2 ? (
                          <SparklineChart data={item.history!} color={sparkColor} />
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--iq-text-3)' }}>—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2 justify-end">
                          <Link
                            href={tickerHref(item.ticker)}
                            target={isPaperNumber(item.ticker) ? '_blank' : undefined}
                            rel={isPaperNumber(item.ticker) ? 'noopener noreferrer' : undefined}
                            className="text-xs font-medium px-2.5 py-1 rounded-lg"
                            style={{ color: 'var(--iq-indigo)', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
                          >
                            צפה
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleRemove(item.ticker)}
                            disabled={removing === item.ticker}
                            className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40"
                            style={{ color: 'var(--iq-text-3)' }}
                            title={`הסר ${item.ticker}`}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--iq-red)'; e.currentTarget.style.background = 'var(--iq-red-glow)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--iq-text-3)'; e.currentTarget.style.background = '' }}
                          >
                            {removing === item.ticker
                              ? <span className="h-3.5 w-3.5 border border-current border-t-transparent rounded-full animate-spin block" />
                              : <Trash2 className="h-3.5 w-3.5" />}
                            <span className="sr-only">הסר {item.ticker}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
