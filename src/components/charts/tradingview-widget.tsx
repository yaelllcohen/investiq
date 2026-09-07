'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

declare global {
  interface Window {
    TradingView?: { widget: new (options: Record<string, unknown>) => unknown }
  }
}

let scriptPromise: Promise<void> | null = null
function loadTradingViewScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.TradingView) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/tv.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('failed to load TradingView script'))
    document.head.appendChild(script)
  })
  return scriptPromise
}

export default function TradingViewWidget({ symbol }: { symbol: string }) {
  const containerId = `tv_${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let dead = false
    setLoading(true)
    setError(false)
    loadTradingViewScript()
      .then(() => {
        if (dead || !containerRef.current || !window.TradingView) return
        containerRef.current.innerHTML = ''
        new window.TradingView.widget({
          container_id: containerId,
          width: '100%',
          height: 500,
          symbol,
          interval: 'D',
          timezone: 'Asia/Jerusalem',
          theme: 'dark',
          style: '1',
          locale: 'he_IL',
          toolbar_bg: '#1a1a2e',
          enable_publishing: false,
          hide_side_toolbar: false,
          allow_symbol_change: true,
        })
        setLoading(false)
      })
      .catch(() => { if (!dead) { setError(true); setLoading(false) } })
    return () => { dead = true }
  }, [symbol, containerId])

  return (
    <div className="rounded-xl overflow-hidden border border-white/5 relative" style={{ background: '#111827' }}>
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#111827' }}>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#3b82f6' }} />
        </div>
      )}
      {error ? (
        <div className="h-[500px] flex items-center justify-center text-sm" style={{ color: '#64748b' }}>
          שגיאה בטעינת TradingView — נסה שוב מאוחר יותר
        </div>
      ) : (
        <div id={containerId} ref={containerRef} style={{ height: 500, width: '100%' }} />
      )}
    </div>
  )
}
