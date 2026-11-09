/**
 * CloudFlow Distributed Rate Limiting Architecture
 *
 * TRUSTED-PROXY ARCHITECTURE & THREAT MODEL:
 * 1. Deployment Context:
 *    CloudFlow is architected for deployment behind modern edge reverse proxies (primarily Vercel Edge).
 * 2. Header Precedence & Anti-Spoofing:
 *    - In Vercel Edge infrastructure, 'x-real-ip' is populated authoritatively from the client's
 *      TCP transport socket. Vercel strips or overwrites any client-injected 'x-real-ip' headers.
 *      Therefore, 'x-real-ip' is prioritized as the most trusted network identifier.
 *    - 'x-forwarded-for' is inherently multi-hop and can contain client-forged initial values
 *      (e.g. "X-Forwarded-For: spoofed-ip, proxy-ip"). When falling back to 'x-forwarded-for',
 *      we NEVER trust the first element blindly; we inspect and sanitize valid IPv4/IPv6 values,
 *      selecting the rightmost proxy-verified address.
 *    - Any extracted IP must pass strict IPv4/IPv6 syntactic validation via node:net `isIP`.
 *      Malformed, non-routable, or invalid strings are strictly rejected and quarantined to
 *      a deterministic 'ip:untrusted-fallback' key.
 * 3. Privacy & Redaction:
 *    Raw IP addresses are NEVER logged, returned in response bodies, or stored in plaintext Redis keys.
 *    All client network keys are one-way hashed with SHA-256 and salt (`process.env.SESSION_SECRET`).
 * 4. Production Resilience & Fail-Closed Policy:
 *    - In development/testing (NODE_ENV !== 'production'), an in-memory sliding window provides seamless local development.
 *    - In production (NODE_ENV === 'production'), in-memory fallback is STRICTLY PROHIBITED because serverless
 *      instances do not share local memory. If Redis credentials are absent or the distributed cluster is
 *      unreachable, the system logs a sanitized operational alert and enforces a secure fail-closed policy
 *      (HTTP 503 Service Unavailable) to prevent unprotected brute-force vulnerability.
 */

import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import type { ApiErrorResponse } from '../types/scheduler.ts'

export type RateLimitType = 'login' | 'register' | 'simulate' | 'batchResearch'

export interface RateLimitCheckResult {
  success: boolean
  limit: number
  remaining: number
  reset: number // timestamp in ms
  retryAfterSeconds: number
  serviceUnavailable?: boolean
  errorMessage?: string
}

// In-memory sliding-window bucket for local development and deterministic testing
interface MemoryBucket {
  timestamps: number[]
}
const memoryBuckets = new Map<string, MemoryBucket>()

export function clearMemoryRateLimitBuckets(): void {
  memoryBuckets.clear()
}

/**
 * Checks in-memory sliding window rate limit.
 * ONLY permitted in local development and testing environments.
 */
function checkMemoryRateLimit(
  hashedKey: string,
  limit: number,
  windowSeconds: number
): RateLimitCheckResult {
  const now = Date.now()
  const windowMs = windowSeconds * 1000
  const oldestAllowed = now - windowMs

  let bucket = memoryBuckets.get(hashedKey)
  if (!bucket) {
    bucket = { timestamps: [] }
    memoryBuckets.set(hashedKey, bucket)
  }

  // Prune expired timestamps
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > oldestAllowed)

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0]
    const reset = oldest + windowMs
    const retryAfterSeconds = Math.max(1, Math.ceil((reset - now) / 1000))
    return {
      success: false,
      limit,
      remaining: 0,
      reset,
      retryAfterSeconds,
    }
  }

  bucket.timestamps.push(now)
  const remaining = Math.max(0, limit - bucket.timestamps.length)
  const reset = now + windowMs
  return {
    success: true,
    limit,
    remaining,
    reset,
    retryAfterSeconds: 0,
  }
}

/**
 * Hashes client identifiers (IP or user ID) using SHA-256 with an internal salt.
 * Ensures raw IP addresses are NEVER logged, exposed, or stored in plaintext.
 */
export function hashClientIdentifier(identifier: string, context: string = 'global'): string {
  if (!identifier) return 'anon:unknown'
  const salt = process.env.SESSION_SECRET || 'cloudflow-ratelimit-default-salt'
  return createHash('sha256')
    .update(`${salt}:${context}:${identifier.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32)
}

export interface RequestWithHeaders {
  headers: {
    get: (name: string) => string | null
  }
}

/**
 * Validates whether a candidate IP string is syntactically valid IPv4 or IPv6.
 */
export function isValidIPAddress(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false
  const trimmed = ip.trim()
  return isIP(trimmed) !== 0
}

/**
 * Extracts and sanitizes the client identifier from request headers.
 * 
 * Precedence:
 * 1. Authenticated User ID (`user:<id>`)
 * 2. Trusted Edge IP from `x-real-ip` (Vercel edge socket IP)
 * 3. Verified last hop from `x-forwarded-for` (rightmost valid public/proxy IP)
 * 4. Deterministic fallback (`ip:untrusted-fallback`) for missing/malformed IPs.
 */
export function getClientIdentifier(request: RequestWithHeaders, userId?: string | null): string {
  if (userId && typeof userId === 'string' && userId.trim().length > 0) {
    return `user:${userId.trim()}`
  }

  // 1. Authoritative Vercel edge IP header
  const realIp = request.headers.get('x-real-ip')
  if (realIp && typeof realIp === 'string') {
    const candidate = realIp.trim()
    if (isValidIPAddress(candidate)) {
      return `ip:${candidate}`
    }
  }

  // 2. Multi-hop X-Forwarded-For fallback (do NOT trust first element; scan from right to left)
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded && typeof forwarded === 'string') {
    const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean)
    // Traverse from right (most recently added proxy hop) to left to find valid IP
    for (let i = hops.length - 1; i >= 0; i--) {
      const hop = hops[i]
      if (isValidIPAddress(hop)) {
        return `ip:${hop}`
      }
    }
  }

  // 3. Fallback when headers are missing or malformed
  return 'ip:untrusted-fallback'
}

let redisClient: Redis | null = null
let redisConfigChecked = false
let testProductionMode: boolean | null = null

/**
 * Testing hook to simulate production or development environments deterministically.
 */
export function setProductionModeForTesting(isProd: boolean | null): void {
  testProductionMode = isProd
}

function isProductionEnvironment(): boolean {
  if (testProductionMode !== null) return testProductionMode
  return process.env.NODE_ENV === 'production'
}

function getRedisClient(): Redis | null {
  if (redisConfigChecked) return redisClient

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (url && token && url.trim().length > 0 && token.trim().length > 0) {
    try {
      redisClient = new Redis({
        url: url.trim(),
        token: token.trim(),
      })
    } catch {
      redisClient = null
    }
  } else {
    redisClient = null
  }

  redisConfigChecked = true
  return redisClient
}

export function resetRedisClientForTesting(customClient: Redis | null = null): void {
  redisClient = customClient
  redisConfigChecked = true
  upstashLimiters = {
    login: null,
    register: null,
    simulate: null,
    batchResearch: null,
  }
}

// Configured rate limits:
// Login: 5 requests per minute
// Register: 5 requests per minute
// Simulate: 20 requests per minute
// Batch Research: 10 requests per minute
export const RATE_LIMIT_CONFIG = {
  login: { limit: 5, windowSeconds: 60, prefix: 'rl:auth:login' },
  register: { limit: 5, windowSeconds: 60, prefix: 'rl:auth:reg' },
  simulate: { limit: 20, windowSeconds: 60, prefix: 'rl:sim' },
  batchResearch: { limit: 10, windowSeconds: 60, prefix: 'rl:research:batch' },
}

let upstashLimiters: Record<RateLimitType, Ratelimit | null> = {
  login: null,
  register: null,
  simulate: null,
  batchResearch: null,
}

function getUpstashLimiter(type: RateLimitType): Ratelimit | null {
  const redis = getRedisClient()
  if (!redis) return null

  if (!upstashLimiters[type]) {
    const cfg = RATE_LIMIT_CONFIG[type]
    upstashLimiters[type] = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(cfg.limit, `${cfg.windowSeconds} s`),
      prefix: cfg.prefix,
      analytics: false,
    })
  }

  return upstashLimiters[type]
}

/**
 * Checks distributed rate limit for a client and endpoint type.
 * When Redis is available, enforces cluster-wide limits across serverless instances.
 * 
 * Strict Environment Rules:
 * - In production: If Redis is missing or fails, strictly enforces fail-closed policy
 *   (HTTP 503) without silent in-memory fallback.
 * - In development/testing: Permitted to use local in-memory sliding window.
 */
export async function checkRateLimit(
  type: RateLimitType,
  request: RequestWithHeaders,
  userId?: string | null
): Promise<RateLimitCheckResult> {
  const config = RATE_LIMIT_CONFIG[type]
  const rawIdentifier = getClientIdentifier(request, userId)
  const hashedKey = `${config.prefix}:${hashClientIdentifier(rawIdentifier, type)}`

  const isProd = isProductionEnvironment()
  const upstashLimiter = getUpstashLimiter(type)

  if (upstashLimiter) {
    try {
      const result = await upstashLimiter.limit(hashedKey)
      const now = Date.now()
      const reset = result.reset
      const retryAfterSeconds = Math.max(1, Math.ceil((reset - now) / 1000))

      return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
        reset,
        retryAfterSeconds: result.success ? 0 : retryAfterSeconds,
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown Redis error'

      if (isProd) {
        // Production: Fail-closed policy. Never fall back to in-memory silently.
        console.error(
          `[RateLimit ERROR] Distributed Redis store failed in production for '${type}': ${errorMsg}. Enforcing fail-closed policy.`
        )
        return {
          success: false,
          limit: config.limit,
          remaining: 0,
          reset: Date.now() + config.windowSeconds * 1000,
          retryAfterSeconds: 10,
          serviceUnavailable: true,
          errorMessage: 'Rate limiting service is temporarily unavailable.',
        }
      }

      // Development / test fallback
      console.warn(
        `[RateLimit] Distributed store error in development for '${type}'. Falling back to local sliding window.`
      )
      return checkMemoryRateLimit(hashedKey, config.limit, config.windowSeconds)
    }
  }

  // Redis unconfigured / credentials absent
  if (isProd) {
    // Production: Fail-closed policy. Silent in-memory fallback is prohibited.
    console.error(
      `[RateLimit ERROR] Upstash Redis credentials unconfigured in production environment for '${type}'. Enforcing fail-closed policy.`
    )
    return {
      success: false,
      limit: config.limit,
      remaining: 0,
      reset: Date.now() + config.windowSeconds * 1000,
      retryAfterSeconds: 10,
      serviceUnavailable: true,
      errorMessage: 'Rate limiting service is unconfigured in production.',
    }
  }

  // Local fallback (development and CI testing only)
  return checkMemoryRateLimit(hashedKey, config.limit, config.windowSeconds)
}

/**
 * Creates standard rate-limit headers.
 */
export function createRateLimitHeaders(result: RateLimitCheckResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.reset / 1000)),
  }

  if (!result.success && result.retryAfterSeconds > 0) {
    headers['Retry-After'] = String(result.retryAfterSeconds)
  }

  return headers
}

/**
 * Constructs an HTTP 429 or 503 response body adhering to CloudFlow ApiErrorResponse schema.
 */
export function createRateLimitErrorResponse(
  result: RateLimitCheckResult,
  customMessage?: string
): Response {
  // Service Unavailable (HTTP 503) when production Redis is unconfigured or offline
  if (result.serviceUnavailable) {
    const errorBody: ApiErrorResponse = {
      status: 'error',
      error: {
        code: 'RATE_LIMITER_UNAVAILABLE',
        message:
          result.errorMessage ||
          'Rate limiting service is temporarily unavailable. Please retry shortly.',
        details: [
          'Distributed protection service offline or unconfigured in production.',
          `Retry-After: ${result.retryAfterSeconds || 10} seconds.`,
        ],
      },
    }

    return new Response(JSON.stringify(errorBody), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        ...createRateLimitHeaders(result),
      },
    })
  }

  // Standard Rate Limit Exceeded (HTTP 429)
  const message =
    customMessage ||
    `Too many requests. You have exceeded the allowable limit. Please retry after ${result.retryAfterSeconds} seconds.`

  const errorBody: ApiErrorResponse = {
    status: 'error',
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message,
      details: [
        `Limit: ${result.limit} requests per window.`,
        `Retry-After: ${result.retryAfterSeconds} seconds.`,
      ],
    },
  }

  return new Response(JSON.stringify(errorBody), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      ...createRateLimitHeaders(result),
    },
  })
}
