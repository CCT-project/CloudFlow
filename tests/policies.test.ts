import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateBaselinePolicy } from '../lib/scheduler/baseline-policies.ts'
import type { ServerlessCandidate } from '../lib/types/scheduler.ts'

const testCandidates: ServerlessCandidate[] = [
  {
    id: 'fast-expensive-dirty',
    name: 'Fast Region',
    provider: 'AWS',
    region: 'us-east-1',
    baseLatencyMs: 80,
    coldStartLatencyMs: 150,
    costPerMsUSD: 0.00005,
    carbonIntensityGPerKwh: 500,
    activeInstances: 10,
    isWarm: true,
  },
  {
    id: 'cheap-slow-moderate',
    name: 'Cheap Region',
    provider: 'GCP',
    region: 'us-central1',
    baseLatencyMs: 160,
    coldStartLatencyMs: 250,
    costPerMsUSD: 0.00001,
    carbonIntensityGPerKwh: 350,
    activeInstances: 8,
    isWarm: true,
  },
  {
    id: 'green-moderate-moderate',
    name: 'Green Region',
    provider: 'Azure',
    region: 'norway-east',
    baseLatencyMs: 140,
    coldStartLatencyMs: 200,
    costPerMsUSD: 0.00003,
    carbonIntensityGPerKwh: 30,
    activeInstances: 6,
    isWarm: true,
  },
]

test('Policy Evaluation: Latency-First selects minimum latency SLA-feasible candidate', () => {
  const result = evaluateBaselinePolicy({
    policy: 'Latency-first',
    slaLatencyThresholdMs: 300,
    candidates: testCandidates,
  })

  assert.equal(result.status, 'success')
  assert.equal(result.isSlaSatisfied, true)
  assert.equal(result.selectedCandidate?.id, 'fast-expensive-dirty')
  assert.match(result.decisionExplanation, /minimizing expected latency/)
})

test('Policy Evaluation: Cost-First selects lowest cost SLA-feasible candidate', () => {
  const result = evaluateBaselinePolicy({
    policy: 'Cost-first',
    slaLatencyThresholdMs: 300,
    candidates: testCandidates,
  })

  assert.equal(result.status, 'success')
  assert.equal(result.isSlaSatisfied, true)
  assert.equal(result.selectedCandidate?.id, 'cheap-slow-moderate')
  assert.match(result.decisionExplanation, /lowest execution cost/)
})

test('Policy Evaluation: Carbon-First selects cleanest SLA-feasible candidate', () => {
  const result = evaluateBaselinePolicy({
    policy: 'Carbon-first',
    slaLatencyThresholdMs: 300,
    candidates: testCandidates,
  })

  assert.equal(result.status, 'success')
  assert.equal(result.isSlaSatisfied, true)
  assert.equal(result.selectedCandidate?.id, 'green-moderate-moderate')
  assert.match(result.decisionExplanation, /minimizing regional carbon/)
})

test('Policy Evaluation: Default Policy statically picks first candidate', () => {
  const result = evaluateBaselinePolicy({
    policy: 'Default',
    slaLatencyThresholdMs: 300,
    candidates: testCandidates,
  })

  assert.equal(result.status, 'success')
  assert.equal(result.selectedCandidate?.id, testCandidates[0].id)
})

test('Policy Evaluation: Strict SLA rejects failing candidates and reports explicitly', () => {
  // If SLA is 100ms, only 'fast-expensive-dirty' (80ms) meets it
  const result = evaluateBaselinePolicy({
    policy: 'Cost-first',
    slaLatencyThresholdMs: 100,
    candidates: testCandidates,
  })

  assert.equal(result.status, 'success')
  assert.equal(result.isSlaSatisfied, true)
  // Even though 'cheap' has lower cost, it has 160ms latency > 100ms SLA, so only 'fast' is eligible
  assert.equal(result.selectedCandidate?.id, 'fast-expensive-dirty')
})

test('Policy Evaluation: When NO candidate meets SLA, reports violation explicitly', () => {
  // If SLA is 50ms, no candidate (min 80ms) meets it
  const result = evaluateBaselinePolicy({
    policy: 'Latency-first',
    slaLatencyThresholdMs: 50,
    candidates: testCandidates,
  })

  assert.equal(result.status, 'success')
  assert.equal(result.isSlaSatisfied, false)
  assert.equal(result.selectedCandidate, null)
  assert.match(result.decisionExplanation, /Zero eligible candidates satisfy the configured SLA/)
})

test('Policy Evaluation: CloudFlow Adaptive policy is supported and evaluated', () => {
  const result = evaluateBaselinePolicy({
    policy: 'CloudFlow adaptive',
    slaLatencyThresholdMs: 300,
    candidates: testCandidates,
  })

  assert.equal(result.status, 'success')
  assert.equal(result.isSlaSatisfied, true)
  assert.ok(result.selectedCandidate)
  assert.match(result.decisionExplanation, /CloudFlow Adaptive selected/)
})

test('Policy Evaluation: Empty candidate list throws descriptive error', () => {
  assert.throws(
    () =>
      evaluateBaselinePolicy({
        policy: 'Latency-first',
        slaLatencyThresholdMs: 300,
        candidates: [],
      }),
    /At least one candidate is required/
  )
})
