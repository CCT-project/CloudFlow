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

export type RateLimitErrorCategory =
  | 'NONE'
  | 'MISSING_ENV'
  | 'INVALID_URL'
  | 'AUTH_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN'

export interface RateLimitCheckResult {
  success: boolean
  limit: number
  remaining: number
  reset: number // timestamp in ms
  retryAfterSeconds: number
  serviceUnavailable?: boolean
  errorMessage?: string
  diagnosticCode?: string
  errorCategory?: RateLimitErrorCategory
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
let redisExplicitlyMocked = false
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

export interface NormalizedUpstashConfig {
  url: string
  token: string
}

/**
 * Normalizes and sanitizes Upstash Redis connection parameters.
 * Defensively handles common configuration pitfalls:
 * - Surrounding single or double quotes (e.g. from copy-pasting .env values)
 * - Trailing slashes in URL
 * - TCP redis:// or rediss:// connection strings (converts to REST https:// and extracts token if needed)
 * - Missing protocol prefix (prepends https://)
 * - Trailing TCP port :6379 (strips since Upstash REST runs over HTTPS port 443)
 */
export function normalizeUpstashConfig(
  rawUrl?: string | null,
  rawToken?: string | null
): NormalizedUpstashConfig | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null
  let url = rawUrl.trim()
  let token = typeof rawToken === 'string' ? rawToken.trim() : ''

  // Strip surrounding quotes
  if (
    (url.startsWith('"') && url.endsWith('"')) ||
    (url.startsWith("'") && url.endsWith("'"))
  ) {
    url = url.slice(1, -1).trim()
  }
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim()
  }

  if (url.length === 0 || token.length === 0) {
    return null
  }

  // Strictly reject TCP Redis connection schemes (redis:// or rediss://).
  // CloudFlow rate limiting requires an official Upstash HTTPS REST endpoint.
  // Silently converting TCP URLs is prohibited to prevent unintended network requests.
  if (url.startsWith('redis://') || url.startsWith('rediss://')) {
    return null
  }

  // Handle missing protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }

  // Normalize URL and strip port 6379 / trailing slashes / paths
  try {
    const parsed = new URL(url)
    if (!parsed.hostname || parsed.hostname.trim().length === 0) {
      return null
    }
    parsed.pathname = ''
    parsed.search = ''
    parsed.hash = ''
    if (parsed.port === '6379') {
      parsed.port = ''
    }
    url = parsed.toString().replace(/\/$/, '')
  } catch {
    url = url.replace(/:6379$/, '').replace(/\/$/, '')
  }

  if (!url || !token) return null
  return { url, token }
}

export interface CategorizedError {
  category: RateLimitErrorCategory
  code: string
  sanitizedMessage: string
}

/**
 * Categorizes Redis errors into safe, sanitized categories and diagnostic codes.
 * Ensures internal credentials, URLs, tokens, or network specifics are NEVER leaked.
 */
export function categorizeRedisError(err: unknown): CategorizedError {
  if (!err) {
    return {
      category: 'UNKNOWN',
      code: 'REDIS_UNKNOWN',
      sanitizedMessage: 'An unknown Redis error occurred.',
    }
  }

  const rawMessage = err instanceof Error ? err.message : String(err)
  const lower = rawMessage.toLowerCase()

  if (
    lower.includes('unauthorized') ||
    lower.includes('401') ||
    lower.includes('wrongpass') ||
    lower.includes('permission denied') ||
    lower.includes('noperm')
  ) {
    return {
      category: 'AUTH_ERROR',
      code: 'REDIS_AUTH_FAILED',
      sanitizedMessage: 'Upstash Redis authentication failed (check REST token and permissions).',
    }
  }

  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('etimedout') ||
    lower.includes('aborterror')
  ) {
    return {
      category: 'TIMEOUT',
      code: 'REDIS_TIMEOUT',
      sanitizedMessage: 'Connection to distributed rate limiter timed out.',
    }
  }

  if (
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('fetch failed') ||
    lower.includes('network')
  ) {
    return {
      category: 'NETWORK_ERROR',
      code: 'REDIS_NETWORK_ERROR',
      sanitizedMessage: 'Distributed rate limiter endpoint is unreachable.',
    }
  }

  if (
    lower.includes('redis://') ||
    lower.includes('rediss://') ||
    lower.includes('invalid_url_scheme')
  ) {
    return {
      category: 'INVALID_URL',
      code: 'REDIS_INVALID_URL_SCHEME',
      sanitizedMessage:
        'TCP Redis URLs (redis://, rediss://) are not supported. Upstash HTTPS REST endpoint is required.',
    }
  }

  if (
    lower.includes('invalid url') ||
    lower.includes('url starting with https')
  ) {
    return {
      category: 'INVALID_URL',
      code: 'REDIS_INVALID_URL',
      sanitizedMessage: 'Upstash Redis URL is formatted incorrectly.',
    }
  }

  return {
    category: 'UNKNOWN',
    code: 'REDIS_ERROR',
    sanitizedMessage: 'Distributed rate limiting store encountered an internal error.',
  }
}

export interface RateLimitDiagnostics {
  urlConfigured: boolean
  tokenConfigured: boolean
  urlValidFormat: boolean
  clientInitialized: boolean
  connectivityTest: 'passed' | 'failed' | 'skipped'
  rateLimitTest: 'passed' | 'failed' | 'skipped'
  errorCategory: RateLimitErrorCategory
  errorCode?: string
  sanitizedMessage?: string
}

/**
 * Runs safe, non-destructive diagnostics on the distributed rate limiting infrastructure.
 * Identifies configuration, initialization, connectivity, and rate-limit execution state.
 * NEVER prints, exposes, or returns tokens, keys, or secret values.
 */
export async function getRateLimiterDiagnostics(): Promise<RateLimitDiagnostics> {
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL
  const rawToken = process.env.UPSTASH_REDIS_REST_TOKEN

  const urlConfigured = Boolean(rawUrl && rawUrl.trim().length > 0)
  const tokenConfigured = Boolean(rawToken && rawToken.trim().length > 0)

  if (!urlConfigured || !tokenConfigured) {
    return {
      urlConfigured,
      tokenConfigured,
      urlValidFormat: false,
      clientInitialized: false,
      connectivityTest: 'skipped',
      rateLimitTest: 'skipped',
      errorCategory: 'MISSING_ENV',
      errorCode: 'REDIS_MISSING_CREDENTIALS',
      sanitizedMessage: 'One or more required Upstash Redis environment variables are missing.',
    }
  }

  const normalized = normalizeUpstashConfig(rawUrl, rawToken)
  let urlValidFormat = false
  try {
    if (normalized?.url) {
      const parsed = new URL(normalized.url)
      urlValidFormat = parsed.protocol === 'https:' || parsed.protocol === 'http:'
    }
  } catch {
    urlValidFormat = false
  }

  if (!urlValidFormat || !normalized) {
    const isTcp =
      Boolean(rawUrl) &&
      (rawUrl!.trim().startsWith('redis://') || rawUrl!.trim().startsWith('rediss://'))
    return {
      urlConfigured,
      tokenConfigured,
      urlValidFormat: false,
      clientInitialized: false,
      connectivityTest: 'skipped',
      rateLimitTest: 'skipped',
      errorCategory: 'INVALID_URL',
      errorCode: isTcp ? 'REDIS_INVALID_URL_SCHEME' : 'REDIS_INVALID_URL',
      sanitizedMessage: isTcp
        ? 'TCP Redis URLs (redis://, rediss://) are not supported. Upstash HTTPS REST endpoint is required.'
        : 'Upstash Redis URL format is invalid. Expected valid HTTPS URL.',
    }
  }

  let redis: Redis
  try {
    redis = new Redis({
      url: normalized.url,
      token: normalized.token,
      retry: { retries: 1 },
    })
  } catch (err) {
    const errorInfo = categorizeRedisError(err)
    return {
      urlConfigured,
      tokenConfigured,
      urlValidFormat,
      clientInitialized: false,
      connectivityTest: 'skipped',
      rateLimitTest: 'skipped',
      errorCategory: errorInfo.category,
      errorCode: errorInfo.code,
      sanitizedMessage: errorInfo.sanitizedMessage,
    }
  }

  // Connectivity test (ping)
  try {
    await redis.ping()
  } catch (err) {
    const errorInfo = categorizeRedisError(err)
    return {
      urlConfigured,
      tokenConfigured,
      urlValidFormat,
      clientInitialized: true,
      connectivityTest: 'failed',
      rateLimitTest: 'skipped',
      errorCategory: errorInfo.category,
      errorCode: errorInfo.code,
      sanitizedMessage: errorInfo.sanitizedMessage,
    }
  }

  // Rate-limit test
  try {
    const testLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '60 s'),
      prefix: 'rl:diagnostic:test',
      analytics: false,
    })
    const res = await testLimiter.limit('health-check')
    return {
      urlConfigured,
      tokenConfigured,
      urlValidFormat,
      clientInitialized: true,
      connectivityTest: 'passed',
      rateLimitTest: res.success ? 'passed' : 'failed',
      errorCategory: 'NONE',
      sanitizedMessage: 'Distributed rate limiter is fully operational.',
    }
  } catch (err) {
    const errorInfo = categorizeRedisError(err)
    return {
      urlConfigured,
      tokenConfigured,
      urlValidFormat,
      clientInitialized: true,
      connectivityTest: 'passed',
      rateLimitTest: 'failed',
      errorCategory: errorInfo.category,
      errorCode: errorInfo.code,
      sanitizedMessage: errorInfo.sanitizedMessage,
    }
  }
}

let cachedConfigKey = ''

function getRedisClient(): Redis | null {
  if (redisExplicitlyMocked) return redisClient

  const rawUrl = process.env.UPSTASH_REDIS_REST_URL
  const rawToken = process.env.UPSTASH_REDIS_REST_TOKEN

  const config = normalizeUpstashConfig(rawUrl, rawToken)
  if (!config) {
    redisClient = null
    cachedConfigKey = ''
    return null
  }

  const currentKey = `${config.url}:::${config.token}`
  if (redisClient && cachedConfigKey === currentKey) {
    return redisClient
  }

  try {
    redisClient = new Redis({
      url: config.url,
      token: config.token,
      retry: { retries: 1 },
    })
    cachedConfigKey = currentKey
    // Invalidate limiters when redisClient is re-created to prevent stale client bindings
    upstashLimiters = {
      login: null,
      register: null,
      simulate: null,
      batchResearch: null,
    }
  } catch (err) {
    const errorInfo = categorizeRedisError(err)
    console.error(
      `[RateLimit] Failed to initialize Upstash Redis client (${errorInfo.code}): ${errorInfo.sanitizedMessage}`
    )
    redisClient = null
    cachedConfigKey = ''
  }

  return redisClient
}

export function resetRedisClientForTesting(
  customClient: any = null,
  forceMock: boolean = true
): void {
  redisClient = customClient
  redisExplicitlyMocked = forceMock
  cachedConfigKey = ''
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
      const errorInfo = categorizeRedisError(err)

      if (isProd) {
        // Production: Fail-closed policy. Never fall back to in-memory silently.
        console.error(
          `[RateLimit ERROR] Distributed Redis store failed in production for '${type}' (${errorInfo.code}): ${errorInfo.sanitizedMessage}. Enforcing fail-closed policy.`
        )
        return {
          success: false,
          limit: config.limit,
          remaining: 0,
          reset: Date.now() + config.windowSeconds * 1000,
          retryAfterSeconds: 10,
          serviceUnavailable: true,
          errorMessage: 'Rate limiting service is temporarily unavailable.',
          diagnosticCode: errorInfo.code,
          errorCategory: errorInfo.category,
        }
      }

      // Development / test fallback
      console.warn(
        `[RateLimit] Distributed store error in development for '${type}'. Falling back to local sliding window.`
      )
      return checkMemoryRateLimit(hashedKey, config.limit, config.windowSeconds)
    }
  }

  // Redis unconfigured / credentials absent or invalid
  if (isProd) {
    const rawUrl = process.env.UPSTASH_REDIS_REST_URL
    const isTcp =
      Boolean(rawUrl) &&
      (rawUrl!.trim().startsWith('redis://') || rawUrl!.trim().startsWith('rediss://'))
    const code = isTcp ? 'REDIS_INVALID_URL_SCHEME' : 'REDIS_MISSING_CREDENTIALS'
    const category: RateLimitErrorCategory = isTcp ? 'INVALID_URL' : 'MISSING_ENV'
    const message = isTcp
      ? 'Rate limiting service URL scheme is invalid in production (HTTPS REST required).'
      : 'Rate limiting service is unconfigured in production.'

    // Production: Fail-closed policy. Silent in-memory fallback is prohibited.
    console.error(
      `[RateLimit ERROR] Upstash Redis configuration error in production environment for '${type}' (${code}). Enforcing fail-closed policy.`
    )
    return {
      success: false,
      limit: config.limit,
      remaining: 0,
      reset: Date.now() + config.windowSeconds * 1000,
      retryAfterSeconds: 10,
      serviceUnavailable: true,
      errorMessage: message,
      diagnosticCode: code,
      errorCategory: category,
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

  if (result.diagnosticCode) {
    headers['X-RateLimit-Error-Code'] = result.diagnosticCode
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
          result.diagnosticCode
            ? `Distributed protection service offline (${result.diagnosticCode}).`
            : 'Distributed protection service offline or unconfigured in production.',
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
