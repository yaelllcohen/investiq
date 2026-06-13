import { z } from 'zod'

export const tickerSchema = z
  .string()
  .min(1)
  .max(15)
  .regex(/^[\^A-Z0-9.\-=]+$/i, 'Invalid ticker symbol')
  .transform(s => s.toUpperCase())

export const ASSET_TYPES = [
  'stock', 'etf', 'mutual_fund',
  'gemel', 'hishtalmut', 'pension',
  'bond', 'crypto', 'forex',
  'deposit', 'cash', 'real_estate',
  'gold', 'p2p', 'other',
] as const

export type AssetType = typeof ASSET_TYPES[number]

// Market assets that have live ticker/price data
export const MARKET_ASSET_TYPES: AssetType[] = ['stock', 'etf', 'mutual_fund', 'bond', 'crypto', 'forex']

// Ticker is user-supplied for market assets, auto-generated for all others
const flexibleTickerSchema = z.string().min(1).max(30).trim().toUpperCase()

export const holdingSchema = z.object({
  ticker: flexibleTickerSchema,
  name: z.string().min(1).max(100).trim(),
  quantity: z.number().min(0).max(1_000_000_000),
  avgPrice: z.number().min(0).max(10_000_000_000),
  purchaseDate: z.string().datetime({ offset: true }).or(z.string().date()),
  assetType: z.enum(ASSET_TYPES),
  currency: z.enum(['USD', 'ILS', 'EUR', 'GBP']).default('USD'),
  // Extended optional fields
  managingBody:     z.string().max(100).optional(),
  accountNumber:    z.string().max(50).optional(),
  track:            z.string().max(100).optional(),
  monthlyDeposit:   z.number().min(0).optional(),
  depositFrequency: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
  interestRate:     z.number().min(0).max(100).optional(),
  maturityDate:     z.string().optional(),
})

export const loginSchema = z.object({
  email: z.string().email().max(254).trim().toLowerCase(),
  password: z.string().min(8).max(100),
})

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50).trim(),
  email: z.string().email('Invalid email address').max(254).trim().toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100)
    .regex(/[0-9]/, 'Password must contain at least one number'),
})

export const aiPromptSchema = z.string().min(1).max(2000).trim()

export const tradeSchema = z.object({
  ticker: tickerSchema,
  action: z.enum(['buy', 'sell']),
  quantity: z.number().positive().max(1_000_000),
})

export const watchlistSchema = z.object({
  ticker: tickerSchema,
})

export const riskProfileSchema = z.object({
  score: z.number().int().min(1).max(5),
  label: z.enum([
    'שמרן מאוד',
    'שמרן',
    'מאוזן',
    'אגרסיבי',
    'ספקולטיבי',
  ]),
  answers: z.record(z.string(), z.unknown()),
})

export const profileNameSchema = z.object({
  name: z.string().min(2).max(50).trim(),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(100)
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine(d => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const screenerSchema = z.object({
  goal:          z.enum(['Growth', 'Income', 'Preservation', 'Speculation']),
  timeHorizon:   z.enum(['Short', 'Medium', 'Long']),
  riskTolerance: z.number().int().min(1).max(5),
  assetType:     z.string().min(1).max(20),
  extras:        z.record(z.string(), z.union([z.string().max(100), z.array(z.string().max(100))])).optional().default({}),
  budget:        z.string().max(30),
})

export const compareSchema = z.object({
  tickers: z
    .array(tickerSchema)
    .min(2, 'At least 2 tickers required')
    .max(4, 'Maximum 4 tickers'),
})

export const analyzeSchema = z.object({
  ticker: tickerSchema,
  assetType: z.string().max(20).optional(),
})

export const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000).trim(),
      })
    )
    .min(1)
    .max(50),
})

export function validationError(errors: z.ZodError) {
  return {
    error: 'Validation failed',
    details: errors.flatten().fieldErrors,
  }
}
