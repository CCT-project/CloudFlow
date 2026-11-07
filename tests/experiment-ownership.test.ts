import test from 'node:test'
import assert from 'node:assert/strict'
import type {
  PersistedPolicyResult,
  ExperimentRecord,
} from '../lib/types/scheduler.ts'
import {
  createExperiment,
  getExperiments,
  getExperimentById,
  deleteExperiment,
  NotFoundError,
  ForbiddenError,
} from '../lib/storage/experiments.ts'
import { VALID_POLICIES } from '../lib/validation/api-validator.ts'

function createMockPrismaClient() {
  const experiments: any[] = []
  const policyResults: any[] = []

  const mock = {
    _experiments: experiments,
    _policyResults: policyResults,
    $transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      return await fn(mock)
    },
    $queryRaw: async (query: any) => {
      // Simulate that the ownership columns (userId, isPublic) are present in the table schema
      return [{ column_name: 'userId' }, { column_name: 'isPublic' }]
    },
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
      count: async (args?: any) => {
        if (args?.where) {
          return filterRecords(experiments, args.where).length
        }
        return experiments.length
      },
      findMany: async (args: any) => {
        const { skip = 0, take = 10, orderBy = { createdAt: 'desc' } } = args
        const sortKey = Object.keys(orderBy)[0] as 'createdAt' | 'name'
        const direction = orderBy[sortKey] === 'asc' ? 1 : -1

        let filtered = filterRecords(experiments, args.where)

        const sorted = [...filtered].sort((a, b) => {
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

function filterRecords(experiments: any[], where?: any): any[] {
  if (!where) return experiments

  if (where.userId !== undefined && !where.OR) {
    return experiments.filter((e) => e.userId === where.userId)
  }

  if (where.OR) {
    return experiments.filter((e) => {
      return where.OR.some((cond: any) => {
        if (cond.userId !== undefined && cond.userId === e.userId) return true
        if (cond.isPublic === true && e.isPublic === true) return true
        if (cond.userId === null && (e.userId === null || e.userId === undefined)) return true
        return false
      })
    })
  }

  return experiments
}

const samplePolicyResults: PersistedPolicyResult[] = VALID_POLICIES.map((policy) => ({
  policy,
  totalRequests: 500,
  averageLatencyMs: 85,
  p95LatencyMs: 140,
  totalCostUSD: 0.0045,
  totalCarbonG: 1.25,
  coldStartRatePercent: 4.0,
  slaViolationRatePercent: 0.5,
  averageOverheadMs: 0.05,
}))

test('Multi-User Ownership: User A and User B create experiments with verified userId', async () => {
  const client = createMockPrismaClient()

  const expA = await createExperiment(
    {
      name: 'User A Experiment',
      workloadType: 'Medium',
      requestCount: 500,
      durationMinutes: 20,
      slaLatencyThresholdMs: 300,
      arrivalPattern: 'Steady',
      seed: 101,
      userId: 'user-a-uuid',
      isPublic: false,
      weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
      assumptions: {
        prng: 'Mulberry32',
        latencyModel: 'Deterministic',
        costModel: 'Standard',
        carbonModel: 'Marginal',
        coldStartModel: 'Warm-pool',
      },
      policyResults: samplePolicyResults,
    },
    client
  )

  const expB = await createExperiment(
    {
      name: 'User B Experiment',
      workloadType: 'Bursty',
      requestCount: 1000,
      durationMinutes: 30,
      slaLatencyThresholdMs: 250,
      arrivalPattern: 'Bursty',
      seed: 202,
      userId: 'user-b-uuid',
      isPublic: false,
      weights: { alpha: 0.25, beta: 0.25, gamma: 0.25, delta: 0.25 },
      assumptions: {
        prng: 'Mulberry32',
        latencyModel: 'Deterministic',
        costModel: 'Standard',
        carbonModel: 'Marginal',
        coldStartModel: 'Warm-pool',
      },
      policyResults: samplePolicyResults,
    },
    client
  )

  assert.equal(expA.userId, 'user-a-uuid')
  assert.equal(expA.isPublic, false)
  assert.equal(expB.userId, 'user-b-uuid')
  assert.equal(expB.isPublic, false)
})

test('Multi-User Ownership: User A cannot retrieve User B private experiment (403 Forbidden)', async () => {
  const client = createMockPrismaClient()

  const expB = await createExperiment(
    {
      name: 'User B Private Research',
      workloadType: 'High',
      requestCount: 2000,
      durationMinutes: 45,
      slaLatencyThresholdMs: 200,
      arrivalPattern: 'Poisson',
      seed: 303,
      userId: 'user-b-uuid',
      isPublic: false,
      weights: { alpha: 0.3, beta: 0.3, gamma: 0.3, delta: 0.1 },
      assumptions: {
        prng: 'Mulberry32',
        latencyModel: 'Deterministic',
        costModel: 'Standard',
        carbonModel: 'Marginal',
        coldStartModel: 'Warm-pool',
      },
      policyResults: samplePolicyResults,
    },
    client
  )

  // User B can retrieve their own experiment
  const ownExp = await getExperimentById(expB.id, 'user-b-uuid', client)
  assert.equal(ownExp.id, expB.id)

  // User A attempting to retrieve User B's experiment throws ForbiddenError
  await assert.rejects(
    async () => {
      await getExperimentById(expB.id, 'user-a-uuid', client)
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError, 'Must throw ForbiddenError')
      assert.equal(err.code, 'FORBIDDEN')
      return true
    }
  )

  // Unauthenticated retrieval also throws ForbiddenError
  await assert.rejects(
    async () => {
      await getExperimentById(expB.id, undefined, client)
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError, 'Must throw ForbiddenError for unauthenticated access')
      return true
    }
  )
})

test('Multi-User Ownership: User A cannot delete User B private experiment', async () => {
  const client = createMockPrismaClient()

  const expB = await createExperiment(
    {
      name: 'User B Protected Experiment',
      workloadType: 'Medium',
      requestCount: 500,
      durationMinutes: 15,
      slaLatencyThresholdMs: 300,
      arrivalPattern: 'Steady',
      seed: 404,
      userId: 'user-b-uuid',
      isPublic: false,
      weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
      assumptions: {
        prng: 'Mulberry32',
        latencyModel: 'Deterministic',
        costModel: 'Standard',
        carbonModel: 'Marginal',
        coldStartModel: 'Warm-pool',
      },
      policyResults: samplePolicyResults,
    },
    client
  )

  // User A attempting to delete User B's experiment must fail with 403 Forbidden
  await assert.rejects(
    async () => {
      await deleteExperiment(expB.id, 'user-a-uuid', client)
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError, 'Must reject unauthorized deletion')
      assert.equal(err.code, 'FORBIDDEN')
      return true
    }
  )

  // Verify the experiment was NOT deleted and remains intact
  const stillExists = await getExperimentById(expB.id, 'user-b-uuid', client)
  assert.equal(stillExists.id, expB.id)

  // User B can delete their own experiment
  const deleteResult = await deleteExperiment(expB.id, 'user-b-uuid', client)
  assert.equal(deleteResult.deleted, true)

  // Subsequent get should throw NotFoundError
  await assert.rejects(async () => {
    await getExperimentById(expB.id, 'user-b-uuid', client)
  }, NotFoundError)
})

test('Multi-User Ownership: Public benchmark experiment can be viewed by all users but only deleted by owner', async () => {
  const client = createMockPrismaClient()

  const publicBenchmark = await createExperiment(
    {
      name: 'Public Community Baseline Benchmark',
      workloadType: 'High',
      requestCount: 5000,
      durationMinutes: 60,
      slaLatencyThresholdMs: 200,
      arrivalPattern: 'Bursty',
      seed: 777,
      userId: 'user-a-uuid',
      isPublic: true, // Shared benchmark
      weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
      assumptions: {
        prng: 'Mulberry32',
        latencyModel: 'Deterministic',
        costModel: 'Standard',
        carbonModel: 'Marginal',
        coldStartModel: 'Warm-pool',
      },
      policyResults: samplePolicyResults,
    },
    client
  )

  // User B can view User A's public benchmark
  const viewedByB = await getExperimentById(publicBenchmark.id, 'user-b-uuid', client)
  assert.equal(viewedByB.id, publicBenchmark.id)
  assert.equal(viewedByB.isPublic, true)

  // Unauthenticated caller can also view public benchmark
  const viewedUnauth = await getExperimentById(publicBenchmark.id, undefined, client)
  assert.equal(viewedUnauth.id, publicBenchmark.id)

  // Non-owner User B cannot delete User A's public benchmark
  await assert.rejects(
    async () => {
      await deleteExperiment(publicBenchmark.id, 'user-b-uuid', client)
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError, 'Non-owner cannot delete public benchmark')
      return true
    }
  )

  // Owner User A can delete their public benchmark
  const deleted = await deleteExperiment(publicBenchmark.id, 'user-a-uuid', client)
  assert.equal(deleted.deleted, true)
})

test('Multi-User Ownership: Preserves existing legacy experiments with userId=null', async () => {
  const client = createMockPrismaClient()

  // Simulate an experiment record that existed before the user migration (userId = null)
  const legacyExp = await client.experiment.create({
    data: {
      name: 'Legacy Baseline Run Before Auth',
      workloadType: 'Low',
      requestCount: 100,
      durationMinutes: 10,
      slaLatencyThresholdMs: 400,
      arrivalPattern: 'Steady',
      seed: 123,
      userId: null, // Legacy record without user association
      isPublic: false,
      weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
      assumptions: { prng: 'Mulberry32' },
      policyResults: { create: [] },
    },
  })

  // User A can view the legacy baseline experiment (preserved as baseline)
  const viewedByA = await getExperimentById(legacyExp.id, 'user-a-uuid', client)
  assert.equal(viewedByA.id, legacyExp.id)
  assert.equal(viewedByA.userId, null, 'Legacy record must keep null userId without silent reassignment')

  // Standard user cannot delete legacy baseline experiments
  await assert.rejects(
    async () => {
      await deleteExperiment(legacyExp.id, 'user-a-uuid', client)
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError, 'Standard users cannot delete system/legacy baseline experiments')
      return true
    }
  )
})

test('Multi-User Ownership: getExperiments isolates list view by user and includes public benchmarks', async () => {
  const client = createMockPrismaClient()

  // Create User A private
  await createExperiment(
    {
      name: 'User A Private #1',
      workloadType: 'Low',
      requestCount: 100,
      durationMinutes: 10,
      slaLatencyThresholdMs: 300,
      arrivalPattern: 'Steady',
      seed: 1,
      userId: 'user-a-uuid',
      isPublic: false,
      weights: { alpha: 0.25, beta: 0.25, gamma: 0.25, delta: 0.25 },
      assumptions: { prng: 'Mulberry32', latencyModel: 'M', costModel: 'M', carbonModel: 'M', coldStartModel: 'M' },
      policyResults: samplePolicyResults,
    },
    client
  )

  // Create User B private
  await createExperiment(
    {
      name: 'User B Private #1',
      workloadType: 'Low',
      requestCount: 100,
      durationMinutes: 10,
      slaLatencyThresholdMs: 300,
      arrivalPattern: 'Steady',
      seed: 2,
      userId: 'user-b-uuid',
      isPublic: false,
      weights: { alpha: 0.25, beta: 0.25, gamma: 0.25, delta: 0.25 },
      assumptions: { prng: 'Mulberry32', latencyModel: 'M', costModel: 'M', carbonModel: 'M', coldStartModel: 'M' },
      policyResults: samplePolicyResults,
    },
    client
  )

  // Create Public benchmark
  await createExperiment(
    {
      name: 'Public Shared Benchmark',
      workloadType: 'Low',
      requestCount: 100,
      durationMinutes: 10,
      slaLatencyThresholdMs: 300,
      arrivalPattern: 'Steady',
      seed: 3,
      userId: 'user-b-uuid',
      isPublic: true,
      weights: { alpha: 0.25, beta: 0.25, gamma: 0.25, delta: 0.25 },
      assumptions: { prng: 'Mulberry32', latencyModel: 'M', costModel: 'M', carbonModel: 'M', coldStartModel: 'M' },
      policyResults: samplePolicyResults,
    },
    client
  )

  // User A listing all accessible experiments
  const listForA = await getExperiments({ userId: 'user-a-uuid' }, client)
  assert.equal(listForA.total, 2, 'User A should see their private exp + public benchmark, but NOT User B private')
  const namesForA = listForA.experiments.map((e) => e.name)
  assert.ok(namesForA.includes('User A Private #1'))
  assert.ok(namesForA.includes('Public Shared Benchmark'))
  assert.ok(!namesForA.includes('User B Private #1'), 'Must not leak User B private experiment')

  // User A listing strictly their own (scope=mine)
  const onlyMineA = await getExperiments({ userId: 'user-a-uuid', includePublic: false }, client)
  assert.equal(onlyMineA.total, 1)
  assert.equal(onlyMineA.experiments[0].name, 'User A Private #1')
})
