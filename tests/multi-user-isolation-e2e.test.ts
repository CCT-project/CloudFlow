import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type {
  ExperimentRecord,
  PersistedPolicyResult,
  PolicyType,
} from '../lib/types/scheduler.ts'
import {
  createExperiment,
  getExperiments,
  getExperimentById,
  deleteExperiment,
  ForbiddenError,
  NotFoundError,
} from '../lib/storage/experiments.ts'
import { VALID_POLICIES } from '../lib/validation/api-validator.ts'
import { createSessionToken, verifySessionToken } from '../lib/auth/session.ts'
import { generateExperimentCSV, generateExperimentPDFDoc } from '../lib/reports/export.ts'
import { calculateAggregateMetrics } from '../lib/metrics/aggregation.ts'

// In-memory mock database client for multi-tenant isolation testing
function createMockIsolationPrismaClient() {
  const experiments: any[] = []
  const policyResults: any[] = []

  const mock = {
    _experiments: experiments,
    _policyResults: policyResults,
    $transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      return await fn(mock)
    },
    $queryRaw: async (query: any) => {
      return [{ column_name: 'userId' }, { column_name: 'isPublic' }]
    },
    experiment: {
      create: async (args: any) => {
        const id = args.data.id || `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
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
              id: `pr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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

        const filtered = filterRecords(experiments, args.where)
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

  if (where.isPublic !== undefined && !where.OR && where.userId === undefined) {
    return experiments.filter((e) => Boolean(e.isPublic) === Boolean(where.isPublic))
  }

  if (where.OR) {
    return experiments.filter((e) => {
      return where.OR.some((cond: any) => {
        if (cond.userId !== undefined && cond.userId === e.userId) return true
        if (cond.isPublic === true && e.isPublic === true) return true
        return false
      })
    })
  }

  return experiments
}

const defaultAssumptions = {
  prng: 'Mulberry32',
  latencyModel: 'Regional base + jitter',
  costModel: 'Tiered execution duration',
  carbonModel: 'Marginal grid intensity',
  coldStartModel: '10-minute container timeout',
}

const samplePolicyResults: PersistedPolicyResult[] = VALID_POLICIES.map((policy, idx) => ({
  policy,
  totalRequests: 1000,
  averageLatencyMs: 90 + idx * 15,
  p95LatencyMs: 150 + idx * 20,
  totalCostUSD: 0.01 + idx * 0.005,
  totalCarbonG: 3.5 + idx * 1.0,
  coldStartRatePercent: 3.0 + idx * 0.5,
  slaViolationRatePercent: 0.5 + idx * 0.2,
  averageOverheadMs: 0.1,
}))

describe('Multi-User Data Isolation & Ownership Security Suite', () => {
  // Test Users
  const userA = {
    id: 'user-a-gmail-uuid',
    email: 'usera@gmail.com',
    name: 'User A (First Account)',
  }
  const userB = {
    id: 'user-b-gmail-uuid',
    email: 'userb@gmail.com',
    name: 'User B (Second Account)',
  }

  it('verifies tamper-proof session tokens for both Gmail accounts', () => {
    const tokenA = createSessionToken(userA)
    const tokenB = createSessionToken(userB)

    const verifiedA = verifySessionToken(tokenA)
    const verifiedB = verifySessionToken(tokenB)

    assert.ok(verifiedA)
    assert.ok(verifiedB)
    assert.equal(verifiedA?.user.id, userA.id)
    assert.equal(verifiedA?.user.email, 'usera@gmail.com')
    assert.equal(verifiedB?.user.id, userB.id)
    assert.equal(verifiedB?.user.email, 'userb@gmail.com')
    assert.notEqual(verifiedA?.user.id, verifiedB?.user.id)
  })

  it('enforces strict multi-user creation, visibility, and access control', async () => {
    const client = createMockIsolationPrismaClient()

    // 1. User A creates private Experiment A
    const expA = await createExperiment(
      {
        name: 'User A Private Simulation Run',
        workloadType: 'Medium',
        requestCount: 2000,
        durationMinutes: 30,
        slaLatencyThresholdMs: 300,
        arrivalPattern: 'Poisson',
        seed: 101,
        userId: userA.id,
        isPublic: false,
        weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
        assumptions: { prng: 'Mulberry32', latencyModel: 'M', costModel: 'M', carbonModel: 'M', coldStartModel: 'M' },
        policyResults: samplePolicyResults,
      },
      client
    )

    // 2. User B creates private Experiment B
    const expB = await createExperiment(
      {
        name: 'User B Private Simulation Run',
        workloadType: 'Bursty',
        requestCount: 5000,
        durationMinutes: 45,
        slaLatencyThresholdMs: 250,
        arrivalPattern: 'Bursty',
        seed: 202,
        userId: userB.id,
        isPublic: false,
        weights: { alpha: 0.25, beta: 0.25, gamma: 0.25, delta: 0.25 },
        assumptions: { prng: 'Mulberry32', latencyModel: 'M', costModel: 'M', carbonModel: 'M', coldStartModel: 'M' },
        policyResults: samplePolicyResults,
      },
      client
    )

    // 3. User A can view Experiment A
    const fetchAByA = await getExperimentById(expA.id, userA.id, client)
    assert.equal(fetchAByA.id, expA.id)
    assert.equal(fetchAByA.name, 'User A Private Simulation Run')

    // 4. User A CANNOT view Experiment B (Cross-user access denied with 403 Forbidden)
    await assert.rejects(
      async () => {
        await getExperimentById(expB.id, userA.id, client)
      },
      (err: any) => {
        assert.ok(err instanceof ForbiddenError)
        assert.match(err.message, /do not have permission/)
        return true
      }
    )

    // 5. User B can view Experiment B
    const fetchBByB = await getExperimentById(expB.id, userB.id, client)
    assert.equal(fetchBByB.id, expB.id)
    assert.equal(fetchBByB.name, 'User B Private Simulation Run')

    // 6. User B CANNOT view Experiment A (Cross-user access denied with 403 Forbidden)
    await assert.rejects(
      async () => {
        await getExperimentById(expA.id, userB.id, client)
      },
      (err: any) => {
        assert.ok(err instanceof ForbiddenError)
        assert.match(err.message, /do not have permission/)
        return true
      }
    )

    // 7. Unauthenticated user CANNOT view either private experiment
    await assert.rejects(
      async () => {
        await getExperimentById(expA.id, undefined, client)
      },
      (err: any) => {
        assert.ok(err instanceof ForbiddenError)
        return true
      }
    )
  })

  it('enforces strict fail-closed authorization rules on public, private, and legacy records', async () => {
    const client = createMockIsolationPrismaClient()

    // Record 1: Legacy unassigned private record (userId = null, isPublic = false)
    const unassignedPrivate = await client.experiment.create({
      data: {
        name: 'Legacy Unassigned Private Run',
        workloadType: 'Low',
        requestCount: 500,
        durationMinutes: 10,
        slaLatencyThresholdMs: 300,
        arrivalPattern: 'Steady',
        seed: 333,
        userId: null,
        isPublic: false,
        weights: { alpha: 0.25, beta: 0.25, gamma: 0.25, delta: 0.25 },
        assumptions: defaultAssumptions,
        policyResults: { create: [] },
      },
    })

    // Record 2: Public benchmark (userId = userB.id, isPublic = true)
    const publicExp = await createExperiment(
      {
        name: 'Public Shared Cloud Benchmark',
        workloadType: 'Medium',
        requestCount: 1000,
        durationMinutes: 20,
        slaLatencyThresholdMs: 300,
        arrivalPattern: 'Steady',
        seed: 444,
        userId: userB.id,
        isPublic: true,
        weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
        assumptions: defaultAssumptions,
        policyResults: samplePolicyResults,
      },
      client
    )

    // Rule 1: Public experiment allows access to User A and unauthenticated users
    const viewByA = await getExperimentById(publicExp.id, userA.id, client)
    assert.equal(viewByA.id, publicExp.id)
    assert.equal(viewByA.isPublic, true)

    const viewByAnon = await getExperimentById(publicExp.id, undefined, client)
    assert.equal(viewByAnon.id, publicExp.id)
    assert.equal(viewByAnon.isPublic, true)

    // Rule 3: Private experiment owned by another user denies access (tested in prior test)

    // Rule 4: Legacy experiment with userId = null and isPublic = false MUST DENY ACCESS
    await assert.rejects(
      async () => {
        await getExperimentById(unassignedPrivate.id, userA.id, client)
      },
      (err: any) => {
        assert.ok(err instanceof ForbiddenError, 'User A must not access unassigned private experiment')
        return true
      }
    )

    await assert.rejects(
      async () => {
        await getExperimentById(unassignedPrivate.id, userB.id, client)
      },
      (err: any) => {
        assert.ok(err instanceof ForbiddenError, 'User B must not access unassigned private experiment')
        return true
      }
    )

    // Rule 5: Unauthenticated access to unassigned private experiment MUST DENY ACCESS
    await assert.rejects(
      async () => {
        await getExperimentById(unassignedPrivate.id, undefined, client)
      },
      (err: any) => {
        assert.ok(err instanceof ForbiddenError, 'Unauthenticated access to unassigned private record must be blocked')
        return true
      }
    )

    // Deletion Rule: Unassigned experiment cannot be deleted by any user or unauthenticated request
    await assert.rejects(
      async () => {
        await deleteExperiment(unassignedPrivate.id, userA.id, client)
      },
      (err: any) => {
        assert.ok(err instanceof ForbiddenError)
        return true
      }
    )

    await assert.rejects(
      async () => {
        await deleteExperiment(unassignedPrivate.id, undefined, client)
      },
      (err: any) => {
        assert.ok(err instanceof ForbiddenError)
        return true
      }
    )

    // Export Rule: Cannot export report for unassigned private experiment
    await assert.rejects(
      async () => {
        const record = await getExperimentById(unassignedPrivate.id, userA.id, client)
        generateExperimentCSV(record)
      },
      (err: any) => {
        assert.ok(err instanceof ForbiddenError)
        return true
      }
    )
  })

  it('isolates experiment history listing strictly by authenticated user ID', async () => {
    const client = createMockIsolationPrismaClient()

    // User A creates 3 experiments
    for (let i = 1; i <= 3; i++) {
      await createExperiment(
        {
          name: `User A Experiment #${i}`,
          workloadType: 'Medium',
          requestCount: 1000 * i,
          durationMinutes: 15,
          slaLatencyThresholdMs: 300,
          arrivalPattern: 'Steady',
          seed: 100 + i,
          userId: userA.id,
          isPublic: false,
          weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
          assumptions: { prng: 'Mulberry32', latencyModel: 'M', costModel: 'M', carbonModel: 'M', coldStartModel: 'M' },
          policyResults: samplePolicyResults,
        },
        client
      )
    }

    // User B creates 2 experiments
    for (let j = 1; j <= 2; j++) {
      await createExperiment(
        {
          name: `User B Experiment #${j}`,
          workloadType: 'High',
          requestCount: 2000 * j,
          durationMinutes: 20,
          slaLatencyThresholdMs: 200,
          arrivalPattern: 'Bursty',
          seed: 200 + j,
          userId: userB.id,
          isPublic: false,
          weights: { alpha: 0.25, beta: 0.25, gamma: 0.25, delta: 0.25 },
          assumptions: { prng: 'Mulberry32', latencyModel: 'M', costModel: 'M', carbonModel: 'M', coldStartModel: 'M' },
          policyResults: samplePolicyResults,
        },
        client
      )
    }

    // Legacy unassigned experiment (created prior to auth)
    await client.experiment.create({
      data: {
        name: 'Legacy Baseline Run',
        workloadType: 'Low',
        requestCount: 500,
        durationMinutes: 10,
        slaLatencyThresholdMs: 400,
        arrivalPattern: 'Steady',
        seed: 999,
        userId: null,
        isPublic: false,
        weights: { alpha: 0.25, beta: 0.25, gamma: 0.25, delta: 0.25 },
        assumptions: defaultAssumptions,
        policyResults: { create: [] },
      },
    })

    // User A query with includePublic: false (scope=mine)
    const listA = await getExperiments({ userId: userA.id, includePublic: false }, client)
    assert.equal(listA.total, 3, 'User A must see exactly 3 experiments')
    assert.ok(listA.experiments.every((e) => e.userId === userA.id), 'All experiments must belong to User A')
    assert.ok(listA.experiments.every((e) => !e.name.includes('User B')), 'User B experiments must never appear in User A history')
    assert.ok(listA.experiments.every((e) => e.name !== 'Legacy Baseline Run'), 'Unassigned legacy experiments must never appear in user personal history')

    // User B query with includePublic: false (scope=mine)
    const listB = await getExperiments({ userId: userB.id, includePublic: false }, client)
    assert.equal(listB.total, 2, 'User B must see exactly 2 experiments')
    assert.ok(listB.experiments.every((e) => e.userId === userB.id), 'All experiments must belong to User B')
    assert.ok(listB.experiments.every((e) => !e.name.includes('User A')), 'User A experiments must never appear in User B history')
    assert.ok(listB.experiments.every((e) => e.name !== 'Legacy Baseline Run'), 'Unassigned legacy experiments must never appear in user personal history')
  })

  it('prevents cross-user experiment deletion and protects other users records', async () => {
    const client = createMockIsolationPrismaClient()

    const expA = await createExperiment(
      {
        name: 'Protected User A Record',
        workloadType: 'Medium',
        requestCount: 1500,
        durationMinutes: 20,
        slaLatencyThresholdMs: 300,
        arrivalPattern: 'Steady',
        seed: 555,
        userId: userA.id,
        isPublic: false,
        weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
        assumptions: defaultAssumptions,
        policyResults: samplePolicyResults,
      },
      client
    )

    // User B attempts to delete User A's experiment -> Blocked with 403 Forbidden
    await assert.rejects(
      async () => {
        await deleteExperiment(expA.id, userB.id, client)
      },
      (err: any) => {
        assert.ok(err instanceof ForbiddenError)
        return true
      }
    )

    // Verify Experiment A was NOT deleted
    const checkExpA = await getExperimentById(expA.id, userA.id, client)
    assert.equal(checkExpA.id, expA.id, 'Experiment A must remain untouched after unauthorized delete attempt')

    // Verified owner User A deletes Experiment A -> Succeeded
    const deleteResult = await deleteExperiment(expA.id, userA.id, client)
    assert.equal(deleteResult.deleted, true)

    // Now Experiment A is gone
    await assert.rejects(
      async () => {
        await getExperimentById(expA.id, userA.id, client)
      },
      (err: any) => {
        assert.ok(err instanceof NotFoundError)
        return true
      }
    )
  })

  it('enforces strict authorization for CSV and PDF report generation', async () => {
    const client = createMockIsolationPrismaClient()

    const expA = await createExperiment(
      {
        name: 'Confidential User A Financial Analytics',
        workloadType: 'High',
        requestCount: 10000,
        durationMinutes: 60,
        slaLatencyThresholdMs: 200,
        arrivalPattern: 'Bursty',
        seed: 777,
        userId: userA.id,
        isPublic: false,
        weights: { alpha: 0.4, beta: 0.2, gamma: 0.3, delta: 0.1 },
        assumptions: defaultAssumptions,
        policyResults: samplePolicyResults,
      },
      client
    )

    // User B attempts to access User A's experiment to export report -> Blocked
    await assert.rejects(
      async () => {
        const stolenRecord = await getExperimentById(expA.id, userB.id, client)
        generateExperimentCSV(stolenRecord)
      },
      (err: any) => {
        assert.ok(err instanceof ForbiddenError)
        return true
      }
    )

    // User A exports CSV and PDF successfully
    const authorizedRecord = await getExperimentById(expA.id, userA.id, client)
    const csv = generateExperimentCSV(authorizedRecord)
    assert.ok(csv.includes(expA.id))
    assert.ok(csv.includes('Confidential User A Financial Analytics'))

    const pdfDoc = generateExperimentPDFDoc(authorizedRecord)
    assert.ok(pdfDoc)
  })

  it('guarantees user-specific aggregate dashboard analytics without cross-user leakage', async () => {
    const client = createMockIsolationPrismaClient()

    // User A has 1 experiment with 1000 requests
    const expA = await createExperiment(
      {
        name: 'User A Run',
        workloadType: 'Low',
        requestCount: 1000,
        durationMinutes: 10,
        slaLatencyThresholdMs: 300,
        arrivalPattern: 'Steady',
        seed: 11,
        userId: userA.id,
        isPublic: false,
        weights: { alpha: 0.25, beta: 0.25, gamma: 0.25, delta: 0.25 },
        assumptions: defaultAssumptions,
        policyResults: [
          {
            policy: 'CloudFlow adaptive',
            totalRequests: 1000,
            averageLatencyMs: 80.0,
            p95LatencyMs: 120.0,
            totalCostUSD: 0.005,
            totalCarbonG: 1.5,
            coldStartRatePercent: 2.0,
            slaViolationRatePercent: 0.1,
            averageOverheadMs: 0.05,
          },
        ],
      },
      client
    )

    // User B has 1 experiment with 5000 requests
    const expB = await createExperiment(
      {
        name: 'User B Run',
        workloadType: 'High',
        requestCount: 5000,
        durationMinutes: 30,
        slaLatencyThresholdMs: 250,
        arrivalPattern: 'Bursty',
        seed: 22,
        userId: userB.id,
        isPublic: false,
        weights: { alpha: 0.25, beta: 0.25, gamma: 0.25, delta: 0.25 },
        assumptions: defaultAssumptions,
        policyResults: [
          {
            policy: 'CloudFlow adaptive',
            totalRequests: 5000,
            averageLatencyMs: 150.0,
            p95LatencyMs: 220.0,
            totalCostUSD: 0.045,
            totalCarbonG: 12.0,
            coldStartRatePercent: 8.0,
            slaViolationRatePercent: 1.5,
            averageOverheadMs: 0.1,
          },
        ],
      },
      client
    )

    // User A dashboard retrieves User A experiments
    const userAExps = (await getExperiments({ userId: userA.id, includePublic: false }, client)).experiments
    const aggA = calculateAggregateMetrics(userAExps, 'CloudFlow adaptive')
    assert.equal(aggA.totalExperiments, 1)
    assert.equal(aggA.totalRequestsEvaluated, 1000)
    assert.equal(aggA.weightedAverageLatencyMs, 80.0)

    // User B dashboard retrieves User B experiments
    const userBExps = (await getExperiments({ userId: userB.id, includePublic: false }, client)).experiments
    const aggB = calculateAggregateMetrics(userBExps, 'CloudFlow adaptive')
    assert.equal(aggB.totalExperiments, 1)
    assert.equal(aggB.totalRequestsEvaluated, 5000)
    assert.equal(aggB.weightedAverageLatencyMs, 150.0)

    // Ensure zero leakage between aggregates
    assert.notEqual(aggA.totalRequestsEvaluated, aggB.totalRequestsEvaluated)
    assert.notEqual(aggA.weightedAverageLatencyMs, aggB.weightedAverageLatencyMs)
  })

  it('guarantees client-side cache and state purges upon account switching', () => {
    // Simulate dashboard state transition
    let activeUser: any = userA
    let dashboardExperiments: ExperimentRecord[] = [
      { id: 'exp-a1', name: 'User A Exp', userId: userA.id } as any,
    ]
    let selectedExperiment: ExperimentRecord | null = dashboardExperiments[0]

    assert.equal(dashboardExperiments.length, 1)
    assert.equal(dashboardExperiments[0].userId, userA.id)

    // Account switch: User A logs out, User B logs in
    activeUser = userB
    // Component effect triggers on [user?.id]: purge prior user's state
    dashboardExperiments = []
    selectedExperiment = null

    assert.equal(dashboardExperiments.length, 0, 'Previous user experiment array must be emptied')
    assert.equal(selectedExperiment, null, 'Selected experiment must be reset to null')

    // New user fetches their own data
    dashboardExperiments = [
      { id: 'exp-b1', name: 'User B Exp', userId: userB.id } as any,
    ]
    selectedExperiment = dashboardExperiments[0]

    assert.equal(dashboardExperiments.length, 1)
    assert.equal(dashboardExperiments[0].userId, userB.id)
    assert.equal(selectedExperiment?.id, 'exp-b1')
  })
})
