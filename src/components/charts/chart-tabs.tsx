'use client'

import { useState } from 'react'
import StockChart from './stock-chart'
import TradingViewWidget from './tradingview-widget'
import { toTradingViewSymbol } from '@/lib/tradingview'

type Tab = 'advanced' | 'tradingview'

interface ChartTabsProps {
  ticker: string
  currentPrice?: number
  exchange?: string
  quoteType?: string
}

export default function ChartTabs({ ticker, currentPrice, exchange, quoteType }: ChartTabsProps) {
  const [tab, setTab] = useState<Tab>('advanced')
  const [tvMounted, setTvMounted] = useState(false)
  const tvSymbol = toTradingViewSymbol(ticker, exchange, quoteType)

  // Lazy-mount the TradingView widget on first visit to that tab, then keep it
  // alive (hidden, not unmounted) so switching tabs doesn't reload it.
  const selectTab = (key: Tab) => {
    setTab(key)
    if (key === 'tradingview') setTvMounted(true)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {([
          { key: 'advanced' as const, label: 'גרף מתקדם' },
          { key: 'tradingview' as const, label: 'TradingView' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => selectTab(key)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={tab === key
              ? { background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid #3b82f6' }
              : { color: '#64748b', border: '1px solid transparent' }}
          >
            {label}
          </button>
        ))}
      </div>

      <div hidden={tab !== 'advanced'}>
        <StockChart ticker={ticker} currentPrice={currentPrice} />
      </div>
      <div hidden={tab !== 'tradingview'}>
        {tvMounted && <TradingViewWidget symbol={tvSymbol} />}
      </div>
    </div>
  )
}
