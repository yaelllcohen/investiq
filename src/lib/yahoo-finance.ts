import YahooFinance from 'yahoo-finance2'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalForYF = globalThis as unknown as { yahooFinance: any }

export const yahooFinance = globalForYF.yahooFinance ?? new YahooFinance()

if (process.env.NODE_ENV !== 'production') globalForYF.yahooFinance = yahooFinance
