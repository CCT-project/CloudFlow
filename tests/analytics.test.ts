import test from 'node:test'
import assert from 'node:assert/strict'
import type { ExperimentRecord, PersistedPolicyResult } from '../lib/types/scheduler.ts'
import { calculateAggregateMetrics, comparePolicies } from '../lib/metrics/aggregation.ts'
import { escapeCSVField, generateExperimentCSV, generateExperimentPDFDoc } from '../lib/reports/export.ts'

const samplePolicyResults: PersistedPolicyResult[] = [
  {
    policy: 'Latency-first',
    totalRequests: 1000,
    averageLatencyMs: 95.0,
    p95LatencyMs: 140.0,
    totalCostUSD: 0.05,
    totalCarbonG: 25.0,
    coldStartRatePercent: 4.0,
    slaViolationRatePercent: 0.2,
    averageOverheadMs: 0.3,
  },
  {
    policy: 'Cost-first',
    totalRequests: 1000,
    averageLatencyMs: 150.0,
    p95LatencyMs: 230.0,
    totalCostUSD: 0.015,
    totalCarbonG: 18.0,
    coldStartRatePercent: 7.0,
    slaViolationRatePercent: 2.1,
    averageOverheadMs: 0.3,
  },
  {
    policy: 'Carbon-first',
    totalRequests: 1000,
    averageLatencyMs: 170.0,
    p95LatencyMs: 260.0,
    totalCostUSD: 0.03,
    totalCarbonG: 10.0,
    coldStartRatePercent: 8.0,
    slaViolationRatePercent: 3.5,
    averageOverheadMs: 0.3,
  },
  {
    policy: 'Default',
    totalRequests: 1000,
    averageLatencyMs: 110.0,
    p95LatencyMs: 180.0,
    totalCostUSD: 0.04,
    totalCarbonG: 22.0,
    coldStartRatePercent: 5.0,
    slaViolationRatePercent: 0.8,
    averageOverheadMs: 0.05,
  },
  {
    policy: 'CloudFlow adaptive',
    totalRequests: 1000,
    averageLatencyMs: 115.0,
    p95LatencyMs: 165.0,
    totalCostUSD: 0.022,
    totalCarbonG: 13.5,
    coldStartRatePercent: 3.5,
    slaViolationRatePercent: 0.4,
    averageOverheadMs: 0.8,
  },
]

const sampleExperiment: ExperimentRecord = {
  id: 'exp-test-uuid-001',
  name: 'Test Benchmark Medium',
  createdAt: new Date().toISOString(),
  workloadType: 'Medium',
  requestCount: 1000,
  durationMinutes: 30,
  slaLatencyThresholdMs: 400,
  arrivalPattern: 'Poisson',
  seed: 4242,
  weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
  assumptions: {
    prng: 'Mulberry32 PRNG',
    latencyModel: 'Regional base + duration + jitter',
    costModel: 'Tiered execution duration',
    carbonModel: 'Marginal grid intensity',
    coldStartModel: '10-minute container timeout',
    adaptivePolicyModel: 'Two-stage SLA feasibility + weighted sum',
  },
  policyResults: samplePolicyResults,
}

test('Analytics: Empty experiment array produces zeroed aggregate metrics', () => {
  const agg = calculateAggregateMetrics([])
  assert.equal(agg.totalExperiments, 0)
  assert.equal(agg.totalRequestsEvaluated, 0)
  assert.equal(agg.totalCostUSD, 0)
  assert.equal(agg.totalCarbonG, 0)
  assert.equal(agg.weightedAverageLatencyMs, 0)
  assert.equal(agg.hasData, false)
})

test('Analytics: Correctly calculates request-weighted aggregate metrics across experiments', () => {
  const exp1: ExperimentRecord = {
    ...sampleExperiment,
    id: 'exp-1',
    requestCount: 1000,
    policyResults: [
      {
        ...samplePolicyResults[4], // Adaptive
        totalRequests: 1000,
        averageLatencyMs: 100,
        totalCostUSD: 0.02,
        totalCarbonG: 10,
        coldStartRatePercent: 4.0,
        slaViolationRatePercent: 1.0,
        p95LatencyMs: 150,
      },
    ],
  }

  const exp2: ExperimentRecord = {
    ...sampleExperiment,
    id: 'exp-2',
    requestCount: 3000,
    policyResults: [
      {
        ...samplePolicyResults[4], // Adaptive
        totalRequests: 3000,
        averageLatencyMs: 200,
        totalCostUSD: 0.06,
        totalCarbonG: 30,
        coldStartRatePercent: 8.0,
        slaViolationRatePercent: 3.0,
        p95LatencyMs: 280,
      },
    ],
  }

  const agg = calculateAggregateMetrics([exp1, exp2], 'CloudFlow adaptive')
  assert.equal(agg.totalExperiments, 2)
  assert.equal(agg.totalRequestsEvaluated, 4000)
  assert.equal(agg.totalCostUSD, 0.08)
  assert.equal(agg.totalCarbonG, 40)

  // Weighted latency: (1000*100 + 3000*200) / 4000 = (100000 + 600000) / 4000 = 175 ms
  assert.equal(agg.weightedAverageLatencyMs, 175)

  // Weighted cold start: (1000*4 + 3000*8) / 4000 = (4000 + 24000) / 4000 = 7.0%
  assert.equal(agg.weightedColdStartRatePercent, 7.0)

  // Weighted SLA violation: (1000*1 + 3000*3) / 4000 = (1000 + 9000) / 4000 = 2.5%
  assert.equal(agg.weightedSlaViolationRatePercent, 2.5)

  // Max P95
  assert.equal(agg.maxP95LatencyMs, 280)
  assert.equal(agg.hasData, true)
})

test('Analytics: comparePolicies identifies best metrics accurately', () => {
  const compared = comparePolicies(samplePolicyResults)
  assert.equal(compared.length, 5)

  const bestCost = compared.find((p) => p.isBestCost)
  assert.equal(bestCost?.policy, 'Cost-first', 'Cost-first should have lowest cost')

  const bestCarbon = compared.find((p) => p.isBestCarbon)
  assert.equal(bestCarbon?.policy, 'Carbon-first', 'Carbon-first should have lowest carbon')

  const bestLatency = compared.find((p) => p.isBestLatency)
  assert.equal(bestLatency?.policy, 'Latency-first', 'Latency-first should have lowest latency')

  const bestSla = compared.find((p) => p.isBestSla)
  assert.equal(bestSla?.policy, 'Latency-first', 'Latency-first has lowest SLA violation')
})

test('Reporting: escapeCSVField complies with RFC-4180 escaping', () => {
  assert.equal(escapeCSVField('hello'), '"hello"')
  assert.equal(escapeCSVField('hello,world'), '"hello,world"')
  assert.equal(escapeCSVField('say "hi"'), '"say ""hi"""')
  assert.equal(escapeCSVField(null), '""')
})

test('Reporting: generateExperimentCSV produces structured CSV with all five policies', () => {
  const csv = generateExperimentCSV(sampleExperiment)
  assert.ok(csv.includes('CloudFlow Research Report'))
  assert.ok(csv.includes('exp-test-uuid-001'))
  assert.ok(csv.includes('DISCLAIMER'))
  assert.ok(csv.includes('Latency-first'))
  assert.ok(csv.includes('Cost-first'))
  assert.ok(csv.includes('Carbon-first'))
  assert.ok(csv.includes('Default'))
  assert.ok(csv.includes('CloudFlow adaptive'))
})

test('Reporting: generateExperimentPDFDoc generates a valid jsPDF document', () => {
  const doc = generateExperimentPDFDoc(sampleExperiment)
  assert.ok(doc)
  const output = doc.output('datauristring')
  assert.ok(output.startsWith('data:application/pdf'))
})
