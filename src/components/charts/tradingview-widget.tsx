'use client'

// Plain iframe embed — no script loading, no widget JS API. TradingView's
// own page runs entirely inside its own frame, fully isolated from this
// app, so it cannot crash or destabilize the host page the way the
// script-injected widget could.
export default function TradingViewWidget({ symbol }: { symbol: string }) {
  const src = `https://www.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${encodeURIComponent(symbol)}&interval=D&hidesidetoolbar=0&hidetoptoolbar=0&symboledit=0&saveimage=0&toolbarbg=1a1a2e&theme=dark&style=1&timezone=Asia%2FJerusalem&studies=Volume%40tv-basicstudies&locale=he_IL`

  return (
    <div className="rounded-xl overflow-hidden border border-white/5" style={{ background: '#111827' }}>
      <iframe
        key={symbol}
        src={src}
        width="100%"
        height="600"
        frameBorder="0"
        allowFullScreen
        title={`TradingView — ${symbol}`}
      />
    </div>
  )
}
