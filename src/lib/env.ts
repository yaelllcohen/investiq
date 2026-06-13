import { z } from 'zod'

const envSchema = z.object({
  // Auth
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  NEXTAUTH_URL: z.string().url().optional().default('http://localhost:3000'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Anthropic (optional at startup, required for AI features)
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),

  // OAuth (optional — credentials auth still works without these)
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),

  // Upstash (optional — falls back to in-memory rate limiting)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
})

function validateEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const missing = result.error.flatten().fieldErrors
    console.error('❌ Invalid environment variables:', JSON.stringify(missing, null, 2))
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Missing required environment variables in production')
    }
    // In development, warn but continue
    console.warn('⚠️  Running with missing env vars — some features will not work')
  }
  return result.data ?? ({} as z.infer<typeof envSchema>)
}

export const env = validateEnv()
