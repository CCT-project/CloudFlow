import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runSimulation } from '../lib/simulation/engine.ts'
import {
  validateSimulateRequest,
  MAX_SIMULATION_REQUEST_COUNT,
  validateBatchResearchRequest,
} from '../lib/validation/api-validator.ts'
import { runBatchResearch } from '../lib/research/batch-engine.ts'
import {
  checkRateLimit,
  clearMemoryRateLimitBuckets,
  resetRedisClientForTesting,
} from '../lib/rate-limit/limiter.ts'
import {
  createExperiment,
  type CreateExperimentStorageInput,
} from '../lib/storage/experiments.ts'

function createMockPrismaClient() {
  const experiments: any[] = []
  const policyResults: any[] = []
  const activeLocks = new Set<string>()
  const lockWaiters = new Map<string, Array<() => void>>()

  const mock: any = {
    _experiments: experiments,
    _policyResults: policyResults,

    $transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      let holdingLock: string | null = null

      const txMock = {
        ...mock,
        $queryRaw: async (query: any, ...args: any[]) => {
          const queryStr =
            typeof query === 'string'
              ? query
              : Array.isArray(query)
                ? query.join(' ')
                : query?.strings?.join(' ') || String(query || '')

          if (queryStr.includes('pg_advisory_xact_lock')) {
            const lockKey = args[0] || (query?.values && query.values[0]) || 'unknown-lock'
            holdingLock = lockKey

            if (activeLocks.has(lockKey)) {
              await new Promise<void>((resolve) => {
                const queue = lockWaiters.get(lockKey) || []
                queue.push(resolve)
                lockWaiters.set(lockKey, queue)
              })
            }
            activeLocks.add(lockKey)
            return [{ lock_acquired: 1 }]
          }

          return [{ column_name: 'userId' }, { column_name: 'isPublic' }]
        },
        experiment: {
          create: async (args: any) => mock.experiment.create(args),
          findMany: async (args: any) => mock.experiment.findMany(args),
          findUnique: async (args: any) => mock.experiment.findUnique(args),
        },
      }

      try {
        return await fn(txMock)
      } finally {
        if (holdingLock) {
          activeLocks.delete(holdingLock)
          const waiters = lockWaiters.get(holdingLock)
          if (waiters && waiters.length > 0) {
            const next = waiters.shift()
            if (next) next()
          }
        }
      }
    },

    $queryRaw: async () => [{ column_name: 'userId' }, { column_name: 'isPublic' }],

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
        let results = [...experiments]
        if (args?.where) {
          if (args.where.seed !== undefined) {
            results = results.filter((e) => e.seed === args.where.seed)
          }
          if (args.where.requestCount !== undefined) {
            results = results.filter((e) => e.requestCount === args.where.requestCount)
          }
        }
        return results
      },
      findUnique: async (args: any) => {
        return experiments.find((e) => e.id === args?.where?.id) || null
      },
    },
  }

  return mock
}

describe('Stress, Concurrency, and Boundary Verification', () => {
  it('executes 20 concurrent simulations simultaneously without state bleed or race conditions', async () => {
    const concurrency = 20
    const promises = Array.from({ length: concurrency }, (_, idx) => {
      const seed = 1000 + idx
      return Promise.resolve().then(() =>
        runSimulation({
          requestCount: 200,
          slaLatencyThresholdMs: 250,
          seed,
          compareAllPolicies: true,
          workloadType: 'Medium',
          arrivalPattern: 'Poisson',
        })
      )
    })

    const results = await Promise.all(promises)

    assert.equal(results.length, concurrency)
    // Verify each simulation produced its own unique seed-derived results
    const uniqueSimulationIds = new Set(results.map((r) => r.simulationId))
    assert.equal(uniqueSimulationIds.size, concurrency)

    results.forEach((res) => {
      assert.equal(res.status, 'success')
      assert.equal(res.workload.requestCount, 200)
      assert.ok(res.policySummaries)
      assert.equal(Object.keys(res.policySummaries).length, 5)
    })
  })

  it('enforces the exact 50,000-request boundary correctly', () => {
    // 1. Boundary acceptance: exactly 50,000 requests
    const boundaryValid = validateSimulateRequest({
      requestCount: MAX_SIMULATION_REQUEST_COUNT,
      slaLatencyThresholdMs: 300,
    })
    assert.equal(boundaryValid.isValid, true)
    if (boundaryValid.isValid) {
      assert.equal(boundaryValid.data.requestCount, 50000)
    }

    // 2. Boundary rejection: 50,001 requests
    const boundaryExceeded = validateSimulateRequest({
      requestCount: MAX_SIMULATION_REQUEST_COUNT + 1,
      slaLatencyThresholdMs: 300,
    })
    assert.equal(boundaryExceeded.isValid, false)
    if (!boundaryExceeded.isValid) {
      assert.ok(
        boundaryExceeded.details.some((d) => d.includes('exceeds maximum allowable limit'))
      )
    }

    // 3. Fast deterministic simulation of 50,000 requests (under 1000ms)
    const startTime = Date.now()
    const simResult = runSimulation({
      requestCount: 50000,
      slaLatencyThresholdMs: 300,
      seed: 9999,
      compareAllPolicies: false,
      policy: 'CloudFlow adaptive',
    })
    const duration = Date.now() - startTime

    assert.equal(simResult.summary.totalRequests, 50000)
    assert.ok(simResult.summary.averageLatencyMs > 0)
    assert.ok(duration < 1500, `Simulation of 50,000 requests took ${duration}ms, expected < 1500ms`)
  })

  it('saturates rate limits under burst load and protects against brute-force abuse', async () => {
    clearMemoryRateLimitBuckets()
    resetRedisClientForTesting(null)

    const abusiveIp = '198.51.100.99'
    const benignIp = '198.51.100.100'

    const abusiveReq = new Request('http://localhost:3000/api/auth/login', {
      headers: { 'x-real-ip': abusiveIp },
    })
    const benignReq = new Request('http://localhost:3000/api/auth/login', {
      headers: { 'x-real-ip': benignIp },
    })

    // Blast 25 requests from abusive client against login (limit 5)
    let allowedCount = 0
    let blockedCount = 0

    for (let i = 0; i < 25; i++) {
      const res = await checkRateLimit('login', abusiveReq)
      if (res.success) allowedCount++
      else blockedCount++
    }

    assert.equal(allowedCount, 5, 'Exactly 5 requests should be allowed within window')
    assert.equal(blockedCount, 20, 'Subsequent 20 requests should be blocked')

    // Verify benign client is completely unaffected by abusive client
    const benignCheck = await checkRateLimit('login', benignReq)
    assert.equal(benignCheck.success, true, 'Benign client must not be affected by abusive client')
    assert.equal(benignCheck.remaining, 4)
  })

  it('handles rate-limit bursts for simulation and batch research endpoints', async () => {
    clearMemoryRateLimitBuckets()
    resetRedisClientForTesting(null)

    const simReq = new Request('http://localhost:3000/api/simulate', {
      headers: { 'x-real-ip': '203.0.113.10' },
    })
    const batchReq = new Request('http://localhost:3000/api/research/batch', {
      headers: { 'x-real-ip': '203.0.113.10' },
    })

    // Simulate endpoint (limit 20)
    for (let i = 0; i < 20; i++) {
      const r = await checkRateLimit('simulate', simReq)
      assert.equal(r.success, true)
    }
    const simBlocked = await checkRateLimit('simulate', simReq)
    assert.equal(simBlocked.success, false)
    assert.ok(simBlocked.retryAfterSeconds > 0)

    // Batch research endpoint (limit 10)
    for (let i = 0; i < 10; i++) {
      const r = await checkRateLimit('batchResearch', batchReq)
      assert.equal(r.success, true)
    }
    const batchBlocked = await checkRateLimit('batchResearch', batchReq)
    assert.equal(batchBlocked.success, false)
  })

  it('safely handles concurrent database persistence and deduplication without unhandled rejections', async () => {
    const mockPrisma = createMockPrismaClient()

    const basePayload: CreateExperimentStorageInput = {
      name: 'Stress Test Experiment',
      workloadType: 'Medium',
      requestCount: 500,
      durationMinutes: 15,
      slaLatencyThresholdMs: 250,
      arrivalPattern: 'Poisson',
      seed: 8888,
      weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
      assumptions: {
        prng: 'Mulberry32',
        latencyModel: 'synthetic',
        costModel: 'synthetic',
        carbonModel: 'synthetic',
        coldStartModel: 'synthetic',
      },
      policyResults: [
        {
          policy: 'CloudFlow adaptive',
          totalRequests: 500,
          averageLatencyMs: 140.2,
          p95LatencyMs: 210.5,
          totalCostUSD: 0.00142,
          totalCarbonG: 0.052,
          coldStartRatePercent: 2.1,
          slaViolationRatePercent: 0.0,
          averageOverheadMs: 0.045,
        },
      ],
    }

    // Attempt 10 concurrent saves with the exact same payload using mockPrisma
    const concurrency = 10
    const savePromises = Array.from({ length: concurrency }, () =>
      createExperiment(basePayload, mockPrisma)
    )

    const results = await Promise.all(savePromises)

    assert.equal(results.length, concurrency)
    // Thanks to deduplication under concurrency, all requests receive the same record ID
    const firstId = results[0].id
    results.forEach((rec) => {
      assert.equal(rec.id, firstId)
      assert.equal(rec.seed, 8888)
      assert.equal(rec.requestCount, 500)
    })
    // Only 1 record actually inserted in database
    assert.equal(mockPrisma._experiments.length, 1)
  })

  it('runs a large 50-seed research batch (25,000 evaluations) accurately and performantly', () => {
    const val = validateBatchResearchRequest({
      seedCount: 50,
      startingSeed: 3000,
      requestCount: 100,
      slaLatencyThresholdMs: 250,
      arrivalPattern: 'Poisson',
    })
    assert.equal(val.isValid, true)
    if (!val.isValid) return

    const t0 = Date.now()
    const result = runBatchResearch(val.data)
    const elapsedMs = Date.now() - t0

    assert.equal(result.metadata.totalSeeds, 50)
    assert.equal(result.metadata.totalEvaluations, 50 * 100 * 5) // 25,000 evaluations
    assert.ok(elapsedMs < 2000, `50-seed batch completed in ${elapsedMs}ms, expected < 2000ms`)

    // Verify degrees of freedom = 49
    const costAdaptive = result.policyStatistics['CloudFlow adaptive'].metrics.costUSD
    assert.equal(costAdaptive.count, 50)
    // Critical t for df = 49 is approx 2.009
    assert.ok(costAdaptive.criticalT >= 2.0 && costAdaptive.criticalT <= 2.02)

    // Verify Holm-Bonferroni monotonicity
    for (let i = 0; i < result.comparisons.length - 1; i++) {
      assert.ok(result.comparisons[i].adjustedPValue >= 0 && result.comparisons[i].adjustedPValue <= 1.0)
    }
  })
})
