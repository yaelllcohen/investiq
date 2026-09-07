// Curated scan universe for the swing scanner — a representative slice of large/mid-cap
// US names (approximating S&P 500 breadth) plus popular Israeli (TASE) tickers.
// Kept intentionally smaller than the full S&P 500 so a scan completes in reasonable time.

export const US_UNIVERSE = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'JPM', 'V',
  'UNH', 'JNJ', 'WMT', 'MA', 'PG', 'HD', 'CVX', 'MRK', 'ABBV', 'PEP',
  'KO', 'COST', 'AVGO', 'XOM', 'BAC', 'PFE', 'TMO', 'CSCO', 'ACN', 'MCD',
  'ADBE', 'CRM', 'NFLX', 'ABT', 'DHR', 'LIN', 'TXN', 'NKE', 'WFC', 'DIS',
  'ORCL', 'VZ', 'CMCSA', 'PM', 'NEE', 'RTX', 'UPS', 'BMY', 'QCOM', 'HON',
  'INTC', 'AMD', 'IBM', 'GE', 'CAT', 'LOW', 'SBUX', 'GS', 'BA', 'AMAT',
  'DE', 'ISRG', 'SPGI', 'BLK', 'MDT', 'ADP', 'GILD', 'LMT', 'MMC', 'SYK',
  'ELV', 'CVS', 'C', 'SCHW', 'MO', 'TJX', 'PLD', 'ZTS', 'MU', 'PANW',
  'NOW', 'UBER', 'SHOP', 'PYPL', 'SQ', 'COIN', 'PLTR', 'SOFI', 'RIVN', 'ARM',
] as const

// Base symbols only — the scanner route appends the .TA suffix for Yahoo Finance.
export const IL_UNIVERSE = [
  'POLI', 'LUMI', 'DSCT', 'MZTF', 'FIBI', 'BEZQ', 'DLEKG', 'PHOE', 'HARL', 'MGDL',
  'AZRT', 'MLSR', 'ENLT', 'ARPT', 'ELAL', 'PTNR', 'CEL', 'CAMT', 'NICE', 'DORL',
] as const

export const SWING_SCAN_UNIVERSE: { symbol: string; fetchSymbol: string; isIsraeli: boolean }[] = [
  ...US_UNIVERSE.map(s => ({ symbol: s, fetchSymbol: s, isIsraeli: false })),
  ...IL_UNIVERSE.map(s => ({ symbol: s, fetchSymbol: `${s}.TA`, isIsraeli: true })),
]
