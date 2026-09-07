// Maps a Yahoo Finance-style ticker (as used throughout the app) to a
// TradingView "EXCHANGE:SYMBOL" string. Best-effort — the widget is embedded
// with allow_symbol_change: true, so a wrong guess is trivially correctable
// by the user inside the widget itself.

const YAHOO_EXCHANGE_TO_TV: Record<string, string> = {
  NMS: 'NASDAQ', NGM: 'NASDAQ', NCM: 'NASDAQ', NASDAQ: 'NASDAQ',
  NYQ: 'NYSE', NYS: 'NYSE', NYSE: 'NYSE',
  ASE: 'AMEX', AMEX: 'AMEX',
  PCX: 'AMEX', ARCA: 'AMEX',
  BATS: 'BATS', BTS: 'BATS',
  PNK: 'OTC', OTC: 'OTC',
}

export function toTradingViewSymbol(ticker: string, exchange?: string, quoteType?: string): string {
  const t = ticker.toUpperCase().trim()

  // Israeli TASE stocks — Yahoo uses the .TA suffix
  if (t.endsWith('.TA')) {
    return `TASE:${t.slice(0, -3)}`
  }

  // Crypto — Yahoo uses BASE-USD (e.g. BTC-USD); TradingView/Binance uses BASEUSDT
  if (quoteType === 'CRYPTOCURRENCY' || /^[A-Z0-9]+-USD$/.test(t)) {
    const base = t.split('-')[0]
    return `BINANCE:${base}USDT`
  }

  const prefix = (exchange && YAHOO_EXCHANGE_TO_TV[exchange.toUpperCase()]) || 'NASDAQ'
  return `${prefix}:${t}`
}
