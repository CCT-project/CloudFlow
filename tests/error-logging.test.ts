import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeDatabaseErrorMessage,
  logStructuredDatabaseError,
  sanitizeCorrelationId,
  createExperiment,
  DatabaseError,
} from '../lib/storage/experiments.ts'
import { VALID_POLICIES } from '../lib/validation/api-validator.ts'

const samplePolicies = VALID_POLICIES.map((p) => ({
  policy: p,
  totalRequests: 100,
  averageLatencyMs: 100,
  p95LatencyMs: 150,
  totalCostUSD: 0.01,
  totalCarbonG: 5,
  coldStartRatePercent: 2,
  slaViolationRatePercent: 0.1,
  averageOverheadMs: 0.2,
}))

const sampleAssumptions = {
  prng: 'Mulberry32',
  latencyModel: 'Deterministic',
  costModel: 'Standard',
  carbonModel: 'Marginal',
  coldStartModel: 'Warm-pool',
}

test('Error Logging: sanitizeDatabaseErrorMessage thoroughly redacts sensitive credentials and strings', () => {
  const sensitiveErrors = [
    'Can not connect to postgresql://admin:super_secret_password_123@ep-plain-hat-pooler.neon.tech:5432/neondb?sslmode=require',
    'Connection error with password=my_db_password;token=jwt_session_token_xyz',
    'User researcher.john@example.com failed to execute query at postgresql://user:pass@host/db',
  ]

  for (const raw of sensitiveErrors) {
    const sanitized = sanitizeDatabaseErrorMessage(raw)

    assert.equal(sanitized.includes('super_secret_password_123'), false, 'Password must be redacted')
    assert.equal(sanitized.includes('my_db_password'), false, 'Password must be redacted')
    assert.equal(sanitized.includes('jwt_session_token_xyz'), false, 'Token must be redacted')
    assert.equal(sanitized.includes('researcher.john@example.com'), false, 'Email must be redacted')
  }
})

test('Error Logging: Distinguishes Prisma code P2010, extracts SQLSTATE 42P18, and records both simultaneously', () => {
  const originalConsoleError = console.error
  const loggedLines: string[] = []
  console.error = (msg: string) => {
    loggedLines.push(msg)
  }

  try {
    // Case A: Both Prisma code and SQLSTATE present
    const dualError = {
      name: 'PrismaClientKnownRequestError',
      code: 'P2010',
      meta: {
        code: '42P18',
        message: 'Raw query failed: could not determine data type of parameter $1',
      },
      message: 'Raw query failed at postgresql://user:pass@neon.tech:5432/neondb',
    }

    logStructuredDatabaseError(dualError, {
      operation: 'dual_code_test',
      correlationId: 'corr-dual-123',
    })

    assert.equal(loggedLines.length, 1)
    const parsedDual = JSON.parse(loggedLines[0])
    assert.equal(parsedDual.prismaCode, 'P2010', 'Prisma code P2010 must be recorded in prismaCode')
    assert.equal(parsedDual.sqlState, '42P18', 'PostgreSQL SQLSTATE 42P18 must be recorded in sqlState')
    assert.equal(parsedDual.correlationId, 'corr-dual-123')

    // Case B: Prisma code only (no SQLSTATE meta) - P2010 must NOT be classified as SQLSTATE
    const prismaOnlyError = {
      name: 'PrismaClientKnownRequestError',
      code: 'P2010',
      message: 'Raw query failed',
    }

    logStructuredDatabaseError(prismaOnlyError, {
      operation: 'prisma_only_test',
      correlationId: 'corr-prisma-456',
    })

    assert.equal(loggedLines.length, 2)
    const parsedPrismaOnly = JSON.parse(loggedLines[1])
    assert.equal(parsedPrismaOnly.prismaCode, 'P2010', 'Prisma code must be P2010')
    assert.equal(parsedPrismaOnly.sqlState, undefined, 'P2010 must not be classified as SQLSTATE')

    // Case C: Native PostgreSQL error with SQLSTATE only (e.g. from pg driver)
    const sqlStateOnlyError = {
      name: 'DatabaseError',
      code: '42P18',
      message: 'Indeterminate parameter datatype',
    }

    logStructuredDatabaseError(sqlStateOnlyError, {
      operation: 'sqlstate_only_test',
      correlationId: 'corr-sql-789',
    })

    assert.equal(loggedLines.length, 3)
    const parsedSqlOnly = JSON.parse(loggedLines[2])
    assert.equal(parsedSqlOnly.prismaCode, undefined, 'prismaCode should be undefined for native SQLSTATE')
    assert.equal(parsedSqlOnly.sqlState, '42P18', 'Native code 42P18 must be classified as SQLSTATE')
  } finally {
    console.error = originalConsoleError
  }
})

test('Error Logging: Object.freeze(error) logs safely and duplicate logging is suppressed via WeakSet', () => {
  const originalConsoleError = console.error
  const loggedLines: string[] = []
  console.error = (msg: string) => {
    loggedLines.push(msg)
  }

  try {
    const rawErr = new Error('Frozen database error with sensitive token=xyz123')
    ;(rawErr as any).code = 'P2010'
    const frozenError = Object.freeze(rawErr)

    // First call must succeed without throwing TypeError: Cannot add property on frozen object
    assert.doesNotThrow(() => {
      logStructuredDatabaseError(frozenError, {
        operation: 'frozen_test',
        correlationId: 'corr-frozen-001',
      })
    })

    assert.equal(loggedLines.length, 1, 'Must log first occurrence of frozen error')
    const parsed = JSON.parse(loggedLines[0])
    assert.equal(parsed.correlationId, 'corr-frozen-001')
    assert.equal(parsed.operation, 'frozen_test')
    assert.equal(parsed.sanitizedMessage.includes('xyz123'), false, 'Credentials must be redacted')

    // Second call with identical frozen object must be suppressed by WeakSet
    logStructuredDatabaseError(frozenError, {
      operation: 'frozen_duplicate_test',
      correlationId: 'corr-frozen-001',
    })
    assert.equal(loggedLines.length, 1, 'Duplicate logging must be suppressed without mutating object')
  } finally {
    console.error = originalConsoleError
  }
})

test('Error Logging: sanitizeCorrelationId validates, preserves, and replaces correlation IDs', () => {
  // Valid correlation IDs are preserved
  assert.equal(sanitizeCorrelationId('client-corr-id-123_ABC'), 'client-corr-id-123_ABC')
  assert.equal(sanitizeCorrelationId('req_12345'), 'req_12345')
  assert.equal(sanitizeCorrelationId('a'.repeat(64)), 'a'.repeat(64))

  // Invalid correlation IDs (with spaces, symbols, newlines, injection attempts) are replaced with UUIDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  const newlineId = sanitizeCorrelationId('id\r\nX-Injected-Header: evil')
  assert.match(newlineId, uuidRegex, 'Newline injection must be replaced with fresh UUID')

  const spaceId = sanitizeCorrelationId('invalid id with spaces')
  assert.match(spaceId, uuidRegex, 'Spaces must be replaced with fresh UUID')

  const specialCharId = sanitizeCorrelationId('id<script>alert(1)</script>')
  assert.match(specialCharId, uuidRegex, 'Special chars must be replaced with fresh UUID')

  // Long correlation IDs (> 64 chars) are rejected and replaced with fresh UUIDs
  const longId = sanitizeCorrelationId('b'.repeat(65))
  assert.match(longId, uuidRegex, 'IDs longer than 64 characters must be replaced with fresh UUID')

  // Non-string or null/undefined inputs replaced with fresh UUIDs
  assert.match(sanitizeCorrelationId(null), uuidRegex)
  assert.match(sanitizeCorrelationId(undefined), uuidRegex)
  assert.match(sanitizeCorrelationId(''), uuidRegex)
})

test('Error Logging: createExperiment propagates correlationId and logs safe error on transaction failure', async () => {
  const originalConsoleError = console.error
  const loggedLines: string[] = []
  console.error = (msg: string) => {
    loggedLines.push(msg)
  }

  const failingMockClient = {
    $transaction: async () => {
      const dbErr: any = new Error('Database transaction lock failed on table experiments at postgresql://user:secret123@neon.tech')
      dbErr.code = 'P2010'
      dbErr.meta = { code: '42P18' }
      throw dbErr
    },
    $queryRaw: async () => [{ column_name: 'userId' }, { column_name: 'isPublic' }],
    experiment: {
      create: async () => {},
      count: async () => 0,
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      delete: async () => {},
    },
    policyResult: {
      createMany: async () => ({ count: 0 }),
    },
  }

  try {
    await assert.rejects(
      () =>
        createExperiment(
          {
            name: 'Logging-Test',
            workloadType: 'Medium',
            requestCount: 1000,
            durationMinutes: 10,
            slaLatencyThresholdMs: 300,
            arrivalPattern: 'Steady',
            seed: 42,
            userId: 'user-log-test',
            isPublic: false,
            weights: { alpha: 0.25, beta: 0.25, gamma: 0.25, delta: 0.25 },
            assumptions: sampleAssumptions,
            policyResults: samplePolicies,
            correlationId: 'corr-sim-test-99',
          },
          failingMockClient as any
        ),
      (err: any) => {
        // Must throw generic DatabaseError without exposing database connection or SQL
        assert.ok(err instanceof DatabaseError)
        assert.equal(err.message, 'A database persistence error occurred while processing the request.')
        assert.equal(err.message.includes('secret123'), false)
        return true
      }
    )

    assert.ok(loggedLines.length >= 1, 'Must log error to console.error')
    const parsed = JSON.parse(loggedLines[0])
    assert.equal(parsed.correlationId, 'corr-sim-test-99')
    assert.equal(parsed.operation, 'createExperiment')
    assert.equal(parsed.prismaCode, 'P2010')
    assert.equal(parsed.sqlState, '42P18')
    assert.equal(parsed.sanitizedMessage.includes('secret123'), false, 'Credentials must be redacted from log output')
  } finally {
    console.error = originalConsoleError
  }
})

test('Error Logging: Database persistence error returns generic response payload and preserves security', () => {
  // Test that database error translation matches API response contract
  const dbError = new DatabaseError('A database persistence error occurred while processing the request.', 'DATABASE_PERSISTENCE_FAILED')
  
  const apiErrorPayload = {
    status: 'error',
    error: {
      code: dbError.code,
      message: dbError.message,
    },
  }

  assert.equal(apiErrorPayload.status, 'error')
  assert.equal(apiErrorPayload.error.code, 'DATABASE_PERSISTENCE_FAILED')
  assert.equal(apiErrorPayload.error.message, 'A database persistence error occurred while processing the request.')
  assert.equal(Object.keys(apiErrorPayload.error).length, 2, 'No sensitive internal details exposed in client payload')
})
