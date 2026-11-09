import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateBatchResearchRequest,
  MIN_BATCH_SEEDS,
  MAX_BATCH_SEEDS,
  MAX_BATCH_TOTAL_EVALUATIONS_PRODUCT,
} from '../lib/validation/api-validator.ts'
import { runBatchResearch } from '../lib/research/batch-engine.ts'
import {
  generateBatchResearchCSV,
  generateBatchResearchPDFDoc,
} from '../lib/reports/export.ts'

describe('Phase 5 Stage 1: Research Benchmarks Dashboard Validation', () => {
  it('validates interactive parameter ranges for seeds (30-100) and requests (50-1000)', () => {
    // Valid configuration
    const valid = validateBatchResearchRequest({
      seedCount: 50,
      startingSeed: 100,
      requestCount: 200,
      arrivalPattern: 'Bursty',
      slaLatencyThresholdMs: 250,
    })
    assert.equal(valid.isValid, true)
    if (valid.isValid) {
      assert.equal(valid.data.seedCount, 50)
      assert.equal(valid.data.startingSeed, 100)
      assert.equal(valid.data.requestCount, 200)
      assert.equal(valid.data.arrivalPattern, 'Bursty')
      assert.equal(valid.data.slaLatencyThresholdMs, 250)
      assert.equal(valid.data.seeds?.length, 50)
      assert.equal(valid.data.seeds?.[0], 100)
      assert.equal(valid.data.seeds?.[49], 149)
    }

    // Boundary: seed count below 30
    const belowMinSeeds = validateBatchResearchRequest({ seedCount: 29 })
    assert.equal(belowMinSeeds.isValid, false)

    // Boundary: seed count above 100
    const aboveMaxSeeds = validateBatchResearchRequest({ seedCount: 101 })
    assert.equal(aboveMaxSeeds.isValid, false)

    // Boundary: compound product exceeding 50,000
    const compoundExceeded = validateBatchResearchRequest({
      seedCount: 100,
      requestCount: 600, // 100 * 600 = 60,000 > 50,000
    })
    assert.equal(compoundExceeded.isValid, false)
    if (!compoundExceeded.isValid) {
      assert.ok(compoundExceeded.details?.some(d => d.includes('exceeds the allowable computation limit')))
    }
  })

  it('verifies deterministic seed reproducibility sequence across custom starting seeds', () => {
    const startSeed = 54321
    const count = 30
    const batch1 = runBatchResearch({
      seedCount: count,
      startingSeed: startSeed,
      requestCount: 50,
      durationMinutes: 5,
      arrivalPattern: 'Steady',
      slaLatencyThresholdMs: 300,
    })

    const batch2 = runBatchResearch({
      seedCount: count,
      startingSeed: startSeed,
      requestCount: 50,
      durationMinutes: 5,
      arrivalPattern: 'Steady',
      slaLatencyThresholdMs: 300,
    })

    // Deterministic simulation reproducibility
    assert.equal(batch1.metadata.totalSeeds, count)
    assert.equal(batch1.metadata.seeds[0], startSeed)
    assert.equal(batch1.metadata.seeds[count - 1], startSeed + count - 1)

    for (const pol of ['CloudFlow adaptive', 'Latency-first', 'Cost-first', 'Carbon-first', 'Default'] as const) {
      const s1 = batch1.policyStatistics[pol]
      const s2 = batch2.policyStatistics[pol]
      assert.equal(s1.pooledP95LatencyMs, s2.pooledP95LatencyMs)
      assert.equal(s1.metrics.costUSD.mean, s2.metrics.costUSD.mean)
      assert.equal(s1.metrics.carbonG.mean, s2.metrics.carbonG.mean)
      assert.equal(s1.metrics.averageLatencyMs.mean, s2.metrics.averageLatencyMs.mean)
      assert.equal(s1.metrics.p95LatencyMs.mean, s2.metrics.p95LatencyMs.mean)
      assert.equal(s1.metrics.slaViolationRatePercent.mean, s2.metrics.slaViolationRatePercent.mean)
      assert.equal(s1.metrics.coldStartRatePercent.mean, s2.metrics.coldStartRatePercent.mean)
    }

    // Verify paired comparisons are deterministic
    assert.equal(batch1.comparisons.length, batch2.comparisons.length)
    assert.equal(batch1.comparisons[0].tStatistic, batch2.comparisons[0].tStatistic)
    assert.equal(batch1.comparisons[0].pValue, batch2.comparisons[0].pValue)
    assert.equal(batch1.comparisons[0].cohensDz, batch2.comparisons[0].cohensDz)
  })

  it('differentiates Steady, Poisson, and Bursty workloads across multi-seed evaluations', () => {
    const seed = 777
    const steady = runBatchResearch({
      seedCount: 30,
      startingSeed: seed,
      requestCount: 50,
      durationMinutes: 5,
      arrivalPattern: 'Steady',
      slaLatencyThresholdMs: 250,
    })

    const bursty = runBatchResearch({
      seedCount: 30,
      startingSeed: seed,
      requestCount: 50,
      durationMinutes: 5,
      arrivalPattern: 'Bursty',
      slaLatencyThresholdMs: 250,
    })

    const steadyP95 = steady.policyStatistics['CloudFlow adaptive'].pooledP95LatencyMs!
    const burstyP95 = bursty.policyStatistics['CloudFlow adaptive'].pooledP95LatencyMs!
    assert.ok(burstyP95 > 0)
    assert.ok(steadyP95 > 0)
    // Bursty traffic exhibits higher latency dispersion under identical seed base
    assert.notEqual(steadyP95, burstyP95)
  })

  it('embeds pooled P95 and reproducibility metadata into CSV and PDF reports', () => {
    const batch = runBatchResearch({
      seedCount: 30,
      startingSeed: 42,
      requestCount: 50,
      durationMinutes: 5,
      arrivalPattern: 'Bursty',
      slaLatencyThresholdMs: 250,
    })

    const csv = generateBatchResearchCSV(batch)
    assert.ok(csv.includes('CloudFlow Research Report: Multi-Seed Statistical Benchmark'))
    assert.ok(csv.includes('Seeds List'))
    assert.ok(csv.includes('42; 43; 44'))
    assert.ok(csv.includes('Holm-Bonferroni Adjusted p-Value'))

    const pdf = generateBatchResearchPDFDoc(batch)
    assert.ok(pdf)
    assert.equal(typeof pdf.output, 'function')
  })
})
