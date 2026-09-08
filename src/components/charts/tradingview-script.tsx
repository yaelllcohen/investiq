'use client'

import Script from 'next/script'

declare global {
  interface Window {
    tvScriptReady?: boolean
  }
}

// Loaded once, app-wide, from (protected)/layout.tsx. onLoad requires a
// Client Component (Next.js does not allow onLoad/onError/onReady on
// <Script> inside a Server Component), hence this tiny wrapper. Components
// that need the widget should NOT poll — they either see
// window.tvScriptReady already true, or listen for the 'tvReady' event
// dispatched here the moment the script finishes loading.
export default function TradingViewScript() {
  return (
    <Script
      src="https://s3.tradingview.com/tv.js"
      strategy="afterInteractive"
      onLoad={() => {
        window.tvScriptReady = true
        window.dispatchEvent(new Event('tvReady'))
      }}
    />
  )
}
