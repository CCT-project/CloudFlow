import test from 'node:test'
import assert from 'node:assert/strict'
import { runSimulation } from '../lib/simulation/engine.ts'
import type { PolicyPerformanceSummary, PolicyType } from '../lib/types/scheduler.ts'

test('Fair Multi-Policy Comparison: Evaluates all 5 policies across identical request sequence', () => {
  const result = runSimulation({
    requestCount: 300,
    durationMinutes: 10,
    slaLatencyThresholdMs: 400,
    arrivalPattern: 'Poisson',
    policy: 'CloudFlow adaptive',
    compareAllPolicies: true,
    seed: 5555,
  })

  assert.equal(result.status, 'success')
  assert.ok(result.policySummaries)

  const evaluatedPolicies = Object.keys(result.policySummaries)
  assert.equal(evaluatedPolicies.length, 5)

  assert.ok(result.policySummaries['Latency-first'])
  assert.ok(result.policySummaries['Cost-first'])
  assert.ok(result.policySummaries['Carbon-first'])
  assert.ok(result.policySummaries['Default'])
  assert.ok(result.policySummaries['CloudFlow adaptive'])

  // Confirm all policies processed the exact same number of requests
  for (const pol of evaluatedPolicies) {
    const summary: PolicyPerformanceSummary = (result.policySummaries as Record<string, PolicyPerformanceSummary>)[pol]!
    assert.equal(summary.totalRequests, 300)
    assert.ok(summary.averageLatencyMs > 0)
    assert.ok(summary.totalCostUSD > 0)
    assert.ok(summary.totalCarbonG > 0)
    assert.ok(summary.p95LatencyMs >= summary.averageLatencyMs)
  }
})

test('Fair Comparison: Objective trade-offs align with policy goals', () => {
  const result = runSimulation({
    requestCount: 500,
    durationMinutes: 15,
    slaLatencyThresholdMs: 500,
    arrivalPattern: 'Steady',
    policy: 'CloudFlow adaptive',
    compareAllPolicies: true,
    seed: 7777,
  })

  const summaries = result.policySummaries!
  const latencyFirst = summaries['Latency-first']!
  const costFirst = summaries['Cost-first']!
  const carbonFirst = summaries['Carbon-first']!
  const adaptive = summaries['CloudFlow adaptive']!

  // Cost-first should achieve lower or equal execution cost compared to latency-first
  assert.ok(
    costFirst.totalCostUSD <= latencyFirst.totalCostUSD,
    `Cost-first cost (${costFirst.totalCostUSD}) should be <= Latency-first cost (${latencyFirst.totalCostUSD})`
  )

  // Carbon-first should achieve lower or equal carbon compared to latency-first
  assert.ok(
    carbonFirst.totalCarbonG <= latencyFirst.totalCarbonG,
    `Carbon-first emissions (${carbonFirst.totalCarbonG}) should be <= Latency-first (${latencyFirst.totalCarbonG})`
  )

  // Latency-first should achieve lower or equal latency compared to carbon-first
  assert.ok(
    latencyFirst.averageLatencyMs <= carbonFirst.averageLatencyMs,
    `Latency-first latency (${latencyFirst.averageLatencyMs}) should be <= Carbon-first (${carbonFirst.averageLatencyMs})`
  )

  // Adaptive should satisfy SLA and produce balanced trade-offs
  assert.ok(adaptive.slaViolationRatePercent <= 5.0)
})

test('Fair Comparison: Custom adaptive weights influence adaptive policy metrics', () => {
  // Heavy carbon weights vs Heavy cost weights
  const carbonBiased = runSimulation({
    requestCount: 200,
    slaLatencyThresholdMs: 400,
    policy: 'CloudFlow adaptive',
    adaptiveWeights: {
      alpha: 0.05,
      beta: 0.80,
      gamma: 0.10,
      delta: 0.05,
    },
    seed: 8888,
  })

  const costBiased = runSimulation({
    requestCount: 200,
    slaLatencyThresholdMs: 400,
    policy: 'CloudFlow adaptive',
    adaptiveWeights: {
      alpha: 0.80,
      beta: 0.05,
      gamma: 0.10,
      delta: 0.05,
    },
    seed: 8888,
  })

  // Carbon-biased run should have lower or equal carbon emissions than cost-biased run
  assert.ok(carbonBiased.summary.totalCarbonG <= costBiased.summary.totalCarbonG)
  // Cost-biased run should have lower or equal cost than carbon-biased run
  assert.ok(costBiased.summary.totalCostUSD <= carbonBiased.summary.totalCostUSD)
})
