import test from 'node:test'
import assert from 'node:assert/strict'
import { runSimulation } from '../lib/simulation/engine.ts'

test('Workload Simulation: Deterministic Reproducibility with identical seed', () => {
  const config = {
    requestCount: 200,
    durationMinutes: 15,
    slaLatencyThresholdMs: 400,
    arrivalPattern: 'Poisson' as const,
    policy: 'Latency-first' as const,
    seed: 9999,
  }

  const run1 = runSimulation(config)
  const run2 = runSimulation(config)

  // Verify aggregate metrics are exactly identical
  assert.equal(run1.summary.totalRequests, run2.summary.totalRequests)
  assert.equal(run1.summary.averageLatencyMs, run2.summary.averageLatencyMs)
  assert.equal(run1.summary.p95LatencyMs, run2.summary.p95LatencyMs)
  assert.equal(run1.summary.totalCostUSD, run2.summary.totalCostUSD)
  assert.equal(run1.summary.totalCarbonG, run2.summary.totalCarbonG)
  assert.equal(run1.summary.coldStartRatePercent, run2.summary.coldStartRatePercent)
  assert.equal(run1.summary.slaViolationRatePercent, run2.summary.slaViolationRatePercent)

  // Verify first 10 individual request traces are identical
  assert.equal(run1.sampleTraces.length, run2.sampleTraces.length)
  for (let i = 0; i < 10; i++) {
    assert.deepEqual(run1.sampleTraces[i], run2.sampleTraces[i])
  }
})

test('Workload Simulation: Different seeds produce different stochastic distributions', () => {
  const baseConfig = {
    requestCount: 100,
    durationMinutes: 10,
    slaLatencyThresholdMs: 400,
    arrivalPattern: 'Bursty' as const,
    policy: 'Cost-first' as const,
  }

  const runA = runSimulation({ ...baseConfig, seed: 101 })
  const runB = runSimulation({ ...baseConfig, seed: 99999 })

  // Summary latencies and costs should differ due to stochastic simulation
  assert.notEqual(runA.summary.averageLatencyMs, runB.summary.averageLatencyMs)
})

test('Workload Simulation: Arrival Patterns (Steady, Poisson, Bursty)', () => {
  const patterns = ['Steady', 'Poisson', 'Bursty'] as const

  for (const pattern of patterns) {
    const result = runSimulation({
      requestCount: 50,
      durationMinutes: 5,
      slaLatencyThresholdMs: 500,
      arrivalPattern: pattern,
      seed: 42,
    })

    assert.equal(result.status, 'success')
    assert.equal(result.summary.totalRequests, 50)
    assert.ok(result.summary.averageLatencyMs > 0)
    assert.ok(result.summary.p95LatencyMs >= result.summary.averageLatencyMs)
  }
})

test('Workload Simulation: Documents simulation assumptions clearly', () => {
  const result = runSimulation({
    requestCount: 20,
    slaLatencyThresholdMs: 400,
    seed: 123,
  })

  assert.ok(result.simulationAssumptions.prng)
  assert.ok(result.simulationAssumptions.latencyModel)
  assert.ok(result.simulationAssumptions.costModel)
  assert.ok(result.simulationAssumptions.carbonModel)
  assert.ok(result.simulationAssumptions.coldStartModel)
})
