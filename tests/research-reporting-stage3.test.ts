import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  calculateCohenDzConfidenceInterval,
  computeHolmBonferroniMatrix,
} from '../lib/research/statistics.ts'
import {
  generateBatchResearchCSV,
  generateBatchResearchPDFDoc,
} from '../lib/reports/export.ts'
import { runBatchResearch } from '../lib/research/batch-engine.ts'
import type { BatchComparisonItem, BatchResearchResponseBody, PolicyType } from '../lib/types/scheduler.ts'

describe('Stage 3: Statistical Forest Plot & Confidence Interval Calculations', () => {
  it('calculates paired Cohen\'s dz 95% confidence intervals using exact Student\'s t distribution', () => {
    // df = 29 (n = 30 seeds), dz = 0.8 (large effect)
    const ci = calculateCohenDzConfidenceInterval(0.8, 29, 0.05)

    assert.strictEqual(ci.cohensDz, 0.8)
    assert.ok(ci.standardError > 0, 'Standard error must be positive')
    assert.ok(ci.criticalT > 2.0, 'Critical t for df=29 should be ~2.045')
    assert.ok(ci.ciLower < 0.8, 'Lower bound must be less than point estimate')
    assert.ok(ci.ciUpper > 0.8, 'Upper bound must be greater than point estimate')
    assert.ok(ci.ciLower > 0.2, 'Large effect should remain positive at n=30')

    // Larger sample size (df = 99, n = 100) must produce a tighter confidence interval
    const ciLargeN = calculateCohenDzConfidenceInterval(0.8, 99, 0.05)
    assert.ok(
      ciLargeN.standardError < ci.standardError,
      'Standard error must decrease as sample size increases'
    )
    assert.ok(
      (ciLargeN.ciUpper - ciLargeN.ciLower) < (ci.ciUpper - ci.ciLower),
      'Confidence interval width must decrease with larger sample size'
    )
  })

  it('handles edge cases safely in Cohen\'s dz CI calculation', () => {
    // Zero degrees of freedom (n <= 1)
    const edgeZero = calculateCohenDzConfidenceInterval(0.5, 0, 0.05)
    assert.strictEqual(edgeZero.ciLower, 0.5)
    assert.strictEqual(edgeZero.ciUpper, 0.5)

    // Null effect (dz = 0)
    const nullEffect = calculateCohenDzConfidenceInterval(0.0, 29, 0.05)
    assert.strictEqual(nullEffect.cohensDz, 0)
    assert.ok(nullEffect.ciLower < 0)
    assert.ok(nullEffect.ciUpper > 0)
    assert.strictEqual(Math.abs(nullEffect.ciLower), nullEffect.ciUpper)
  })
})

describe('Stage 3: Dynamic Holm-Bonferroni Step-Down Significance Matrix', () => {
  it('dynamically computes Holm-Bonferroni thresholds without hardcoding hypothesis counts', () => {
    // Synthetic 4-hypothesis test
    const mockComps: BatchComparisonItem[] = [
      {
        metric: 'costUSD',
        baselinePolicy: 'Latency-first',
        adaptiveMean: 0.005,
        baselineMean: 0.008,
        meanDifference: -0.003,
        percentDifference: -37.5,
        degreesOfFreedom: 29,
        tStatistic: -5.4,
        pValue: 0.0001,
        adjustedPValue: 0.0004,
        isStatisticallySignificant: true,
        cohensDz: -1.2,
        effectSizeMagnitude: 'Large',
      },
      {
        metric: 'carbonG',
        baselinePolicy: 'Cost-first',
        adaptiveMean: 12.0,
        baselineMean: 13.0,
        meanDifference: -1.0,
        percentDifference: -7.7,
        degreesOfFreedom: 29,
        tStatistic: -2.8,
        pValue: 0.008,
        adjustedPValue: 0.024,
        isStatisticallySignificant: true,
        cohensDz: -0.6,
        effectSizeMagnitude: 'Medium',
      },
      {
        metric: 'averageLatencyMs',
        baselinePolicy: 'Default',
        adaptiveMean: 180,
        baselineMean: 195,
        meanDifference: -15,
        percentDifference: -7.7,
        degreesOfFreedom: 29,
        tStatistic: -2.1,
        pValue: 0.045,
        adjustedPValue: 0.09,
        isStatisticallySignificant: false,
        cohensDz: -0.35,
        effectSizeMagnitude: 'Small',
      },
      {
        metric: 'coldStartRatePercent',
        baselinePolicy: 'Carbon-first',
        adaptiveMean: 8.0,
        baselineMean: 8.2,
        meanDifference: -0.2,
        percentDifference: -2.4,
        degreesOfFreedom: 29,
        tStatistic: -0.5,
        pValue: 0.62,
        adjustedPValue: 0.62,
        isStatisticallySignificant: false,
        cohensDz: -0.08,
        effectSizeMagnitude: 'Negligible',
      },
    ]

    const matrix = computeHolmBonferroniMatrix(mockComps, 0.05)
    assert.strictEqual(matrix.length, 4, 'Matrix length must dynamically equal input comparisons count')

    // Ranks must be 1, 2, 3, 4 sorted by raw p-value
    assert.strictEqual(matrix[0].rank, 1)
    assert.strictEqual(matrix[0].rawPValue, 0.0001)
    // Critical alpha for rank 1: alpha / (4 - 1 + 1) = 0.05 / 4 = 0.0125
    assert.strictEqual(matrix[0].criticalAlpha, 0.0125)
    assert.strictEqual(matrix[0].rejectionDecision, 'Reject H0')

    // Rank 2: alpha / (4 - 2 + 1) = 0.05 / 3 = 0.016667
    assert.strictEqual(matrix[1].rank, 2)
    assert.strictEqual(matrix[1].rawPValue, 0.008)
    assert.strictEqual(matrix[1].criticalAlpha, 0.016667)
    assert.strictEqual(matrix[1].rejectionDecision, 'Reject H0')

    // Rank 3: alpha / (4 - 3 + 1) = 0.05 / 2 = 0.025
    assert.strictEqual(matrix[2].rank, 3)
    assert.strictEqual(matrix[2].rawPValue, 0.045)
    assert.strictEqual(matrix[2].criticalAlpha, 0.025)
    // raw p = 0.045 > 0.025 -> uncorrected was significant (0.045 < 0.05), but Holm fails to reject!
    assert.strictEqual(matrix[2].uncorrectedSignificant, true)
    assert.strictEqual(matrix[2].holmSignificant, false)
    assert.strictEqual(matrix[2].rejectionDecision, 'Fail to Reject')

    // Rank 4: alpha / (4 - 4 + 1) = 0.05 / 1 = 0.05
    assert.strictEqual(matrix[3].rank, 4)
    assert.strictEqual(matrix[3].rawPValue, 0.62)
    assert.strictEqual(matrix[3].criticalAlpha, 0.05)
    assert.strictEqual(matrix[3].rejectionDecision, 'Fail to Reject')
  })

  it('handles empty or singleton comparisons safely', () => {
    assert.deepStrictEqual(computeHolmBonferroniMatrix([]), [])
  })
})

describe('Stage 3: Scientific CSV and PDF Export Integrity', () => {
  const batchResult: BatchResearchResponseBody = runBatchResearch({
    seedCount: 30,
    requestCount: 50,
    startingSeed: 42,
    workloadType: 'Medium',
    arrivalPattern: 'Poisson',
    slaLatencyThresholdMs: 250,
  })

  it('generates an RFC-4180 compliant CSV export with all required sections and disclaimer', () => {
    const csv = generateBatchResearchCSV(batchResult)

    // Verify key sections are present
    assert.ok(csv.includes('CloudFlow Research Report: Multi-Seed Statistical Benchmark'))
    assert.ok(csv.includes('SIMULATION DISCLAIMER'))
    assert.ok(csv.includes('=== BENCHMARK METADATA & REPRODUCIBILITY ==='))
    assert.ok(csv.includes('Seed Range,"[42 ... 71]"'))
    assert.ok(csv.includes('=== POOLED REQUEST-LEVEL LATENCY QUANTILES (TRUE POPULATION PERCENTILES) ==='))
    assert.ok(csv.includes('Pooled P50 (ms)'))
    assert.ok(csv.includes('Pooled P90 (ms)'))
    assert.ok(csv.includes('Pooled P95 (ms)'))
    assert.ok(csv.includes('Pooled P99 (ms)'))
    assert.ok(csv.includes('=== POLICY DESCRIPTIVE STATISTICS (95% CONFIDENCE INTERVALS) ==='))
    assert.ok(csv.includes('=== PAIRED STUDENT T-TESTS & HOLM-BONFERRONI CORRECTION ==='))
    assert.ok(csv.includes('Rank (k)'))
    assert.ok(csv.includes('Critical Alpha'))
    assert.ok(csv.includes('Cohen\'s dz Effect Size'))
    assert.ok(csv.includes('=== REPRODUCIBILITY & SIMULATION LIMITATIONS ==='))

    // Verify all 5 policies are present in descriptive statistics
    for (const policy of ['CloudFlow adaptive', 'Latency-first', 'Cost-first', 'Carbon-first', 'Default'] as PolicyType[]) {
      assert.ok(csv.includes(`"${policy}"`), `CSV must include ${policy}`)
    }
  })

  it('generates a multi-page publication-grade PDF report with quantiles and hypothesis tables', () => {
    const doc = generateBatchResearchPDFDoc(batchResult)

    assert.ok(doc, 'PDF Document must be created')
    // Should have 2 pages
    const pageCount = doc.getNumberOfPages()
    assert.strictEqual(pageCount, 2, 'PDF must contain exactly 2 structured pages')

    // Document must be serializable without errors
    const output = doc.output('arraybuffer')
    assert.ok(output.byteLength > 1000, 'PDF buffer must contain binary output')
  })

  it('verifies pooled quantile mathematical consistency across all policies', () => {
    for (const policy of ['CloudFlow adaptive', 'Latency-first', 'Cost-first', 'Carbon-first', 'Default'] as PolicyType[]) {
      const stats = batchResult.policyStatistics[policy]
      assert.ok(stats.pooledQuantiles, `${policy} must have pooledQuantiles`)
      const q = stats.pooledQuantiles!

      // Monotonic quantiles: P50 <= P90 <= P95 <= P99
      assert.ok(q.p50 <= q.p90, `${policy} P50 (${q.p50}) must be <= P90 (${q.p90})`)
      assert.ok(q.p90 <= q.p95, `${policy} P90 (${q.p90}) must be <= P95 (${q.p95})`)
      assert.ok(q.p95 <= q.p99, `${policy} P95 (${q.p95}) must be <= P99 (${q.p99})`)
    }
  })
})
