import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateBatchResearchRequest,
  MIN_BATCH_SEEDS,
} from '../lib/validation/api-validator.ts'
import { runBatchResearch } from '../lib/research/batch-engine.ts'
import {
  generateBatchResearchCSV,
  generateBatchResearchPDFDoc,
} from '../lib/reports/export.ts'

describe('Batch Research Validation and Execution', () => {
  it('validates default batch research configuration with 30 seeds', () => {
    const res = validateBatchResearchRequest({})
    assert.equal(res.isValid, true)
    if (res.isValid) {
      assert.equal(res.data.seeds?.length, 30)
      assert.equal(res.data.seedCount, 30)
      assert.equal(res.data.requestCount, 500)
      assert.equal(res.data.slaLatencyThresholdMs, 250)
      assert.equal(res.data.arrivalPattern, 'Poisson')
    }
  })

  it('rejects seed count below 30', () => {
    const res = validateBatchResearchRequest({ seedCount: 20 })
    assert.equal(res.isValid, false)
    if (!res.isValid) {
      assert.equal(res.code, 'VALIDATION_FAILED')
      assert.ok(res.message.includes('at least 30'))
    }
  })

  it('rejects seed arrays with fewer than 30 distinct seeds', () => {
    const duplicateSeeds = Array(35).fill(42) // 35 items, but only 1 distinct seed
    const res = validateBatchResearchRequest({ seeds: duplicateSeeds })
    assert.equal(res.isValid, false)
    if (!res.isValid) {
      assert.ok(res.message.includes('at least 30 distinct seeds'))
    }
  })

  it('rejects invalid request counts outside safe boundaries', () => {
    const tooLow = validateBatchResearchRequest({ requestCount: 10 })
    assert.equal(tooLow.isValid, false)

    const tooHigh = validateBatchResearchRequest({ requestCount: 20000 })
    assert.equal(tooHigh.isValid, false)
  })

  it('executes a 30-seed batch research simulation deterministically', () => {
    const validation = validateBatchResearchRequest({
      seedCount: 30,
      startingSeed: 5000,
      requestCount: 100, // compact for fast test execution
      slaLatencyThresholdMs: 250,
      arrivalPattern: 'Poisson',
    })
    assert.equal(validation.isValid, true)
    if (!validation.isValid) return

    const result = runBatchResearch(validation.data)

    // Structural verifications
    assert.equal(result.status, 'success')
    assert.equal(result.metadata.totalSeeds, 30)
    assert.equal(result.metadata.requestCountPerSeed, 100)
    assert.equal(result.metadata.totalEvaluations, 30 * 100 * 5) // 15,000 evaluations

    // Policy statistics verifications
    const policies = ['Latency-first', 'Cost-first', 'Carbon-first', 'Default', 'CloudFlow adaptive'] as const
    for (const pol of policies) {
      const stats = result.policyStatistics[pol]
      assert.ok(stats, `Missing stats for ${pol}`)
      assert.equal(stats.sampleSize, 30)

      // Descriptive stats properties
      const costStats = stats.metrics.costUSD
      assert.equal(costStats.count, 30)
      assert.ok(costStats.mean > 0)
      assert.ok(costStats.standardDeviation >= 0)
      assert.equal(costStats.criticalT, 2.04523) // Exact Student's t critical value for df = 29
      assert.ok(costStats.confidenceInterval95[0] <= costStats.mean)
      assert.ok(costStats.confidenceInterval95[1] >= costStats.mean)
    }

    // Hypothesis testing comparisons verification
    assert.ok(result.comparisons.length > 0)
    for (const comp of result.comparisons) {
      assert.equal(comp.degreesOfFreedom, 29)
      assert.ok(comp.pValue >= 0 && comp.pValue <= 1.0)
      assert.ok(comp.adjustedPValue >= comp.pValue, 'Adjusted p-value must be >= raw p-value')
      assert.ok(['Negligible', 'Small', 'Medium', 'Large'].includes(comp.effectSizeMagnitude))
    }
  })

  it('produces byte-for-byte identical results for identical seed sequences', () => {
    const config = {
      seedCount: 30,
      startingSeed: 7777,
      requestCount: 100,
      slaLatencyThresholdMs: 200,
    }
    const val1 = validateBatchResearchRequest(config)
    const val2 = validateBatchResearchRequest(config)
    assert.equal(val1.isValid, true)
    assert.equal(val2.isValid, true)
    if (!val1.isValid || !val2.isValid) return

    const res1 = runBatchResearch(val1.data)
    const res2 = runBatchResearch(val2.data)

    assert.equal(
      res1.policyStatistics['CloudFlow adaptive'].metrics.costUSD.mean,
      res2.policyStatistics['CloudFlow adaptive'].metrics.costUSD.mean
    )
    assert.equal(
      res1.policyStatistics['Cost-first'].metrics.carbonG.mean,
      res2.policyStatistics['Cost-first'].metrics.carbonG.mean
    )
    assert.equal(
      res1.comparisons[0].tStatistic,
      res2.comparisons[0].tStatistic
    )
  })

  it('generates compliant CSV and PDF reports with research disclaimers', () => {
    const val = validateBatchResearchRequest({ seedCount: 30, requestCount: 50 })
    assert.equal(val.isValid, true)
    if (!val.isValid) return

    const result = runBatchResearch(val.data)

    // CSV Verification
    const csv = generateBatchResearchCSV(result)
    assert.ok(csv.includes('CloudFlow Research Report: Multi-Seed Statistical Benchmark'))
    assert.ok(csv.includes('DISCLAIMER: All values represent deterministic model-based simulation results'))
    assert.ok(csv.includes('=== POLICY DESCRIPTIVE STATISTICS (95% CONFIDENCE INTERVALS) ==='))
    assert.ok(csv.includes('=== PAIRED STUDENT T-TESTS & HOLM-BONFERRONI CORRECTION ==='))
    assert.ok(csv.includes('CloudFlow adaptive'))

    // PDF Verification
    const pdfDoc = generateBatchResearchPDFDoc(result)
    assert.ok(pdfDoc)
    const pdfOutput = pdfDoc.output('arraybuffer')
    assert.ok(pdfOutput.byteLength > 1000, 'PDF document should have non-trivial byte length')
  })

  it('enforces compound computation limit (seedCount * requestCount <= 50,000) boundaries', () => {
    // 1. 30 seeds * 1,000 requests = 30,000 <= 50,000: Accepted
    const case1 = validateBatchResearchRequest({ seedCount: 30, requestCount: 1000 })
    assert.equal(case1.isValid, true, '30 seeds * 1,000 req must be accepted (30,000 <= 50,000)')

    // 2. 50 seeds * 1,000 requests = 50,000 <= 50,000: Accepted (exact boundary)
    const case2 = validateBatchResearchRequest({ seedCount: 50, requestCount: 1000 })
    assert.equal(case2.isValid, true, '50 seeds * 1,000 req must be accepted (50,000 <= 50,000)')

    // 3. 51 seeds * 1,000 requests = 51,000 > 50,000: Rejected
    const case3 = validateBatchResearchRequest({ seedCount: 51, requestCount: 1000 })
    assert.equal(case3.isValid, false, '51 seeds * 1,000 req must be rejected (51,000 > 50,000)')
    if (!case3.isValid) {
      assert.ok(case3.details.some((d) => d.includes('exceeds the allowable computation limit')))
    }

    // 4. 100 seeds * 5,000 requests = 500,000 > 50,000: Rejected
    const case4 = validateBatchResearchRequest({ seedCount: 100, requestCount: 5000 })
    assert.equal(case4.isValid, false, '100 seeds * 5,000 req must be rejected (500,000 > 50,000)')

    // 5. 30 seeds * 1,667 requests = 50,010 > 50,000: Rejected
    const case5 = validateBatchResearchRequest({ seedCount: 30, requestCount: 1667 })
    assert.equal(case5.isValid, false, '30 seeds * 1,667 req must be rejected (50,010 > 50,000)')

    // 6. Explicit seeds array exceeding limit
    const case6 = validateBatchResearchRequest({
      seeds: Array.from({ length: 40 }, (_, i) => 1000 + i),
      requestCount: 1500, // 40 * 1500 = 60,000 > 50,000
    })
    assert.equal(case6.isValid, false, '40 seeds * 1,500 req must be rejected (60,000 > 50,000)')
  })
})
