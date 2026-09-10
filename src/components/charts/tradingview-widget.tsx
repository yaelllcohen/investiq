'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Maximize2, Minimize2 } from 'lucide-react'

// Plain iframe embed — no script loading, no widget JS API. TradingView's
// own page runs entirely inside its own frame, fully isolated from this
// app, so it cannot crash or destabilize the host page the way the
// script-injected widget could.
export default function TradingViewWidget({ symbol }: { symbol: string }) {
  // Tracks which symbol's iframe has actually fired its SECOND onLoad (see
  // reloadedForRef below) — compared against the current symbol (rather than
  // a plain boolean reset via effect) so switching symbols — which remounts
  // the iframe below via its key — correctly shows the spinner again without
  // needing a synchronization effect.
  const [loadedSymbol, setLoadedSymbol] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const loaded = loadedSymbol === symbol

  // TradingView's widgetembed frequently renders blank on a cold first load
  // and only draws correctly once reloaded — silently reload it exactly once
  // per symbol behind the same loading spinner, so the user only ever sees
  // one continuous load instead of a "broken, try again" first attempt.
  const reloadedForRef = useRef<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)

  const handleLoad = () => {
    if (reloadedForRef.current !== symbol) {
      reloadedForRef.current = symbol
      setReloadNonce(n => n + 1)
      return
    }
    setLoadedSymbol(symbol)
  }

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement?.id === 'tv-iframe')
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.getElementById('tv-iframe')?.requestFullscreen()
    }
  }

  // studies: EMA 8 + SMA 200 shown by default (MAExp / MASimple basic studies).
  const src = `https://www.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${encodeURIComponent(symbol)}&interval=D&hide_side_toolbar=0&hidetoptoolbar=0&symboledit=0&saveimage=0&toolbarbg=1a1a2e&theme=dark&style=1&timezone=Asia%2FJerusalem&locale=he_IL&studies=MAExp%40tv-basicstudies%7C%7B%22length%22%3A8%7D%2CMASimple%40tv-basicstudies%7C%7B%22length%22%3A200%7D`

  return (
    <div className="rounded-xl overflow-hidden border border-white/5 relative" style={{ background: '#111827', height: 600 }}>
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10" style={{ background: '#111827' }}>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#3b82f6' }} />
          <span className="text-xs" style={{ color: '#64748b' }}>טוען גרף...</span>
        </div>
      )}
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute top-2 right-2 z-20 flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-white/10"
        style={{ background: 'rgba(17,24,39,0.8)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}
        title={isFullscreen ? 'צא ממסך מלא' : 'מסך מלא'}
        aria-label={isFullscreen ? 'צא ממסך מלא' : 'מסך מלא'}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
      <iframe
        id="tv-iframe"
        key={`${symbol}-${reloadNonce}`}
        src={src}
        width="100%"
        height="600"
        frameBorder="0"
        allowFullScreen
        title={`TradingView — ${symbol}`}
        onLoad={handleLoad}
      />
    </div>
  )
}
