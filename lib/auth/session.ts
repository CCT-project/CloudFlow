import { createHmac, timingSafeEqual } from 'node:crypto'

export interface SessionUser {
  id: string
  email: string
  name: string
  createdAt?: string
}

export interface SessionPayload {
  user: SessionUser
  exp: number // Unix timestamp in seconds
}

export const SESSION_COOKIE_NAME = 'cloudflow_session'
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60 // 7 days
export const MIN_SESSION_SECRET_LENGTH = 32

// Explicit development-only fallback salt (strictly barred in production)
export const DEV_ONLY_FALLBACK_SECRET =
  'cloudflow-local-development-session-secret-salt-do-not-use-in-production-min32chars'

/**
 * Validates the SESSION_SECRET configuration.
 * Returns an object with isValid flag and sanitized error message (never prints secret).
 */
export function validateSessionSecretConfig(env: NodeJS.ProcessEnv = process.env): {
  isValid: boolean
  error?: string
} {
  const isProduction = env.NODE_ENV === 'production'
  const secret = env.SESSION_SECRET

  if (isProduction) {
    if (!secret || secret.trim().length === 0) {
      return {
        isValid: false,
        error:
          'Missing mandatory environment variable SESSION_SECRET in production. A cryptographically secure secret (minimum 32 characters) must be configured.',
      }
    }
    if (secret.length < MIN_SESSION_SECRET_LENGTH) {
      return {
        isValid: false,
        error: `SESSION_SECRET has insufficient cryptographic length (${secret.length} chars). Production requires at least ${MIN_SESSION_SECRET_LENGTH} characters for 256-bit HMAC security.`,
      }
    }
    if (secret === DEV_ONLY_FALLBACK_SECRET) {
      return {
        isValid: false,
        error:
          'SESSION_SECRET in production cannot use the insecure local development fallback secret.',
      }
    }
    return { isValid: true }
  }

  return { isValid: true }
}

/**
 * Retrieves the verified session signing secret.
 * In production:
 *   - Enforces presence and minimum length (>= 32 chars).
 *   - Prohibits development fallback.
 *   - Fails safely without printing secret material in logs or errors.
 * In development / test:
 *   - Uses process.env.SESSION_SECRET if set, otherwise isolated dev fallback.
 */
export function getSessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const validation = validateSessionSecretConfig(env)
  if (!validation.isValid) {
    throw new Error(`[Security Configuration Error] ${validation.error}`)
  }

  const isProduction = env.NODE_ENV === 'production'
  const configuredSecret = env.SESSION_SECRET

  if (isProduction) {
    return configuredSecret!
  }

  if (configuredSecret && configuredSecret.length >= MIN_SESSION_SECRET_LENGTH) {
    return configuredSecret
  }

  return DEV_ONLY_FALLBACK_SECRET
}

/**
 * Signs a payload string with HMAC-SHA256.
 */
function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

/**
 * Creates a tamper-proof signed session token (base64urlPayload.signature).
 */
export function createSessionToken(user: SessionUser): string {
  const secret = getSessionSecret()
  const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS
  const payload: SessionPayload = {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    },
    exp,
  }

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign(encodedPayload, secret)
  return `${encodedPayload}.${signature}`
}

/**
 * Validates a signed session token. Returns the session payload if valid, null otherwise.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null

  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [encodedPayload, signature] = parts
  let secret: string
  try {
    secret = getSessionSecret()
  } catch {
    return null
  }

  const expectedSignature = sign(encodedPayload, secret)

  // Timing-safe signature comparison
  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (sigBuffer.length !== expectedBuffer.length) {
    return null
  }

  if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null
  }

  try {
    const jsonStr = Buffer.from(encodedPayload, 'base64url').toString('utf8')
    const payload = JSON.parse(jsonStr) as SessionPayload

    if (!payload.user || !payload.exp) {
      return null
    }

    const now = Math.floor(Date.now() / 1000)
    if (payload.exp < now) {
      return null // Expired session
    }

    return payload
  } catch {
    return null
  }
}

/**
 * Reads and verifies the current session from incoming request cookies in Next.js runtime.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

    if (!token) return null

    const session = verifySessionToken(token)
    return session ? session.user : null
  } catch {
    return null
  }
}
