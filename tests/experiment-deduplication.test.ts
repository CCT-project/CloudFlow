import test from 'node:test'
import assert from 'node:assert/strict'
import type { PersistedPolicyResult } from '../lib/types/scheduler.ts'
import {
  createExperiment,
  findRecentDuplicateExperiment,
  generateExperimentLockKey,
  DatabaseError,
} from '../lib/storage/experiments.ts'
import { VALID_POLICIES } from '../lib/validation/api-validator.ts'

interface MockOptions {
  failQueryRaw?: boolean
  failInsert?: boolean
}

function createMockPrismaClient(options: MockOptions = {}) {
  const experiments: any[] = []
  const policyResults: any[] = []
  const acquiredLocks: string[] = []
  const releasedLocks: string[] = []
  const activeLocks = new Set<string>()
  const lockWaiters = new Map<string, Array<() => void>>()

  const mock = {
    _experiments: experiments,
    _policyResults: policyResults,
    _acquiredLocks: acquiredLocks,
    _releasedLocks: releasedLocks,
    _activeLocks: activeLocks,
    failQueryRaw: options.failQueryRaw ?? false,
    failInsert: options.failInsert ?? false,

    $transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      let holdingLock: string | null = null

      const txMock = {
        ...mock,
        $queryRaw: async (query: any, ...args: any[]) => {
          if (mock.failQueryRaw) {
            throw new Error('Lock acquisition failed: connection timeout')
          }

          // Check if this query is an advisory lock acquisition
          const queryStr =
            typeof query === 'string'
              ? query
              : Array.isArray(query)
                ? query.join(' ')
                : query?.strings?.join(' ') || String(query || '')

          if (queryStr.includes('pg_advisory_xact_lock')) {
            const lockKey = args[0] || (query?.values && query.values[0]) || 'unknown-lock'
            holdingLock = lockKey
            acquiredLocks.push(lockKey)

            // If another transaction is currently holding this transaction lock, wait for it
            if (activeLocks.has(lockKey)) {
              await new Promise<void>((resolve) => {
                const queue = lockWaiters.get(lockKey) || []
                queue.push(resolve)
                lockWaiters.set(lockKey, queue)
              })
            }
            activeLocks.add(lockKey)
            return [{ pg_advisory_xact_lock: '' }]
          }

          // Default column check query
          return [{ column_name: 'userId' }, { column_name: 'isPublic' }]
        },
        experiment: {
          ...mock.experiment,
          create: async (args: any) => {
            if (mock.failInsert) {
              throw new Error('Simulated transaction failure during experiment insert')
            }
            return await mock.experiment.create(args)
          },
        },
      }

      try {
        const result = await fn(txMock)
        return result
      } finally {
        if (holdingLock) {
          activeLocks.delete(holdingLock)
          releasedLocks.push(holdingLock)
          const waiters = lockWaiters.get(holdingLock)
          if (waiters && waiters.length > 0) {
            const next = waiters.shift()
            if (next) next()
          }
        }
      }
    },

    $queryRaw: async (query: any, ...args: any[]) => {
      if (mock.failQueryRaw) {
        throw new Error('Lock acquisition failed: connection timeout')
      }
      return [{ column_name: 'userId' }, { column_name: 'isPublic' }]
    },

    experiment: {
      create: async (args: any) => {
        const id = args.data.id || `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const record = {
          id,
          name: args.data.name,
          createdAt: args.data.createdAt || new Date(),
          workloadType: args.data.workloadType,
          requestCount: args.data.requestCount,
          durationMinutes: args.data.durationMinutes,
          slaLatencyThresholdMs: args.data.slaLatencyThresholdMs,
          arrivalPattern: args.data.arrivalPattern,
          seed: args.data.seed,
          weights: args.data.weights,
          assumptions: args.data.assumptions,
          userId: args.data.userId ?? null,
          isPublic: Boolean(args.data.isPublic),
          policyResults: [] as any[],
        }

        if (args.data.policyResults?.create) {
          for (const pr of args.data.policyResults.create) {
            const prRecord = {
              id: `pr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              experimentId: id,
              policy: pr.policy,
              totalRequests: pr.totalRequests,
              averageLatencyMs: pr.averageLatencyMs,
              p95LatencyMs: pr.p95LatencyMs,
              totalCostUSD: pr.totalCostUSD,
              totalCarbonG: pr.totalCarbonG,
              coldStartRatePercent: pr.coldStartRatePercent,
              slaViolationRatePercent: pr.slaViolationRatePercent,
              averageOverheadMs: pr.averageOverheadMs,
            }
            policyResults.push(prRecord)
            record.policyResults.push(prRecord)
          }
        }

        experiments.push(record)
        return record
      },
      findMany: async (args: any) => {
        const { where, take } = args || {}
        let filtered = experiments

        if (where) {
          filtered = filtered.filter((e) => {
            if (where.workloadType && e.workloadType !== where.workloadType) return false
            if (where.requestCount && e.requestCount !== where.requestCount) return false
            if (where.durationMinutes && e.durationMinutes !== where.durationMinutes) return false
            if (where.slaLatencyThresholdMs && e.slaLatencyThresholdMs !== where.slaLatencyThresholdMs) return false
            if (where.arrivalPattern && e.arrivalPattern !== where.arrivalPattern) return false
            if (where.seed !== undefined && e.seed !== where.seed) return false
            if (where.userId !== undefined && e.userId !== where.userId) return false
            if (where.createdAt?.gte) {
              const expTime = e.createdAt instanceof Date ? e.createdAt.getTime() : new Date(e.createdAt).getTime()
              if (expTime < where.createdAt.gte.getTime()) return false
            }
            return true
          })
        }

        if (take) {
          filtered = filtered.slice(0, take)
        }

        return filtered.map((e) => ({
          ...e,
          policyResults: policyResults.filter((pr) => pr.experimentId === e.id),
        }))
      },
      findFirst: async (args: any) => {
        const list = await mock.experiment.findMany(args)
        return list.length > 0 ? list[0] : null
      },
      count: async () => experiments.length,
      findUnique: async (args: any) => {
        const found = experiments.find((e) => e.id === args.where.id)
        if (!found) return null
        return {
          ...found,
          policyResults: policyResults.filter((pr) => pr.experimentId === found.id),
        }
      },
      delete: async (args: any) => {
        const idx = experiments.findIndex((e) => e.id === args.where.id)
        if (idx !== -1) experiments.splice(idx, 1)
        return { id: args.where.id }
      },
    },
    policyResult: {
      createMany: async (args: any) => ({ count: args.data.length }),
    },
  }

  return mock as any
}

const samplePolicies: PersistedPolicyResult[] = VALID_POLICIES.map((p) => ({
  policy: p,
  totalRequests: 500,
  averageLatencyMs: 120,
  p95LatencyMs: 180,
  totalCostUSD: 0.02,
  totalCarbonG: 15,
  coldStartRatePercent: 4,
  slaViolationRatePercent: 0.2,
  averageOverheadMs: 0.5,
}))

const sampleAssumptions = {
  prng: 'Mulberry32',
  latencyModel: 'Deterministic',
  costModel: 'Standard',
  carbonModel: 'Marginal',
  coldStartModel: 'Warm-pool',
}

test('Experiment Deduplication: findRecentDuplicateExperiment returns null when no matching experiment exists', async () => {
  const client = createMockPrismaClient()

  const duplicate = await findRecentDuplicateExperiment(
    {
      userId: 'user-1',
      workloadType: 'Medium',
      requestCount: 1000,
      durationMinutes: 30,
      slaLatencyThresholdMs: 400,
      arrivalPattern: 'Poisson',
      seed: 42,
      windowSeconds: 5,
    },
    client
  )

  assert.equal(duplicate, null)
})

test('Experiment Deduplication: Identifies duplicate experiment created within the time window', async () => {
  const client = createMockPrismaClient()

  const saved = await createExperiment(
    {
      name: 'Simulation-Medium-2026-11-08',
      workloadType: 'Medium',
      requestCount: 50000,
      durationMinutes: 30,
      slaLatencyThresholdMs: 400,
      arrivalPattern: 'Poisson',
      seed: 4242,
      userId: 'user-researcher-1',
      isPublic: false,
      weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
      assumptions: sampleAssumptions,
      policyResults: samplePolicies,
    },
    client
  )

  assert.ok(saved.id)

  const duplicate = await findRecentDuplicateExperiment(
    {
      userId: 'user-researcher-1',
      workloadType: 'Medium',
      requestCount: 50000,
      durationMinutes: 30,
      slaLatencyThresholdMs: 400,
      arrivalPattern: 'Poisson',
      seed: 4242,
      windowSeconds: 5,
    },
    client
  )

  assert.ok(duplicate !== null, 'Must detect existing identical experiment')
  assert.equal(duplicate?.id, saved.id, 'Must return the existing experiment ID')
  assert.equal(duplicate?.workloadType, 'Medium')
  assert.equal(duplicate?.requestCount, 50000)
  assert.equal(duplicate?.policyResults.length, 5)
})

test('Phase 13.1 Testing 1: Two concurrent identical requests are serialized by advisory lock and produce exactly one record', async () => {
  const client = createMockPrismaClient()

  const payload = {
    name: 'Concurrent-Simulation',
    workloadType: 'Medium' as const,
    requestCount: 50000,
    durationMinutes: 30,
    slaLatencyThresholdMs: 400,
    arrivalPattern: 'Poisson' as const,
    seed: 4242,
    userId: 'user-concurrent-1',
    isPublic: false,
    weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
    assumptions: sampleAssumptions,
    policyResults: samplePolicies,
  }

  // Fire two concurrent invocations representing simultaneous requests to independent serverless instances
  const [res1, res2] = await Promise.all([
    createExperiment(payload, client),
    createExperiment(payload, client),
  ])

  // Both requests must return the identical experiment record
  assert.equal(res1.id, res2.id, 'Both concurrent requests must return the same experiment ID')
  assert.equal(client._experiments.length, 1, 'Exactly one experiment row must be inserted into PostgreSQL')
  assert.equal(client._acquiredLocks.length, 2, 'Both transactions must have acquired the advisory lock in sequence')
})

test('Phase 13.1 Testing 2: Different users submitting identical workloads remain isolated and create separate records', async () => {
  const client = createMockPrismaClient()

  const sharedWorkload = {
    workloadType: 'Medium' as const,
    requestCount: 50000,
    durationMinutes: 30,
    slaLatencyThresholdMs: 400,
    arrivalPattern: 'Poisson' as const,
    seed: 4242,
    isPublic: false,
    weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
    assumptions: sampleAssumptions,
    policyResults: samplePolicies,
  }

  // Concurrent submission from User A and User B with identical workload parameters
  const [expA, expB] = await Promise.all([
    createExperiment({ ...sharedWorkload, name: 'User A Sim', userId: 'user-alpha' }, client),
    createExperiment({ ...sharedWorkload, name: 'User B Sim', userId: 'user-beta' }, client),
  ])

  assert.notEqual(expA.id, expB.id, 'User A and User B must receive distinct experiment records')
  assert.equal(expA.userId, 'user-alpha')
  assert.equal(expB.userId, 'user-beta')
  assert.equal(client._experiments.length, 2, 'Both user experiments must be persisted independently')

  // Verify distinct lock keys were used
  const lockKeyA = generateExperimentLockKey({ userId: 'user-alpha', ...sharedWorkload })
  const lockKeyB = generateExperimentLockKey({ userId: 'user-beta', ...sharedWorkload })
  assert.notEqual(lockKeyA, lockKeyB, 'Lock keys must incorporate userId for multi-user isolation')
})

test('Phase 13.1 Testing 3: Different simulation parameters produce distinct experiments', async () => {
  const client = createMockPrismaClient()

  const baseInput = {
    name: 'Parameter-Sim',
    workloadType: 'Medium' as const,
    requestCount: 50000,
    durationMinutes: 30,
    slaLatencyThresholdMs: 400,
    arrivalPattern: 'Poisson' as const,
    seed: 4242,
    userId: 'researcher-1',
    isPublic: false,
    weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
    assumptions: sampleAssumptions,
    policyResults: samplePolicies,
  }

  const exp1 = await createExperiment(baseInput, client)

  // Different request count
  const exp2 = await createExperiment({ ...baseInput, requestCount: 100000 }, client)

  // Different SLA threshold
  const exp3 = await createExperiment({ ...baseInput, slaLatencyThresholdMs: 250 }, client)

  // Different seed
  const exp4 = await createExperiment({ ...baseInput, seed: 9999 }, client)

  assert.equal(client._experiments.length, 4, 'All four distinct configurations must be persisted')
  assert.notEqual(exp1.id, exp2.id)
  assert.notEqual(exp1.id, exp3.id)
  assert.notEqual(exp1.id, exp4.id)
})

test('Phase 13.1 Testing 4: Existing duplicate returned without another insert inside advisory lock', async () => {
  const client = createMockPrismaClient()

  const input = {
    name: 'Sequential-Duplicate-Test',
    workloadType: 'Low' as const,
    requestCount: 10000,
    durationMinutes: 15,
    slaLatencyThresholdMs: 300,
    arrivalPattern: 'Steady' as const,
    seed: 777,
    userId: 'user-seq-1',
    isPublic: false,
    weights: { alpha: 0.25, beta: 0.25, gamma: 0.25, delta: 0.25 },
    assumptions: sampleAssumptions,
    policyResults: samplePolicies,
  }

  // First call inserts
  const first = await createExperiment(input, client)
  assert.equal(client._experiments.length, 1)

  // Second call within 5 seconds must return the existing record without inserting
  const second = await createExperiment(input, client)
  assert.equal(second.id, first.id, 'Must return the existing experiment record')
  assert.equal(client._experiments.length, 1, 'Database must still contain only 1 experiment row')
})

test('Phase 13.1 Testing 5: Lock failure handling throws database error and prevents uncommitted insert', async () => {
  const client = createMockPrismaClient({ failQueryRaw: true })

  const input = {
    name: 'Lock-Failure-Test',
    workloadType: 'High' as const,
    requestCount: 20000,
    durationMinutes: 20,
    slaLatencyThresholdMs: 500,
    arrivalPattern: 'Bursty' as const,
    seed: 1234,
    userId: 'user-lock-fail',
    isPublic: false,
    weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
    assumptions: sampleAssumptions,
    policyResults: samplePolicies,
  }

  // When locking fails in production, createExperiment must reject and not silently fall back to unlocked insert
  await assert.rejects(
    () => createExperiment(input, client),
    (err: any) => {
      assert.ok(err instanceof DatabaseError || err instanceof Error)
      return true
    }
  )

  assert.equal(client._experiments.length, 0, 'No experiment must be inserted if lock acquisition fails')
})

test('Phase 13.1 Testing 6: Transaction rollback and lock release on error', async () => {
  const client = createMockPrismaClient({ failInsert: true })

  const input = {
    name: 'Rollback-Test',
    workloadType: 'High' as const,
    requestCount: 20000,
    durationMinutes: 20,
    slaLatencyThresholdMs: 500,
    arrivalPattern: 'Bursty' as const,
    seed: 5555,
    userId: 'user-rollback',
    isPublic: false,
    weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
    assumptions: sampleAssumptions,
    policyResults: samplePolicies,
  }

  await assert.rejects(
    () => createExperiment(input, client),
    (err: any) => {
      assert.ok(err instanceof DatabaseError || err instanceof Error)
      return true
    }
  )

  // Verify that the transaction lock was released upon failure
  assert.equal(client._activeLocks.size, 0, 'All active locks must be released after rollback')
  assert.equal(client._releasedLocks.length, 1, 'Transaction-scoped lock must be recorded as released')
  assert.equal(client._experiments.length, 0, 'Rolled back transaction must leave no experiment rows')
})
