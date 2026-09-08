'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

// Plain iframe embed — no script loading, no widget JS API. TradingView's
// own page runs entirely inside its own frame, fully isolated from this
// app, so it cannot crash or destabilize the host page the way the
// script-injected widget could.
export default function TradingViewWidget({ symbol }: { symbol: string }) {
  // Tracks which symbol's iframe has actually fired onLoad. Compared against
  // the current symbol (rather than a plain boolean reset via effect) so
  // switching symbols — which remounts the iframe below via its key —
  // correctly shows the spinner again without needing a synchronization effect.
  const [loadedSymbol, setLoadedSymbol] = useState<string | null>(null)
  const loaded = loadedSymbol === symbol

  // No studies param — TradingView's own chart already shows volume by
  // default, so requesting Volume@tv-basicstudies just duplicated it.
  const src = `https://www.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${encodeURIComponent(symbol)}&interval=D&hidesidetoolbar=0&hidetoptoolbar=0&symboledit=0&saveimage=0&toolbarbg=1a1a2e&theme=dark&style=1&timezone=Asia%2FJerusalem&locale=he_IL`

  return (
    <div className="rounded-xl overflow-hidden border border-white/5 relative" style={{ background: '#111827', height: 600 }}>
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10" style={{ background: '#111827' }}>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#3b82f6' }} />
          <span className="text-xs" style={{ color: '#64748b' }}>טוען גרף...</span>
        </div>
      )}
      <iframe
        key={symbol}
        src={src}
        width="100%"
        height="600"
        frameBorder="0"
        allowFullScreen
        title={`TradingView — ${symbol}`}
        onLoad={() => setLoadedSymbol(symbol)}
      />
    </div>
  )
}
