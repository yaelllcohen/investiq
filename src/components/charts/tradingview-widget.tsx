'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Loader2, Maximize2, Minimize2, LineChart } from 'lucide-react'

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
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // The heavy tv.js script (and the iframe it injects) has been reported to
  // crash some mobile browsers — require an explicit tap before loading it,
  // rather than pulling it in the moment this tab is opened.
  const [hasStarted, setHasStarted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // The widget itself is sized at 100%/100% of its container — fullscreen just
  // grows the container (via the native Fullscreen API), no need to recreate
  // the widget instance when toggling.
  useEffect(() => {
    if (!hasStarted) return
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
          height: '100%',
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
  }, [symbol, containerId, hasStarted])

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === wrapperRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { /* ignore */ })
    } else {
      wrapperRef.current?.requestFullscreen?.().catch(() => { /* ignore */ })
    }
  }, [])

  if (!hasStarted) {
    return (
      <div
        className="rounded-xl border border-white/5 flex flex-col items-center justify-center gap-3"
        style={{ background: '#111827', height: 600 }}
      >
        <LineChart className="h-8 w-8" style={{ color: '#3b82f6' }} />
        <button
          onClick={() => setHasStarted(true)}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{ background: '#3b82f6', color: '#fff' }}
        >
          טען TradingView
        </button>
        <p className="text-xs" style={{ color: '#64748b' }}>הגרף נטען מ-TradingView.com</p>
      </div>
    )
  }

  return (
    <div
      ref={wrapperRef}
      className="rounded-xl overflow-hidden border border-white/5 relative"
      style={{ background: '#111827', height: isFullscreen ? '100vh' : 600 }}
    >
      <button
        onClick={toggleFullscreen}
        title={isFullscreen ? 'צא ממסך מלא (Esc)' : 'הצג במסך מלא'}
        className="absolute top-2 z-20 flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:brightness-125"
        style={{ right: 8, background: 'rgba(17,24,39,0.85)', border: '1px solid #334155', color: '#94a3b8' }}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>

      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#111827' }}>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#3b82f6' }} />
        </div>
      )}
      {error ? (
        <div className="h-full flex items-center justify-center text-sm" style={{ color: '#64748b' }}>
          שגיאה בטעינת TradingView — נסה שוב מאוחר יותר
        </div>
      ) : (
        <div id={containerId} ref={containerRef} style={{ height: '100%', width: '100%' }} />
      )}
    </div>
  )
}
