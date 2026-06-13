import { NextResponse } from 'next/server'

// In-memory store for fallback when Upstash is not configured
interface RateLimitRecord {
  count: number
  resetAt: number
}
const memoryStore = new Map<string, RateLimitRecord>()

// Cleanup old entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, record] of memoryStore.entries()) {
      if (record.resetAt < now) memoryStore.delete(key)
    }
  }, 5 * 60 * 1000)
}

export interface RateLimitConfig {
  limit: number
  windowMs: number // milliseconds
}

const isDev = process.env.NODE_ENV === 'development'

export const RATE_LIMITS = {
  ai:       { limit: isDev ? 200  : 20,  windowMs: 60 * 60 * 1000  }, // 20/hour  (200 dev)
  login:    { limit: isDev ? 100  : 10,  windowMs: 15 * 60 * 1000  }, // 10/15min (100 dev)
  register: { limit: isDev ? 100  : 5,   windowMs: 60 * 60 * 1000  }, // 5/hour   (100 dev)
  stock:    { limit: isDev ? 600  : 60,  windowMs: 60 * 1000        }, // 60/min   (600 dev)
  default:  { limit: isDev ? 1000 : 100, windowMs: 60 * 1000        }, // 100/min  (1000 dev)
} as const

export type RateLimitAction = keyof typeof RATE_LIMITS

async function checkUpstash(
  identifier: string,
  config: RateLimitConfig
): Promise<{ success: boolean; remaining: number; reset: number } | null> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!redisUrl || !redisToken) return null

  try {
    const { Ratelimit } = await import('@upstash/ratelimit')
    const { Redis } = await import('@upstash/redis')
    const redis = new Redis({ url: redisUrl, token: redisToken })
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.limit, `${config.windowMs}ms`),
      analytics: false,
    })
    const result = await ratelimit.limit(identifier)
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
    }
  } catch {
    return null
  }
}

function checkMemory(
  identifier: string,
  config: RateLimitConfig
): { success: boolean; remaining: number; reset: number } {
  const now = Date.now()
  const key = `${identifier}`
  const record = memoryStore.get(key)

  if (!record || record.resetAt < now) {
    memoryStore.set(key, { count: 1, resetAt: now + config.windowMs })
    return { success: true, remaining: config.limit - 1, reset: now + config.windowMs }
  }

  if (record.count >= config.limit) {
    return { success: false, remaining: 0, reset: record.resetAt }
  }

  record.count++
  return { success: true, remaining: config.limit - record.count, reset: record.resetAt }
}

export async function rateLimit(
  identifier: string,
  action: RateLimitAction = 'default'
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const config = RATE_LIMITS[action]
  const upstash = await checkUpstash(identifier, config)
  if (upstash !== null) return upstash
  return checkMemory(identifier, config)
}

export function rateLimitResponse(reset: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
        'X-RateLimit-Limit': '0',
        'X-RateLimit-Remaining': '0',
      },
    }
  )
}
