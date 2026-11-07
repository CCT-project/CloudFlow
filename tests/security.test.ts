import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  validateSessionSecretConfig,
  getSessionSecret,
  createSessionToken,
  verifySessionToken,
  DEV_ONLY_FALLBACK_SECRET,
  MIN_SESSION_SECRET_LENGTH,
} from '../lib/auth/session.ts'
import nextConfig from '../next.config.mjs'

test('Security Headers: next.config.mjs exports required production security headers', async () => {
  assert.ok(typeof nextConfig.headers === 'function', 'next.config.mjs must define headers()')

  const headerRules = await nextConfig.headers!()
  assert.ok(Array.isArray(headerRules), 'headers() must return an array')
  assert.ok(headerRules.length > 0, 'headers() must contain at least one route rule')

  const catchAllRule = headerRules.find((r) => r.source === '/:path*')
  assert.ok(catchAllRule, 'Must define a /:path* catch-all security header rule')

  const headersMap = new Map<string, string>()
  for (const h of catchAllRule.headers) {
    headersMap.set(h.key.toLowerCase(), h.value)
  }

  // 1. Content-Security-Policy (CSP)
  assert.ok(headersMap.has('content-security-policy'), 'Must include Content-Security-Policy')
  const csp = headersMap.get('content-security-policy')!
  assert.ok(csp.includes("default-src 'self'"), 'CSP must specify default-src')
  assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP must disallow iframe embedding')
  assert.ok(csp.includes("object-src 'none'"), 'CSP must disallow plugins/object embeds')

  // 2. X-Frame-Options: DENY
  assert.equal(headersMap.get('x-frame-options'), 'DENY', 'X-Frame-Options must be DENY')

  // 3. X-Content-Type-Options: nosniff
  assert.equal(headersMap.get('x-content-type-options'), 'nosniff', 'X-Content-Type-Options must be nosniff')

  // 4. Referrer-Policy
  assert.equal(
    headersMap.get('referrer-policy'),
    'strict-origin-when-cross-origin',
    'Referrer-Policy must be strict-origin-when-cross-origin'
  )

  // 5. Permissions-Policy
  assert.ok(headersMap.has('permissions-policy'), 'Must include Permissions-Policy')
  const permissions = headersMap.get('permissions-policy')!
  assert.ok(permissions.includes('camera=()'), 'Must restrict camera')
  assert.ok(permissions.includes('microphone=()'), 'Must restrict microphone')
  assert.ok(permissions.includes('geolocation=()'), 'Must restrict geolocation')
})

test('Security Headers: Production CSP omits unsafe-eval and includes Strict-Transport-Security', async () => {
  const origNodeEnv = process.env.NODE_ENV
  try {
    ;(process.env as any).NODE_ENV = 'production'
    const headerRules = await nextConfig.headers!()
    const catchAllRule = headerRules.find((r) => r.source === '/:path*')
    assert.ok(catchAllRule)

    const headersMap = new Map<string, string>()
    for (const h of catchAllRule.headers) {
      headersMap.set(h.key.toLowerCase(), h.value)
    }

    const csp = headersMap.get('content-security-policy')!
    assert.ok(
      !csp.includes("'unsafe-eval'"),
      'Production CSP must omit unsafe-eval to prevent dynamic string code execution'
    )
    assert.ok(
      csp.includes("https://va.vercel-scripts.com"),
      'CSP should permit analytics script source'
    )
    assert.ok(
      headersMap.has('strict-transport-security'),
      'Production must include Strict-Transport-Security'
    )
  } finally {
    ;(process.env as any).NODE_ENV = origNodeEnv
  }
})

test('SESSION_SECRET: Production requires strong cryptographic secret (>= 32 chars)', () => {
  // Production without SESSION_SECRET -> Invalid
  const missingInProd = validateSessionSecretConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: undefined,
  } as any)
  assert.equal(missingInProd.isValid, false)
  assert.match(missingInProd.error || '', /Missing mandatory environment variable SESSION_SECRET/)

  // Production with empty SESSION_SECRET -> Invalid
  const emptyInProd = validateSessionSecretConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: '   ',
  } as any)
  assert.equal(emptyInProd.isValid, false)
  assert.match(emptyInProd.error || '', /Missing mandatory environment variable SESSION_SECRET/)

  // Production with short secret (< 32 chars) -> Invalid
  const shortInProd = validateSessionSecretConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: 'too-short-secret-only-23ch',
  } as any)
  assert.equal(shortInProd.isValid, false)
  assert.match(shortInProd.error || '', /insufficient cryptographic length/)

  // Production with development fallback secret -> Invalid
  const devFallbackInProd = validateSessionSecretConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: DEV_ONLY_FALLBACK_SECRET,
  } as any)
  assert.equal(devFallbackInProd.isValid, false)
  assert.match(devFallbackInProd.error || '', /cannot use the insecure local development fallback/)

  // Production with valid 32+ char secret -> Valid
  const validInProd = validateSessionSecretConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: 'a-super-secret-random-production-key-for-cloudflow-2026',
  } as any)
  assert.equal(validInProd.isValid, true)
  assert.equal(validInProd.error, undefined)

  // Development mode safely falls back to local development salt
  const devMode = validateSessionSecretConfig({
    NODE_ENV: 'development',
    SESSION_SECRET: undefined,
  } as any)
  assert.equal(devMode.isValid, true)
})

test('SESSION_SECRET: getSessionSecret enforces production validation and fails safely', () => {
  // When production configuration is invalid, getSessionSecret must throw without leaking secrets
  assert.throws(
    () => {
      getSessionSecret({
        NODE_ENV: 'production',
        SESSION_SECRET: 'short',
      } as any)
    },
    (err: any) => {
      assert.ok(err instanceof Error)
      assert.match(err.message, /Security Configuration Error/)
      // Must not leak the secret itself in the error message
      assert.ok(!err.message.includes('short'))
      return true
    }
  )

  // Valid secret returns exact string in production
  const secretKey = 'a-very-long-production-session-key-greater-than-32-bytes'
  const retrieved = getSessionSecret({
    NODE_ENV: 'production',
    SESSION_SECRET: secretKey,
  } as any)
  assert.equal(retrieved, secretKey)
})

test('Session Security: Detects expired and tampered tokens accurately', () => {
  const user = {
    id: 'user-sec-1',
    email: 'sec@cloudflow.org',
    name: 'Security Tester',
  }

  const validToken = createSessionToken(user)
  const verified = verifySessionToken(validToken)
  assert.ok(verified !== null)
  assert.equal(verified?.user.id, 'user-sec-1')

  // Construct expired token payload
  const expiredPayload = {
    user,
    exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
  }
  const encodedExpired = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url')
  const secret = getSessionSecret()
  const expSig = createHmac('sha256', secret).update(encodedExpired).digest('base64url')
  const expiredToken = `${encodedExpired}.${expSig}`

  assert.equal(
    verifySessionToken(expiredToken),
    null,
    'Expired session token must be rejected even if cryptographically signed'
  )

  // Token signed with different secret
  const foreignSig = createHmac('sha256', 'different-key-that-does-not-match-at-all-32chars').update(encodedExpired).digest('base64url')
  const foreignToken = `${encodedExpired}.${foreignSig}`
  assert.equal(verifySessionToken(foreignToken), null, 'Token signed with mismatched secret must be rejected')
})
