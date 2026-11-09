import test from 'node:test'
import assert from 'node:assert/strict'
import {
  simulatePolicyOnWorkload,
  runSimulation,
  ALL_POLICIES,
} from '../lib/simulation/engine.ts'
import {
  DeterministicPRNG,
  generateWorkloadRequests,
} from '../lib/simulation/workload.ts'
import type { SyntheticRequest } from '../lib/simulation/workload.ts'
import { DEFAULT_CANDIDATES } from '../lib/simulation/defaults.ts'
import { runBatchResearch } from '../lib/research/batch-engine.ts'
import { calculatePooledP95Latency } from '../lib/metrics/calculations.ts'
import type { ServerlessCandidate } from '../lib/types/scheduler.ts'

test('Workload Generation: Decoupled PRNG streams produce identical durations across patterns', () => {
  const seed = 7788
  const prngSteady = new DeterministicPRNG(seed)
  const prngPoisson = new DeterministicPRNG(seed)
  const prngBursty = new DeterministicPRNG(seed)

  const steadyReqs = generateWorkloadRequests(50, 10, 'Steady', prngSteady)
  const poissonReqs = generateWorkloadRequests(50, 10, 'Poisson', prngPoisson)
  const burstyReqs = generateWorkloadRequests(50, 10, 'Bursty', prngBursty)

  assert.equal(steadyReqs.length, 50)
  assert.equal(poissonReqs.length, 50)
  assert.equal(burstyReqs.length, 50)

  // Durations must be identical across patterns because duration PRNG stream is decoupled and uses the same seed
  for (let i = 0; i < 50; i++) {
    assert.equal(
      steadyReqs[i].executionDurationMs,
      poissonReqs[i].executionDurationMs,
      `Request ${i} executionDurationMs should match between Steady and Poisson`
    )
    assert.equal(
      poissonReqs[i].executionDurationMs,
      burstyReqs[i].executionDurationMs,
      `Request ${i} executionDurationMs should match between Poisson and Bursty`
    )
  }

  // Arrival times must be genuinely different
  const steadyArrivals = steadyReqs.map((r) => r.arrivalTimeMs)
  const poissonArrivals = poissonReqs.map((r) => r.arrivalTimeMs)
  const burstyArrivals = burstyReqs.map((r) => r.arrivalTimeMs)

  assert.notDeepEqual(steadyArrivals, poissonArrivals)
  assert.notDeepEqual(poissonArrivals, burstyArrivals)
})

test('Discrete-Event Simulation: Container concurrency scaling and warm reuse', () => {
  // Test candidate with maxInstances = 5
  const candidate: ServerlessCandidate = {
    id: 'test-cand-1',
    name: 'Test Candidate',
    region: 'us-east-1',
    provider: 'AWS',
    baseLatencyMs: 30,
    coldStartLatencyMs: 250,
    costPerMsUSD: 0.0000002,
    carbonIntensityGPerKwh: 350,
    isWarm: true,
    activeInstances: 1, // 1 warm instance initially
    maxInstances: 5,
  }

  // Request 1 arrives at t = 0, duration = 200 ms -> served warm by instance 1 (idle)
  // Request 2 arrives at t = 50 ms (instance 1 is busy until 200ms) -> scales out instance 2 (cold start!)
  // Request 3 arrives at t = 300 ms -> instance 1 finished at 200ms -> warm reuse!
  const requests: SyntheticRequest[] = [
    { id: 1, arrivalTimeMs: 0, executionDurationMs: 200 },
    { id: 2, arrivalTimeMs: 50, executionDurationMs: 200 },
    { id: 3, arrivalTimeMs: 300, executionDurationMs: 200 },
  ]

  const result = simulatePolicyOnWorkload(
    requests,
    'Latency-first',
    [candidate],
    1000,
    undefined,
    42
  )

  assert.equal(result.summary.totalRequests, 3)
  // Request 1 should be warm
  assert.equal(result.traces[0].isColdStart, false)
  assert.equal(result.traces[0].coldStartDelayMs, 0)
  assert.equal(result.traces[0].queueingDelayMs, 0)

  // Request 2 should trigger concurrency cold start
  assert.equal(result.traces[1].isColdStart, true)
  assert.equal(result.traces[1].coldStartDelayMs, 250)
  assert.equal(result.traces[1].queueingDelayMs, 0)

  // Request 3 arrives at t=300ms, should reuse idle warm instance
  assert.equal(result.traces[2].isColdStart, false)
  assert.equal(result.traces[2].coldStartDelayMs, 0)
  assert.equal(result.traces[2].queueingDelayMs, 0)

  // Summary cold start rate should be 1 / 3 = 33.33%
  assert.equal(result.summary.coldStartRatePercent, 33.33)
})

test('Discrete-Event Simulation: Queueing delay under saturated concurrency capacity', () => {
  const candidate: ServerlessCandidate = {
    id: 'test-cand-saturated',
    name: 'Saturated Candidate',
    region: 'us-west-2',
    provider: 'GCP',
    baseLatencyMs: 20,
    coldStartLatencyMs: 150,
    costPerMsUSD: 0.00000018,
    carbonIntensityGPerKwh: 200,
    isWarm: true,
    activeInstances: 1,
    maxInstances: 2, // Maximum 2 container instances
  }

  // Request 1 arrives at t = 0 ms, duration = 500 ms (instance 1 busy until t=500ms)
  // Request 2 arrives at t = 10 ms, duration = 500 ms (scales out instance 2, cold start, finishes at 10 + 150 + 500 = 660ms)
  // Request 3 arrives at t = 20 ms, duration = 200 ms (pool full! Must wait for earliest finish: instance 1 finishes at 500ms)
  // Queueing delay for Request 3 = 500 - 20 = 480 ms
  const requests: SyntheticRequest[] = [
    { id: 1, arrivalTimeMs: 0, executionDurationMs: 500 },
    { id: 2, arrivalTimeMs: 10, executionDurationMs: 500 },
    { id: 3, arrivalTimeMs: 20, executionDurationMs: 200 },
  ]

  const result = simulatePolicyOnWorkload(
    requests,
    'Latency-first',
    [candidate],
    1500,
    undefined,
    42
  )

  const trace3 = result.traces[2]
  assert.ok(trace3.queueingDelayMs! >= 470 && trace3.queueingDelayMs! <= 490, `Queueing delay was ${trace3.queueingDelayMs}`)
  assert.equal(trace3.isColdStart, false) // Queueing reuse is not a cold start
  assert.ok(result.summary.averageQueueingDelayMs! > 0)
})

test('Discrete-Event Simulation: Idle container expiration after coldStartTimeoutMs', () => {
  const candidate: ServerlessCandidate = {
    id: 'test-cand-expiration',
    name: 'Expiring Candidate',
    region: 'eu-central-1',
    provider: 'AWS',
    baseLatencyMs: 25,
    coldStartLatencyMs: 200,
    costPerMsUSD: 0.0000002,
    carbonIntensityGPerKwh: 300,
    isWarm: true,
    activeInstances: 1,
    maxInstances: 5,
  }

  const timeoutMs = 60000 // 1 minute timeout for test
  // Request 1 arrives at t = 0 ms, duration = 100 ms (finishes at t=100ms)
  // Request 2 arrives at t = 10,000 ms (10s later, well within 60s timeout) -> warm reuse
  // Request 3 arrives at t = 100,000 ms (90s after req 2 finishes at 10,100ms, expired!) -> cold start
  const requests: SyntheticRequest[] = [
    { id: 1, arrivalTimeMs: 0, executionDurationMs: 100 },
    { id: 2, arrivalTimeMs: 10000, executionDurationMs: 100 },
    { id: 3, arrivalTimeMs: 100000, executionDurationMs: 100 },
  ]

  const result = simulatePolicyOnWorkload(
    requests,
    'Latency-first',
    [candidate],
    1000,
    undefined,
    42,
    { coldStartTimeoutMs: timeoutMs }
  )

  assert.equal(result.traces[0].isColdStart, false)
  assert.equal(result.traces[1].isColdStart, false) // Within timeout
  assert.equal(result.traces[2].isColdStart, true) // Expired!
})

test('Discrete-Event Simulation: Multi-policy comparison and pooled P95 latency', () => {
  const batchResult = runBatchResearch({
    seedCount: 30,
    startingSeed: 4200,
    requestCount: 100,
    durationMinutes: 10,
    arrivalPattern: 'Bursty',
    slaLatencyThresholdMs: 350,
  })

  assert.equal(batchResult.status, 'success')
  assert.equal(batchResult.metadata.totalSeeds, 30)

  // Verify all policies have statistics and pooledP95LatencyMs
  for (const pol of ALL_POLICIES) {
    const stats = batchResult.policyStatistics[pol]
    assert.ok(stats, `Missing statistics for ${pol}`)
    assert.equal(stats.sampleSize, 30)
    assert.ok(typeof stats.pooledP95LatencyMs === 'number', `pooledP95LatencyMs should be defined for ${pol}`)
    assert.ok(stats.pooledP95LatencyMs! > 0)
    assert.ok(stats.metrics.averageLatencyMs.mean > 0)
    assert.ok(stats.metrics.costUSD.mean > 0)
  }

  // Test calculatePooledP95Latency directly
  const latencies = Array.from({ length: 100 }, (_, i) => i + 1) // 1..100
  const p95 = calculatePooledP95Latency(latencies)
  assert.equal(p95, 95)
})
