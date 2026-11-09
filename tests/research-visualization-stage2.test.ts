import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  buildHistogramBins,
  buildMultiPolicyHistogram,
  buildEmpiricalCdf,
  buildMultiPolicyCdf,
  summarizeEmpiricalQuantiles,
} from '../lib/metrics/distribution.ts'
import { calculatePercentile } from '../lib/metrics/calculations.ts'
import { runBatchResearch } from '../lib/research/batch-engine.ts'
import { simulatePolicyOnWorkload } from '../lib/simulation/engine.ts'
import { DeterministicPRNG, generateWorkloadRequests } from '../lib/simulation/workload.ts'
import { DEFAULT_CANDIDATES } from '../lib/simulation/defaults.ts'
import type { PolicyType } from '../lib/types/scheduler.ts'

describe('Stage 2: Empirical Latency Distribution & Mathematical Formulations', () => {
  const sampleLatencies = [
    50, 65, 80, 95, 110, 115, 120, 130, 140, 150,
    160, 175, 190, 210, 230, 250, 270, 310, 390, 500,
  ] // 20 values

  it('calculates exact empirical percentiles correctly using calculatePercentile', () => {
    // 20 values:
    // P50 rank = ceil(0.5 * 20) - 1 = 9 -> index 9 = 150
    // P90 rank = ceil(0.9 * 20) - 1 = 17 -> index 17 = 310
    // P95 rank = ceil(0.95 * 20) - 1 = 18 -> index 18 = 390
    // P99 rank = ceil(0.99 * 20) - 1 = 19 -> index 19 = 500
    assert.strictEqual(calculatePercentile(sampleLatencies, 50), 150)
    assert.strictEqual(calculatePercentile(sampleLatencies, 90), 310)
    assert.strictEqual(calculatePercentile(sampleLatencies, 95), 390)
    assert.strictEqual(calculatePercentile(sampleLatencies, 99), 500)
    assert.strictEqual(calculatePercentile([], 95), 0)
  })

  it('builds histogram bins with accurate count and frequency percentages', () => {
    const bins25 = buildHistogramBins(sampleLatencies, 25)
    assert.ok(bins25.length > 0)

    const totalCount = bins25.reduce((acc, b) => acc + b.count, 0)
    assert.strictEqual(totalCount, sampleLatencies.length)

    const totalFreq = bins25.reduce((acc, b) => acc + b.frequencyPercent, 0)
    assert.ok(Math.abs(totalFreq - 100) < 0.5, `Frequency sum ${totalFreq} should be ~100%`)

    // Handles empty input safely
    assert.deepStrictEqual(buildHistogramBins([]), [])
    assert.deepStrictEqual(buildHistogramBins(sampleLatencies, 0), [])
  })

  it('supports configurable bin widths (10ms, 25ms, 50ms)', () => {
    const bins10 = buildHistogramBins(sampleLatencies, 10)
    const bins25 = buildHistogramBins(sampleLatencies, 25)
    const bins50 = buildHistogramBins(sampleLatencies, 50)

    // Finer bin width produces more bins
    assert.ok(bins10.length > bins25.length)
    assert.ok(bins25.length > bins50.length)

    // In all widths, total counted items equal sample size
    assert.strictEqual(bins10.reduce((s, b) => s + b.count, 0), sampleLatencies.length)
    assert.strictEqual(bins25.reduce((s, b) => s + b.count, 0), sampleLatencies.length)
    assert.strictEqual(bins50.reduce((s, b) => s + b.count, 0), sampleLatencies.length)
  })

  it('builds synchronized multi-policy histogram across different latency profiles', () => {
    const latencyMap: Partial<Record<PolicyType, number[]>> = {
      'CloudFlow adaptive': [100, 110, 120, 130, 140],
      'Latency-first': [90, 95, 105, 115, 125],
      'Cost-first': [150, 180, 210, 240, 270],
    }

    const { bins, policies } = buildMultiPolicyHistogram(latencyMap, 25)
    assert.strictEqual(policies.length, 3)
    assert.ok(bins.length > 0)

    // All bins should define binLabel, binStart, binEnd
    for (const row of bins) {
      assert.ok(typeof row.binStart === 'number')
      assert.ok(typeof row.binEnd === 'number')
      assert.ok(row.binLabel.includes('–'))
      assert.ok(row.binEnd > row.binStart)
    }

    // Sum of counts for each policy across bins must equal original counts
    for (const pol of policies) {
      const sum = bins.reduce((acc, row) => acc + ((row[pol] as number) || 0), 0)
      assert.strictEqual(sum, latencyMap[pol]!.length)
    }
  })

  it('generates strictly monotonic empirical cumulative distribution function (CDF)', () => {
    const cdf = buildEmpiricalCdf(sampleLatencies)
    assert.strictEqual(cdf.length, sampleLatencies.length)

    // Check monotonicity: each point should have cumulativeProbabilityPercent >= previous
    let prevProb = 0
    let prevLat = -Infinity
    for (const pt of cdf) {
      assert.ok(pt.latencyMs >= prevLat, `Latency should be non-decreasing: ${pt.latencyMs} >= ${prevLat}`)
      assert.ok(pt.cumulativeProbabilityPercent >= prevProb, `CDF prob should be monotonic: ${pt.cumulativeProbabilityPercent} >= ${prevProb}`)
      assert.ok(pt.cumulativeProbabilityPercent <= 100, 'CDF prob must not exceed 100%')
      prevProb = pt.cumulativeProbabilityPercent
      prevLat = pt.latencyMs
    }

    // Final point must be 100%
    assert.strictEqual(cdf[cdf.length - 1].cumulativeProbabilityPercent, 100)
    assert.deepStrictEqual(buildEmpiricalCdf([]), [])
  })

  it('builds aligned multi-policy empirical CDF on a shared continuous evaluation grid', () => {
    const latencyMap: Partial<Record<PolicyType, number[]>> = {
      'CloudFlow adaptive': [80, 100, 120, 140, 160],
      'Cost-first': [200, 250, 300, 350, 400],
    }

    const { cdfData, policies } = buildMultiPolicyCdf(latencyMap, 20)
    assert.strictEqual(policies.length, 2)
    assert.ok(cdfData.length > 0)

    // CloudFlow adaptive (faster) should reach ~100% cumulative probability much earlier than Cost-first
    const earlyPoint = cdfData.find((pt) => pt.latencyMs >= 170)
    if (earlyPoint) {
      assert.strictEqual(earlyPoint['CloudFlow adaptive'], 100)
      assert.ok(earlyPoint['Cost-first'] < 50, 'Cost-first should have much lower CDF at 170ms')
    }
  })

  it('summarizes empirical quantiles and SLA violation rates accurately', () => {
    const summary = summarizeEmpiricalQuantiles(sampleLatencies, 250)
    assert.strictEqual(summary.sampleCount, 20)
    assert.strictEqual(summary.min, 50)
    assert.strictEqual(summary.max, 500)
    assert.strictEqual(summary.p50, 150)
    assert.strictEqual(summary.p95, 390)

    // Values > 250: [270, 310, 390, 500] = 4 out of 20 = 20.00%
    assert.strictEqual(summary.slaViolationRatePercent, 20)
  })
})

describe('Stage 2: Discrete-Event Container Lifecycle & Trace Parity Engine Extensions', () => {
  it('enriches simulated request traces with container identifiers and lifecycle metadata', () => {
    const prng = new DeterministicPRNG(4242)
    const requests = generateWorkloadRequests(50, 10, 'Poisson', prng)
    const result = simulatePolicyOnWorkload(
      requests,
      'CloudFlow adaptive',
      DEFAULT_CANDIDATES,
      250,
      undefined,
      4242
    )

    assert.ok(result.traces.length > 0)
    const sampleTrace = result.traces[0]

    assert.ok(sampleTrace.containerId, 'Trace must assign containerId')
    assert.ok(typeof sampleTrace.activeConcurrency === 'number', 'Trace must record activeConcurrency')
    assert.ok(typeof sampleTrace.serviceStartTimeMs === 'number', 'Trace must record serviceStartTimeMs')
    assert.ok(typeof sampleTrace.serviceFinishTimeMs === 'number', 'Trace must record serviceFinishTimeMs')
    assert.ok(
      ['cold_start_scale_out', 'warm_reuse', 'queue_delayed'].includes(sampleTrace.lifecycleState || ''),
      `lifecycleState '${sampleTrace.lifecycleState}' must be recognized`
    )

    // Lifecycle events should be populated
    assert.ok(Array.isArray(result.lifecycleEvents), 'result.lifecycleEvents must be an array')
    assert.ok(result.lifecycleEvents!.length > 0, 'Lifecycle events must be logged')

    const firstEvent = result.lifecycleEvents![0]
    assert.ok(typeof firstEvent.timestampMs === 'number')
    assert.ok(typeof firstEvent.containerId === 'string')
    assert.ok(['created', 'warm_reuse', 'queue_wait', 'expired'].includes(firstEvent.eventType))
  })

  it('includes downsampled latency observations and representative traces in runBatchResearch', () => {
    const batch = runBatchResearch({
      seedCount: 30,
      requestCount: 50,
      startingSeed: 100,
      workloadType: 'Medium',
      arrivalPattern: 'Poisson',
      slaLatencyThresholdMs: 250,
    })

    assert.strictEqual(batch.status, 'success')
    assert.ok(batch.latencyObservations, 'batch must contain latencyObservations')
    assert.ok(batch.representativeTraces, 'batch must contain representativeTraces')
    assert.ok(batch.representativeLifecycleEvents, 'batch must contain representativeLifecycleEvents')

    // Every policy has observations up to sampleLimit
    for (const policy of ['CloudFlow adaptive', 'Latency-first', 'Cost-first', 'Carbon-first', 'Default'] as PolicyType[]) {
      const obs = batch.latencyObservations[policy]
      assert.ok(Array.isArray(obs))
      assert.ok(obs.length > 0)
      assert.ok(obs.length <= 1500)

      // Policy statistics should expose pooledQuantiles
      const stats = batch.policyStatistics[policy]
      assert.ok(stats.pooledQuantiles, `${policy} must have pooledQuantiles`)
      assert.ok(typeof stats.pooledQuantiles!.p50 === 'number')
      assert.ok(typeof stats.pooledQuantiles!.p90 === 'number')
      assert.ok(typeof stats.pooledQuantiles!.p95 === 'number')
      assert.ok(typeof stats.pooledQuantiles!.p99 === 'number')
      assert.ok(stats.pooledQuantiles!.p99 >= stats.pooledQuantiles!.p95)
      assert.ok(stats.pooledQuantiles!.p95 >= stats.pooledQuantiles!.p50)
    }

    // Representative traces match first seed request count
    assert.strictEqual(batch.representativeTraces!.length, 50)
  })
})
