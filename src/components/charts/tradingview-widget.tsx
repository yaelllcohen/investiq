'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

declare global {
  interface Window {
    TradingView?: { widget: new (options: Record<string, unknown>) => unknown }
  }
}

// The tv.js script itself is loaded exactly once, app-wide, via <Script> in
// (protected)/layout.tsx — this component must never inject it. It only
// waits for the resulting window.TradingView global to appear (it may
// already be there, or may still be loading depending on network timing)
// and then constructs the widget.
function waitForTradingView(timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') { reject(new Error('no window')); return }
    if (window.TradingView) { resolve(); return }
    const start = Date.now()
    const id = setInterval(() => {
      if (window.TradingView) { clearInterval(id); resolve(); return }
      if (Date.now() - start > timeoutMs) { clearInterval(id); reject(new Error('TradingView script did not load in time')) }
    }, 100)
  })
}

export default function TradingViewWidget({ symbol }: { symbol: string }) {
  const containerId = `tv_${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let dead = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    setLoading(true)
    setError(false)
    waitForTradingView()
      .then(() => {
        if (dead) return
        // Give the container div's own render/layout pass a moment to settle
        // before handing it to the widget — creating the widget in the same
        // tick the script resolves has been seen to crash on first load if
        // the DOM node isn't fully ready yet.
        timeoutId = setTimeout(() => {
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
      })
      .catch(() => { if (!dead) { setError(true); setLoading(false) } })
    return () => { dead = true; if (timeoutId) clearTimeout(timeoutId) }
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
