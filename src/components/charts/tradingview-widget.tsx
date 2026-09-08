'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

declare global {
  interface Window {
    TradingView?: { widget: new (options: Record<string, unknown>) => unknown }
    tvScriptReady?: boolean
  }
}

export default function TradingViewWidget({ symbol }: { symbol: string }) {
  const containerId = `tv_${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let dead = false
    let widgetTimeoutId: ReturnType<typeof setTimeout> | null = null
    let failSafeId: ReturnType<typeof setTimeout> | null = null
    setLoading(true)
    setError(false)

    // Widget is created only once we're SURE the script has finished loading
    // — either it already had by the time this mounted, or we wait for the
    // 'tvReady' event dispatched by TradingViewScript's onLoad. No polling.
    function createWidget() {
      if (dead) return
      // Give the container div's own render/layout pass a moment to settle
      // before handing it to the widget — creating it in the same tick the
      // script becomes ready has been seen to crash on first load if the
      // DOM node isn't fully ready yet.
      widgetTimeoutId = setTimeout(() => {
        if (dead || !containerRef.current || !window.TradingView) return
        containerRef.current.innerHTML = ''
        new window.TradingView.widget({
          container_id: containerId,
          symbol,
          width: '100%',
          height: 600,
          interval: 'D',
          timezone: 'Asia/Jerusalem',
          theme: 'dark',
          style: '1',
          locale: 'he_IL',
          toolbar_bg: '#1a1a2e',
          enable_publishing: false,
          hide_side_toolbar: false,
          allow_symbol_change: false,
        })
        setLoading(false)
      }, 100)
    }

    if (window.tvScriptReady) {
      createWidget()
    } else {
      window.addEventListener('tvReady', createWidget)
      // One-shot safety net — not polling — in case the script failed to
      // load entirely and 'tvReady' never fires, so we don't spin forever.
      failSafeId = setTimeout(() => {
        if (!dead && !window.tvScriptReady) { setError(true); setLoading(false) }
      }, 15000)
    }

    return () => {
      dead = true
      if (widgetTimeoutId) clearTimeout(widgetTimeoutId)
      if (failSafeId) clearTimeout(failSafeId)
      window.removeEventListener('tvReady', createWidget)
    }
  }, [symbol, containerId])

  return (
    <div className="rounded-xl overflow-hidden border border-white/5 relative" style={{ background: '#111827', height: 600, width: '100%' }}>
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
