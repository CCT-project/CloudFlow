import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateAdaptivePolicy, validateAdaptiveWeights } from '../lib/scheduler/adaptive-policy.ts'
import type { ServerlessCandidate } from '../lib/types/scheduler.ts'

const sampleCandidates: ServerlessCandidate[] = [
  {
    id: 'c-fast',
    name: 'Fast Region',
    provider: 'AWS',
    region: 'us-east-1',
    baseLatencyMs: 80,
    coldStartLatencyMs: 120,
    costPerMsUSD: 0.00004,
    carbonIntensityGPerKwh: 400,
    activeInstances: 10,
    isWarm: true,
  },
  {
    id: 'c-cheap',
    name: 'Cheap Region',
    provider: 'GCP',
    region: 'us-central1',
    baseLatencyMs: 140,
    coldStartLatencyMs: 200,
    costPerMsUSD: 0.00001,
    carbonIntensityGPerKwh: 350,
    activeInstances: 8,
    isWarm: true,
  },
  {
    id: 'c-green',
    name: 'Green Region',
    provider: 'Azure',
    region: 'norway-east',
    baseLatencyMs: 120,
    coldStartLatencyMs: 180,
    costPerMsUSD: 0.000025,
    carbonIntensityGPerKwh: 30,
    activeInstances: 6,
    isWarm: true,
  },
]

test('Adaptive Policy: Validates default weights sum to 1.0', () => {
  const weights = validateAdaptiveWeights()
  assert.equal(weights.alpha + weights.beta + weights.gamma + weights.delta, 1.0)
})

test('Adaptive Policy: Rejects weights that do not sum to 1.0', () => {
  assert.throws(
    () =>
      validateAdaptiveWeights({
        alpha: 0.5,
        beta: 0.5,
        gamma: 0.5,
        delta: 0.1,
      }),
    /must sum to 1.0/
  )
})

test('Adaptive Policy: Rejects negative weights', () => {
  assert.throws(
    () =>
      validateAdaptiveWeights({
        alpha: -0.1,
        beta: 0.6,
        gamma: 0.3,
        delta: 0.2,
      }),
    /cannot be negative/
  )
})

test('Adaptive Policy: Rejects non-finite weights', () => {
  assert.throws(
    () =>
      validateAdaptiveWeights({
        alpha: NaN,
        beta: 0.5,
        gamma: 0.3,
        delta: 0.2,
      }),
    /must be a finite number/
  )
})

test('Adaptive Policy: Selects the lowest-scoring feasible candidate according to weights', () => {
  // Emphasize carbon: beta = 0.70, alpha = 0.10, gamma = 0.10, delta = 0.10
  const result = evaluateAdaptivePolicy({
    slaLatencyThresholdMs: 250,
    candidates: sampleCandidates,
    adaptiveWeights: {
      alpha: 0.10,
      beta: 0.70,
      gamma: 0.10,
      delta: 0.10,
    },
  })

  assert.equal(result.isSlaSatisfied, true)
  assert.equal(result.selectedCandidate?.id, 'c-green')
  assert.match(result.decisionExplanation, /CloudFlow Adaptive selected/)
})

test('Adaptive Policy: SLA feasibility dominates objective scores (infeasible candidate rejected despite low cost)', () => {
  const candidatesWithInfeasibleCheap: ServerlessCandidate[] = [
    {
      id: 'super-cheap-but-violates-sla',
      name: 'Super Cheap',
      provider: 'GCP',
      region: 'us-west1',
      baseLatencyMs: 350, // Exceeds 200ms SLA
      coldStartLatencyMs: 400,
      costPerMsUSD: 0.0000000001, // Virtually free!
      carbonIntensityGPerKwh: 10,  // Cleanest!
      activeInstances: 10,
      isWarm: true,
    },
    {
      id: 'compliant-candidate',
      name: 'Compliant Candidate',
      provider: 'AWS',
      region: 'us-east-1',
      baseLatencyMs: 150, // Meets 200ms SLA
      coldStartLatencyMs: 200,
      costPerMsUSD: 0.00003,
      carbonIntensityGPerKwh: 300,
      activeInstances: 10,
      isWarm: true,
    },
  ]

  const result = evaluateAdaptivePolicy({
    slaLatencyThresholdMs: 200,
    candidates: candidatesWithInfeasibleCheap,
    adaptiveWeights: {
      alpha: 0.70, // Heavy cost weight
      beta: 0.20,
      gamma: 0.05,
      delta: 0.05,
    },
  })

  assert.equal(result.isSlaSatisfied, true)
  // MUST select compliant-candidate despite higher cost!
  assert.equal(result.selectedCandidate?.id, 'compliant-candidate')
  const rejected = result.evaluations.find((e) => e.candidate.id === 'super-cheap-but-violates-sla')
  assert.equal(rejected?.decision, 'Rejected: SLA Constraint')
})

test('Adaptive Policy: When no candidate satisfies SLA, triggers documented fallback to smallest shortfall', () => {
  const overLatencyCandidates: ServerlessCandidate[] = [
    {
      id: 'c-high-shortfall',
      name: 'High Shortfall',
      provider: 'AWS',
      region: 'us-east-1',
      baseLatencyMs: 300,
      coldStartLatencyMs: 200,
      costPerMsUSD: 0.00002,
      carbonIntensityGPerKwh: 200,
      activeInstances: 5,
      isWarm: true,
    },
    {
      id: 'c-low-shortfall',
      name: 'Small Shortfall',
      provider: 'GCP',
      region: 'us-central1',
      baseLatencyMs: 120, // Shortfall = 120 - 100 = 20ms
      coldStartLatencyMs: 200,
      costPerMsUSD: 0.00002,
      carbonIntensityGPerKwh: 200,
      activeInstances: 5,
      isWarm: true,
    },
  ]

  const result = evaluateAdaptivePolicy({
    slaLatencyThresholdMs: 100, // Neither candidate meets 100ms
    candidates: overLatencyCandidates,
  })

  assert.equal(result.isSlaSatisfied, false)
  // Fallback must select c-low-shortfall (120ms latency, smallest shortfall)
  assert.equal(result.selectedCandidate?.id, 'c-low-shortfall')
  assert.match(result.decisionExplanation, /SLA Violation Warning: Zero candidates satisfy/)
  assert.match(result.decisionExplanation, /smallest SLA shortfall of 20ms/)
})

test('Adaptive Policy: Safe normalization when all candidates have identical values', () => {
  const identicalCandidates: ServerlessCandidate[] = [
    {
      id: 'cand-1',
      name: 'Candidate 1',
      provider: 'AWS',
      region: 'us-east-1',
      baseLatencyMs: 100,
      coldStartLatencyMs: 150,
      costPerMsUSD: 0.00002,
      carbonIntensityGPerKwh: 250,
      activeInstances: 10,
      isWarm: true,
    },
    {
      id: 'cand-2',
      name: 'Candidate 2',
      provider: 'AWS',
      region: 'us-west-2',
      baseLatencyMs: 100,
      coldStartLatencyMs: 150,
      costPerMsUSD: 0.00002,
      carbonIntensityGPerKwh: 250,
      activeInstances: 10,
      isWarm: true,
    },
  ]

  // Normalization range is 0. Ensure no NaN or infinite scores are produced.
  const result = evaluateAdaptivePolicy({
    slaLatencyThresholdMs: 300,
    candidates: identicalCandidates,
  })

  assert.equal(result.isSlaSatisfied, true)
  assert.ok(result.selectedCandidate)
  for (const evalItem of result.evaluations) {
    assert.ok(Number.isFinite(evalItem.compositeScore))
    assert.equal(isNaN(evalItem.compositeScore), false)
  }
})

test('Adaptive Policy: Rejects candidate with missing or invalid metrics', () => {
  const invalidCand = {
    id: 'invalid-cand',
    name: 'Invalid Candidate',
    provider: 'AWS',
    region: 'us-east-1',
    baseLatencyMs: -50, // Negative!
    coldStartLatencyMs: 100,
    costPerMsUSD: 0.00002,
    carbonIntensityGPerKwh: 200,
    activeInstances: 10,
    isWarm: true,
  } as ServerlessCandidate

  assert.throws(
    () =>
      evaluateAdaptivePolicy({
        slaLatencyThresholdMs: 300,
        candidates: [invalidCand],
      }),
    /invalid baseLatencyMs/
  )
})
