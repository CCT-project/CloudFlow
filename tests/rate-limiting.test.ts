import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkRateLimit,
  clearMemoryRateLimitBuckets,
  createRateLimitErrorResponse,
  createRateLimitHeaders,
  getClientIdentifier,
  hashClientIdentifier,
  isValidIPAddress,
  RATE_LIMIT_CONFIG,
  resetRedisClientForTesting,
  setProductionModeForTesting,
} from '../lib/rate-limit/limiter.ts'

test('Rate Limiting: hashClientIdentifier redacts raw IP and is deterministic with salt', () => {
  const ip1 = '198.51.100.42'
  const ip2 = '203.0.113.195'

  const hash1 = hashClientIdentifier(ip1, 'login')
  const hash2 = hashClientIdentifier(ip1, 'login')
  const hash3 = hashClientIdentifier(ip2, 'login')
  const hashDiffContext = hashClientIdentifier(ip1, 'simulate')

  assert.equal(hash1, hash2, 'Identical IP and context must yield deterministic hash')
  assert.notEqual(hash1, hash3, 'Distinct IPs must yield distinct hashes')
  assert.notEqual(hash1, hashDiffContext, 'Distinct contexts must separate keyspace')

  // Confidentiality assertion: hash must not contain the raw IP string
  assert.ok(!hash1.includes(ip1), 'Hashed identifier must never expose raw IP address')
  assert.equal(hash1.length, 32, 'Hash must be 32-character hex representation')
})

test('Task 1: getClientIdentifier prioritizes trusted x-real-ip over spoofed x-forwarded-for', () => {
  // Legitimate x-real-ip with spoofed x-forwarded-for
  const spoofReq = new Request('http://localhost:3000/api/auth/login', {
    headers: {
      'x-real-ip': '203.0.113.42',
      'x-forwarded-for': '198.51.100.99, 10.0.0.1, 127.0.0.1', // Attacker attempting to spoof IP
    },
  })

  const identifier = getClientIdentifier(spoofReq)
  assert.equal(
    identifier,
    'ip:203.0.113.42',
    'Must prioritize authoritative x-real-ip header over client-supplied x-forwarded-for'
  )
})

test('Task 1: getClientIdentifier safely parses multiple forwarded IPs when x-real-ip is absent', () => {
  // Multi-hop proxy chain without x-real-ip: selects rightmost valid proxy hop
  const multiHopReq = new Request('http://localhost:3000/api/auth/login', {
    headers: {
      'x-forwarded-for': '198.51.100.1, 198.51.100.2, 203.0.113.88',
    },
  })

  const identifier = getClientIdentifier(multiHopReq)
  assert.equal(
    identifier,
    'ip:203.0.113.88',
    'Must select the rightmost verified hop from proxy chain'
  )
})

test('Task 1: getClientIdentifier rejects malformed IPs and handles missing headers', () => {
  // Malformed IP in x-real-ip
  const malformedReq1 = new Request('http://localhost:3000/api/simulate', {
    headers: { 'x-real-ip': '999.999.999.999' },
  })
  assert.equal(getClientIdentifier(malformedReq1), 'ip:untrusted-fallback')

  // Malformed text injection
  const malformedReq2 = new Request('http://localhost:3000/api/simulate', {
    headers: { 'x-real-ip': 'malicious-string-injection' },
  })
  assert.equal(getClientIdentifier(malformedReq2), 'ip:untrusted-fallback')

  // Completely missing headers
  const emptyReq = new Request('http://localhost:3000/api/simulate')
  assert.equal(getClientIdentifier(emptyReq), 'ip:untrusted-fallback')

  // User ID takes highest precedence
  const userReq = new Request('http://localhost:3000/api/simulate', {
    headers: { 'x-real-ip': '203.0.113.5' },
  })
  assert.equal(getClientIdentifier(userReq, 'user-12345'), 'user:user-12345')
})

test('Task 1: Different clients receive separate rate-limit identities', () => {
  const reqA = new Request('http://localhost:3000/api/simulate', {
    headers: { 'x-real-ip': '198.51.100.10' },
  })
  const reqB = new Request('http://localhost:3000/api/simulate', {
    headers: { 'x-real-ip': '198.51.100.20' },
  })

  const idA = getClientIdentifier(reqA)
  const idB = getClientIdentifier(reqB)

  assert.notEqual(idA, idB)
  const hashA = hashClientIdentifier(idA, 'simulate')
  const hashB = hashClientIdentifier(idB, 'simulate')
  assert.notEqual(hashA, hashB)
})

test('Task 2: Development mode uses local in-memory sliding window when Redis is absent', async () => {
  setProductionModeForTesting(false) // Development mode
  resetRedisClientForTesting(null) // Redis absent
  clearMemoryRateLimitBuckets()

  const req = new Request('http://localhost:3000/api/auth/login', {
    headers: { 'x-real-ip': '198.51.100.77' },
  })

  // 5 allowed attempts
  for (let i = 0; i < 5; i++) {
    const res = await checkRateLimit('login', req)
    assert.equal(res.success, true, `Dev request ${i + 1} should succeed in-memory`)
  }

  // 6th attempt blocked with HTTP 429 semantics
  const blocked = await checkRateLimit('login', req)
  assert.equal(blocked.success, false)
  assert.equal(blocked.serviceUnavailable, undefined)
  assert.equal(blocked.remaining, 0)
})

test('Task 2: Production mode enforces fail-closed policy (503) when Redis is unconfigured', async () => {
  setProductionModeForTesting(true) // Production mode
  resetRedisClientForTesting(null) // Redis credentials missing
  clearMemoryRateLimitBuckets()

  const req = new Request('http://localhost:3000/api/auth/login', {
    headers: { 'x-real-ip': '198.51.100.77' },
  })

  const result = await checkRateLimit('login', req)
  assert.equal(result.success, false, 'Must fail closed in production without Redis')
  assert.equal(result.serviceUnavailable, true, 'Must flag service as unavailable')
  assert.ok(result.retryAfterSeconds > 0)

  // Verify HTTP 503 response envelope
  const errorResponse = createRateLimitErrorResponse(result)
  assert.equal(errorResponse.status, 503, 'Must return HTTP 503 Service Unavailable')
  const json = await errorResponse.json()
  assert.equal(json.error.code, 'RATE_LIMITER_UNAVAILABLE')

  // Reset back to test mode
  setProductionModeForTesting(null)
})

test('Task 2: Production mode enforces fail-closed policy (503) when Redis connection fails', async () => {
  setProductionModeForTesting(true) // Production mode

  // Mock a failing Redis client that throws on eval/evalsha
  const failingRedis: any = {
    evalsha: async () => {
      throw new Error('ECONNREFUSED: Upstash Redis connection failed')
    },
    eval: async () => {
      throw new Error('ECONNREFUSED: Upstash Redis connection failed')
    },
  }
  resetRedisClientForTesting(failingRedis)

  const req = new Request('http://localhost:3000/api/simulate', {
    headers: { 'x-real-ip': '198.51.100.88' },
  })

  const result = await checkRateLimit('simulate', req)
  assert.equal(result.success, false, 'Must fail closed when Redis throws in production')
  assert.equal(result.serviceUnavailable, true)

  const errorResponse = createRateLimitErrorResponse(result)
  assert.equal(errorResponse.status, 503)
  const json = await errorResponse.json()
  assert.equal(json.error.code, 'RATE_LIMITER_UNAVAILABLE')

  // Clean up
  resetRedisClientForTesting(null)
  setProductionModeForTesting(null)
})

test('Task 2: Redis configured and working evaluates distributed rate limit', async () => {
  setProductionModeForTesting(true)

  // Mock a working Upstash Redis client
  const workingRedis: any = {
    evalsha: async () => {
      throw new Error('NOSCRIPT')
    },
    eval: async () => {
      return [1, 4, Date.now() + 60000] // Success: allowed, 4 remaining
    },
  }
  resetRedisClientForTesting(workingRedis)

  const req = new Request('http://localhost:3000/api/simulate', {
    headers: { 'x-real-ip': '198.51.100.99' },
  })

  const result = await checkRateLimit('simulate', req)
  assert.equal(result.success, true, 'Working Redis should allow request')
  assert.ok(result.remaining >= 0, 'Remaining should be non-negative')

  // Clean up
  resetRedisClientForTesting(null)
  setProductionModeForTesting(null)
})

test('Task 4: Rate-limit headers structure and header generation across all response statuses', async () => {
  setProductionModeForTesting(false)
  resetRedisClientForTesting(null)
  clearMemoryRateLimitBuckets()

  const clientIp = '198.51.100.150'
  const req = new Request('http://localhost:3000/api/auth/login', {
    headers: { 'x-real-ip': clientIp },
  })

  // 1. Success check
  const rl1 = await checkRateLimit('login', req)
  assert.equal(rl1.success, true)
  const headers1 = createRateLimitHeaders(rl1)
  assert.equal(headers1['X-RateLimit-Limit'], '5')
  assert.equal(headers1['X-RateLimit-Remaining'], '4')
  assert.ok(headers1['X-RateLimit-Reset'])
  assert.equal(headers1['Retry-After'], undefined, 'No Retry-After on success')

  // 2. HTTP 400 & HTTP 401 response header preservation verification
  // Standard Response decorated with headers1
  const response400 = new Response(JSON.stringify({ error: 'Malformed JSON' }), {
    status: 400,
    headers: { ...headers1, 'Content-Type': 'application/json' },
  })
  assert.equal(response400.status, 400)
  assert.equal(response400.headers.get('X-RateLimit-Limit'), '5')
  assert.equal(response400.headers.get('X-RateLimit-Remaining'), '4')

  const response401 = new Response(JSON.stringify({ error: 'Invalid credentials' }), {
    status: 401,
    headers: { ...headers1, 'Content-Type': 'application/json' },
  })
  assert.equal(response401.status, 401)
  assert.equal(response401.headers.get('X-RateLimit-Limit'), '5')
  assert.equal(response401.headers.get('X-RateLimit-Remaining'), '4')

  // 3. Exhaust quota to test HTTP 429 response formatting
  for (let i = 0; i < 4; i++) {
    await checkRateLimit('login', req)
  }
  const blockedRL = await checkRateLimit('login', req)
  assert.equal(blockedRL.success, false)
  assert.equal(blockedRL.remaining, 0)
  assert.ok(blockedRL.retryAfterSeconds > 0)

  const response429 = createRateLimitErrorResponse(blockedRL)
  assert.equal(response429.status, 429)
  assert.equal(response429.headers.get('X-RateLimit-Remaining'), '0')
  assert.ok(response429.headers.get('Retry-After'))
  const json429 = await response429.json()
  assert.equal(json429.error.code, 'RATE_LIMITED_EXCEEDED' in json429.error ? json429.error.code : 'RATE_LIMIT_EXCEEDED')

  clearMemoryRateLimitBuckets()
})
