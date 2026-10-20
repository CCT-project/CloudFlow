import test from 'node:test'
import assert from 'node:assert/strict'
import type {
  CreateExperimentRequestBody,
  ExperimentRecord,
  PersistedPolicyResult,
  PolicyType,
} from '../lib/types/scheduler.ts'
import {
  createExperiment,
  getExperiments,
  getExperimentById,
  deleteExperiment,
  NotFoundError,
  DatabaseUnavailableError,
  DatabaseError,
} from '../lib/storage/experiments.ts'
import {
  validateCreateExperimentRequest,
  validateGetExperimentsQuery,
  VALID_POLICIES,
} from '../lib/validation/api-validator.ts'
import { runSimulation } from '../lib/simulation/engine.ts'

/**
 * Creates an in-memory Prisma client test double for testing storage operations
 * in environments without a running PostgreSQL database.
 */
function createMockPrismaClient() {
  const experiments: any[] = []
  const policyResults: any[] = []

  const mock = {
    _experiments: experiments,
    _policyResults: policyResults,
    $transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      return await fn(mock)
    },
    $queryRaw: async () => [{ '?column?': 1 }],
    experiment: {
      create: async (args: any) => {
        const id = args.data.id || `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const record = {
          id,
          name: args.data.name,
          createdAt: new Date(),
          workloadType: args.data.workloadType,
          requestCount: args.data.requestCount,
          durationMinutes: args.data.durationMinutes,
          slaLatencyThresholdMs: args.data.slaLatencyThresholdMs,
          arrivalPattern: args.data.arrivalPattern,
          seed: args.data.seed,
          weights: args.data.weights,
          assumptions: args.data.assumptions,
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
      count: async () => experiments.length,
      findMany: async (args: any) => {
        const { skip = 0, take = 10, orderBy = { createdAt: 'desc' } } = args
        const sortKey = Object.keys(orderBy)[0] as 'createdAt' | 'name'
        const direction = orderBy[sortKey] === 'asc' ? 1 : -1

        const sorted = [...experiments].sort((a, b) => {
          if (a[sortKey] < b[sortKey]) return -1 * direction
          if (a[sortKey] > b[sortKey]) return 1 * direction
          return 0
        })

        const sliced = sorted.slice(skip, skip + take)
        return sliced.map((exp) => ({
          ...exp,
          policyResults: policyResults.filter((pr) => pr.experimentId === exp.id),
        }))
      },
      findUnique: async (args: any) => {
        const { id } = args.where
        const found = experiments.find((e) => e.id === id)
        if (!found) return null
        return {
          ...found,
          policyResults: policyResults.filter((pr) => pr.experimentId === found.id),
        }
      },
      delete: async (args: any) => {
        const { id } = args.where
        const idx = experiments.findIndex((e) => e.id === id)
        if (idx === -1) {
          const err = new Error('Record not found') as any
          err.code = 'P2025'
          throw err
        }
        const [deleted] = experiments.splice(idx, 1)
        // Cascade delete policy results
        for (let i = policyResults.length - 1; i >= 0; i--) {
          if (policyResults[i].experimentId === id) {
            policyResults.splice(i, 1)
          }
        }
        return deleted
      },
    },
    policyResult: {
      createMany: async (args: any) => {
        for (const pr of args.data) {
          policyResults.push({ id: `pr-${Date.now()}`, ...pr })
        }
        return { count: args.data.length }
      },
    },
  }

  return mock as any
}

const sampleFivePolicyResults: PersistedPolicyResult[] = [
  {
    policy: 'Latency-first',
    totalRequests: 1000,
    averageLatencyMs: 98.4,
    p95LatencyMs: 145.2,
    totalCostUSD: 0.045,
    totalCarbonG: 22.4,
    coldStartRatePercent: 4.2,
    slaViolationRatePercent: 0.1,
    averageOverheadMs: 0.42,
  },
  {
    policy: 'Cost-first',
    totalRequests: 1000,
    averageLatencyMs: 145.2,
    p95LatencyMs: 220.1,
    totalCostUSD: 0.018,
    totalCarbonG: 18.2,
    coldStartRatePercent: 6.5,
    slaViolationRatePercent: 1.2,
    averageOverheadMs: 0.41,
  },
  {
    policy: 'Carbon-first',
    totalRequests: 1000,
    averageLatencyMs: 162.1,
    p95LatencyMs: 245.0,
    totalCostUSD: 0.028,
    totalCarbonG: 11.8,
    coldStartRatePercent: 7.0,
    slaViolationRatePercent: 1.8,
    averageOverheadMs: 0.39,
  },
  {
    policy: 'Default',
    totalRequests: 1000,
    averageLatencyMs: 110.0,
    p95LatencyMs: 180.0,
    totalCostUSD: 0.035,
    totalCarbonG: 20.0,
    coldStartRatePercent: 5.0,
    slaViolationRatePercent: 0.5,
    averageOverheadMs: 0.05,
  },
  {
    policy: 'CloudFlow adaptive',
    totalRequests: 1000,
    averageLatencyMs: 112.5,
    p95LatencyMs: 160.0,
    totalCostUSD: 0.022,
    totalCarbonG: 14.2,
    coldStartRatePercent: 3.8,
    slaViolationRatePercent: 0.2,
    averageOverheadMs: 0.85,
  },
]

test('Storage: Creates experiment transactionally and stores all five policies', async () => {
  const mockClient = createMockPrismaClient()
  const experiment = await createExperiment(
    {
      name: 'Benchmark-Run-1',
      workloadType: 'Medium',
      requestCount: 1000,
      durationMinutes: 30,
      slaLatencyThresholdMs: 400,
      arrivalPattern: 'Poisson',
      seed: 4242,
      weights: { alpha: 0.35, beta: 0.25, gamma: 0.3, delta: 0.1 },
      assumptions: {
        prng: 'Mulberry32',
        latencyModel: 'Deterministic jitter',
        costModel: 'Tiered serverless execution duration',
        carbonModel: 'Marginal regional grid carbon intensity',
        coldStartModel: '15-minute container warm-pool window',
        adaptivePolicyModel: 'SLA-feasibility dominance + min-max normalized weighted sum',
      },
      policyResults: sampleFivePolicyResults,
    },
    mockClient
  )

  assert.ok(experiment.id, 'Expected generated experiment ID')
  assert.equal(experiment.name, 'Benchmark-Run-1')
  assert.equal(experiment.policyResults.length, 5, 'Must persist exactly 5 policy results')

  const storedPolicies = experiment.policyResults.map((p) => p.policy).sort()
  const expectedPolicies = [...VALID_POLICIES].sort()
  assert.deepEqual(storedPolicies, expectedPolicies, 'Must match all 5 valid policy types')
})

test('Storage: Retrieves experiment by ID', async () => {
  const mockClient = createMockPrismaClient()
  const created = await createExperiment(
    {
      name: 'Test-Retrieve',
      workloadType: 'Bursty',
      requestCount: 500,
      durationMinutes: 15,
      slaLatencyThresholdMs: 300,
      arrivalPattern: 'Bursty',
      seed: 999,
      weights: { alpha: 0.25, beta: 0.25, gamma: 0.25, delta: 0.25 },
      assumptions: {
        prng: 'Mulberry32',
        latencyModel: 'Model',
        costModel: 'Model',
        carbonModel: 'Model',
        coldStartModel: 'Model',
      },
      policyResults: sampleFivePolicyResults,
    },
    mockClient
  )

  const retrieved = await getExperimentById(created.id, mockClient)
  assert.equal(retrieved.id, created.id)
  assert.equal(retrieved.workloadType, 'Bursty')
  assert.equal(retrieved.slaLatencyThresholdMs, 300)
  assert.equal(retrieved.policyResults.length, 5)
})

test('Storage: Throws NotFoundError when experiment ID does not exist', async () => {
  const mockClient = createMockPrismaClient()
  await assert.rejects(
    async () => {
      await getExperimentById('non-existent-id', mockClient)
    },
    (err: any) => {
      return err instanceof NotFoundError && err.code === 'EXPERIMENT_NOT_FOUND'
    }
  )
})

test('Storage: Pagination and sorting support', async () => {
  const mockClient = createMockPrismaClient()

  // Create 3 experiments with distinct names
  for (let i = 1; i <= 3; i++) {
    await createExperiment(
      {
        name: `Experiment-0${i}`,
        workloadType: 'Low',
        requestCount: i * 100,
        durationMinutes: 10,
        slaLatencyThresholdMs: 250,
        arrivalPattern: 'Steady',
        seed: i,
        weights: { alpha: 0.3, beta: 0.3, gamma: 0.3, delta: 0.1 },
        assumptions: {
          prng: 'Mulberry32',
          latencyModel: 'Model',
          costModel: 'Model',
          carbonModel: 'Model',
          coldStartModel: 'Model',
        },
        policyResults: sampleFivePolicyResults,
      },
      mockClient
    )
  }

  // Page 1, limit 2
  const page1 = await getExperiments({ page: 1, limit: 2, sortBy: 'name', order: 'asc' }, mockClient)
  assert.equal(page1.total, 3)
  assert.equal(page1.totalPages, 2)
  assert.equal(page1.experiments.length, 2)
  assert.equal(page1.experiments[0].name, 'Experiment-01')
  assert.equal(page1.experiments[1].name, 'Experiment-02')

  // Page 2, limit 2
  const page2 = await getExperiments({ page: 2, limit: 2, sortBy: 'name', order: 'asc' }, mockClient)
  assert.equal(page2.experiments.length, 1)
  assert.equal(page2.experiments[0].name, 'Experiment-03')
})

test('Storage: Deletion cascades and removes policy results', async () => {
  const mockClient = createMockPrismaClient()
  const created = await createExperiment(
    {
      name: 'To-Delete',
      workloadType: 'High',
      requestCount: 2000,
      durationMinutes: 60,
      slaLatencyThresholdMs: 500,
      arrivalPattern: 'Poisson',
      seed: 1234,
      weights: { alpha: 0.25, beta: 0.25, gamma: 0.25, delta: 0.25 },
      assumptions: {
        prng: 'Mulberry32',
        latencyModel: 'Model',
        costModel: 'Model',
        carbonModel: 'Model',
        coldStartModel: 'Model',
      },
      policyResults: sampleFivePolicyResults,
    },
    mockClient
  )

  assert.equal(mockClient._policyResults.length, 5)

  const delResult = await deleteExperiment(created.id, mockClient)
  assert.equal(delResult.deleted, true)
  assert.equal(mockClient._experiments.length, 0)
  assert.equal(mockClient._policyResults.length, 0, 'Cascading deletion must remove associated policy results')

  // Subsequent get should throw NotFoundError
  await assert.rejects(async () => {
    await getExperimentById(created.id, mockClient)
  }, NotFoundError)
})

test('Storage: Empty experiment history returns 0 count cleanly', async () => {
  const mockClient = createMockPrismaClient()
  const res = await getExperiments({}, mockClient)
  assert.equal(res.total, 0)
  assert.equal(res.experiments.length, 0)
  assert.equal(res.page, 1)
  assert.equal(res.totalPages, 1)
})

test('Storage: Database connection errors throw safe typed error', async () => {
  const brokenClient = {
    $transaction: async () => {
      const err = new Error('Can not reach database server at localhost:5432') as any
      err.code = 'P1001'
      throw err
    },
  } as any

  await assert.rejects(
    async () => {
      await createExperiment(
        {
          name: 'Fail-Run',
          workloadType: 'Low',
          requestCount: 100,
          durationMinutes: 5,
          slaLatencyThresholdMs: 300,
          arrivalPattern: 'Steady',
          seed: 1,
          weights: { alpha: 0.25, beta: 0.25, gamma: 0.25, delta: 0.25 },
          assumptions: {
            prng: 'Mulberry32',
            latencyModel: 'Model',
            costModel: 'Model',
            carbonModel: 'Model',
            coldStartModel: 'Model',
          },
          policyResults: sampleFivePolicyResults,
        },
        brokenClient
      )
    },
    (err: any) => {
      assert.ok(err instanceof DatabaseUnavailableError)
      assert.equal(err.code, 'DATABASE_UNAVAILABLE')
      return true
    }
  )
})

test('Validation: Rejects invalid experiment payloads', () => {
  // Empty payload
  const emptyRes = validateCreateExperimentRequest({})
  assert.equal(emptyRes.isValid, false)

  // Empty name
  const emptyName = validateCreateExperimentRequest({
    name: '   ',
    requestCount: 100,
    slaLatencyThresholdMs: 400,
    policyResults: sampleFivePolicyResults,
  })
  assert.equal(emptyName.isValid, false)

  // Negative request count
  const negReq = validateCreateExperimentRequest({
    name: 'Test',
    requestCount: -10,
    slaLatencyThresholdMs: 400,
    policyResults: sampleFivePolicyResults,
  })
  assert.equal(negReq.isValid, false)

  // Invalid policy name in results
  const invalidPolicy = validateCreateExperimentRequest({
    name: 'Test',
    requestCount: 100,
    slaLatencyThresholdMs: 400,
    policyResults: [
      {
        policy: 'NonExistentPolicy',
        totalRequests: 100,
        averageLatencyMs: 100,
        p95LatencyMs: 150,
        totalCostUSD: 0.01,
        totalCarbonG: 10,
        coldStartRatePercent: 5,
        slaViolationRatePercent: 1,
      },
    ],
  })
  assert.equal(invalidPolicy.isValid, false)
})

test('Validation: Query parameters for experiment listing', () => {
  // Valid params
  const valid = validateGetExperimentsQuery(new URLSearchParams('page=2&limit=25&sortBy=name&order=asc'))
  assert.equal(valid.isValid, true)
  if (valid.isValid) {
    assert.equal(valid.data.page, 2)
    assert.equal(valid.data.limit, 25)
    assert.equal(valid.data.sortBy, 'name')
    assert.equal(valid.data.order, 'asc')
  }

  // Invalid page
  const invalidPage = validateGetExperimentsQuery(new URLSearchParams('page=0'))
  assert.equal(invalidPage.isValid, false)

  // Limit exceeding 100
  const overLimit = validateGetExperimentsQuery(new URLSearchParams('limit=500'))
  assert.equal(overLimit.isValid, false)
})

test('Simulation Integration: Simulates all 5 policies over identical trace for persistence', () => {
  const result = runSimulation({
    requestCount: 100,
    durationMinutes: 10,
    slaLatencyThresholdMs: 350,
    arrivalPattern: 'Poisson',
    seed: 555,
    compareAllPolicies: true,
  })

  assert.ok(result.policySummaries)
  for (const pol of VALID_POLICIES) {
    const policySum: any = (result.policySummaries as any)[pol]
    assert.ok(policySum, `Summary for policy ${pol} must be present`)
    assert.equal(policySum.totalRequests, 100)
    assert.ok(Number.isFinite(policySum.averageLatencyMs))
    assert.ok(Number.isFinite(policySum.p95LatencyMs))
    assert.ok(Number.isFinite(policySum.totalCostUSD))
    assert.ok(Number.isFinite(policySum.totalCarbonG))
  }
})
