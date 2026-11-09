/**
 * CloudFlow Batch Research Engine
 * 
 * Executes statistically rigorous multi-seed benchmarks across all 5 scheduling policies:
 * - Minimum 30 independent deterministic seeds.
 * - Identical workload traces per seed across all evaluated policies.
 * - Comprehensive descriptive statistics (sample mean, variance, standard deviation,
 *   exact Student's t 95% confidence intervals).
 * - Paired Student's t-tests against baseline policies.
 * - Holm-Bonferroni family-wise error rate multiple testing correction.
 * - Cohen's dz effect size magnitude classification.
 */

import type {
  BatchComparisonItem,
  BatchResearchRequestBody,
  BatchResearchResponseBody,
  EvaluatedMetric,
  PolicyBatchStatistics,
  PolicyType,
  ServerlessCandidate,
} from '../types/scheduler.ts'
import { DEFAULT_CANDIDATES } from '../simulation/defaults.ts'
import { ALL_POLICIES, simulatePolicyOnWorkload } from '../simulation/engine.ts'
import { DeterministicPRNG, generateWorkloadRequests } from '../simulation/workload.ts'
import {
  applyHolmBonferroniCorrection,
  calculateDescriptiveStatistics,
  calculatePairedTTest,
} from './statistics.ts'

const EVALUATED_METRICS: EvaluatedMetric[] = [
  'costUSD',
  'carbonG',
  'averageLatencyMs',
  'p95LatencyMs',
  'coldStartRatePercent',
  'slaViolationRatePercent',
  'averageOverheadMs',
]

const BASELINE_POLICIES: PolicyType[] = [
  'Latency-first',
  'Cost-first',
  'Carbon-first',
  'Default',
]

export function runBatchResearch(body: BatchResearchRequestBody): BatchResearchResponseBody {
  const startTime = Date.now()

  const seedCount = body.seedCount ?? 30
  const startingSeed = body.startingSeed ?? 4200
  const seeds: number[] = body.seeds ?? Array.from({ length: seedCount }, (_, i) => startingSeed + i)
  const requestCount = body.requestCount ?? 500
  const durationMinutes = body.durationMinutes ?? 15
  const slaLatencyThresholdMs = body.slaLatencyThresholdMs ?? 250
  const arrivalPattern = body.arrivalPattern ?? 'Poisson'
  const workloadType = body.workloadType ?? 'Medium'
  const candidatePool: ServerlessCandidate[] =
    body.candidates && body.candidates.length > 0 ? body.candidates : DEFAULT_CANDIDATES

  // Store metric samples per policy: Record<PolicyType, Record<EvaluatedMetric, number[]>>
  const policySamples: Record<PolicyType, Record<EvaluatedMetric, number[]>> = {
    'Latency-first': { costUSD: [], carbonG: [], averageLatencyMs: [], p95LatencyMs: [], coldStartRatePercent: [], slaViolationRatePercent: [], averageOverheadMs: [] },
    'Cost-first': { costUSD: [], carbonG: [], averageLatencyMs: [], p95LatencyMs: [], coldStartRatePercent: [], slaViolationRatePercent: [], averageOverheadMs: [] },
    'Carbon-first': { costUSD: [], carbonG: [], averageLatencyMs: [], p95LatencyMs: [], coldStartRatePercent: [], slaViolationRatePercent: [], averageOverheadMs: [] },
    'Default': { costUSD: [], carbonG: [], averageLatencyMs: [], p95LatencyMs: [], coldStartRatePercent: [], slaViolationRatePercent: [], averageOverheadMs: [] },
    'CloudFlow adaptive': { costUSD: [], carbonG: [], averageLatencyMs: [], p95LatencyMs: [], coldStartRatePercent: [], slaViolationRatePercent: [], averageOverheadMs: [] },
  }

  // Iterate over every deterministic seed
  for (const seed of seeds) {
    const prng = new DeterministicPRNG(seed)
    // Generate identical synthetic requests for this seed once
    const requests = generateWorkloadRequests(requestCount, durationMinutes, arrivalPattern, prng)

    // Simulate every policy over the exact same request stream
    for (const policy of ALL_POLICIES) {
      const result = simulatePolicyOnWorkload(
        requests,
        policy,
        candidatePool,
        slaLatencyThresholdMs,
        body.adaptiveWeights,
        seed
      )

      const s = result.summary
      policySamples[policy].costUSD.push(s.totalCostUSD)
      policySamples[policy].carbonG.push(s.totalCarbonG)
      policySamples[policy].averageLatencyMs.push(s.averageLatencyMs)
      policySamples[policy].p95LatencyMs.push(s.p95LatencyMs)
      policySamples[policy].coldStartRatePercent.push(s.coldStartRatePercent)
      policySamples[policy].slaViolationRatePercent.push(s.slaViolationRatePercent)
      policySamples[policy].averageOverheadMs.push(s.averageOverheadMs)
    }
  }

  // Calculate descriptive statistics for each policy and metric
  const policyStatistics = {} as Record<PolicyType, PolicyBatchStatistics>

  for (const policy of ALL_POLICIES) {
    policyStatistics[policy] = {
      policy,
      sampleSize: seeds.length,
      metrics: {
        costUSD: calculateDescriptiveStatistics(policySamples[policy].costUSD),
        carbonG: calculateDescriptiveStatistics(policySamples[policy].carbonG),
        averageLatencyMs: calculateDescriptiveStatistics(policySamples[policy].averageLatencyMs),
        p95LatencyMs: calculateDescriptiveStatistics(policySamples[policy].p95LatencyMs),
        coldStartRatePercent: calculateDescriptiveStatistics(policySamples[policy].coldStartRatePercent),
        slaViolationRatePercent: calculateDescriptiveStatistics(policySamples[policy].slaViolationRatePercent),
        averageOverheadMs: calculateDescriptiveStatistics(policySamples[policy].averageOverheadMs),
      },
    }
  }

  // Perform Paired Comparisons and Holm-Bonferroni correction
  const comparisons: BatchComparisonItem[] = []

  for (const metric of EVALUATED_METRICS) {
    const adaptiveValues = policySamples['CloudFlow adaptive'][metric]

    // Gather paired comparisons across all 4 baselines for this metric family
    const metricComparisons = BASELINE_POLICIES.map((baseline) => {
      const baselineValues = policySamples[baseline][metric]
      const paired = calculatePairedTTest(adaptiveValues, baselineValues)
      return {
        baseline,
        paired,
      }
    })

    // Apply Holm-Bonferroni step-down correction across the 4 baselines for this metric
    const rawPairs = metricComparisons.map((m) => m.paired)
    const correctedPairs = applyHolmBonferroniCorrection(rawPairs, 0.05)

    metricComparisons.forEach((m, idx) => {
      const c = correctedPairs[idx]
      comparisons.push({
        metric,
        baselinePolicy: m.baseline,
        adaptiveMean: c.adaptiveMean,
        baselineMean: c.baselineMean,
        meanDifference: c.meanDifference,
        percentDifference: c.percentDifference,
        degreesOfFreedom: c.degreesOfFreedom,
        tStatistic: c.tStatistic,
        pValue: c.pValue,
        adjustedPValue: c.adjustedPValue ?? c.pValue,
        isStatisticallySignificant: c.isStatisticallySignificant,
        cohensDz: c.cohensDz,
        effectSizeMagnitude: c.effectSizeMagnitude,
      })
    })
  }

  const executionTimeMs = Date.now() - startTime

  return {
    status: 'success',
    batchId: `batch-k${seeds.length}-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    metadata: {
      totalSeeds: seeds.length,
      seeds,
      requestCountPerSeed: requestCount,
      totalEvaluations: seeds.length * requestCount * ALL_POLICIES.length,
      workloadType,
      arrivalPattern,
      slaLatencyThresholdMs,
      executionTimeMs,
      methodology: {
        distribution: "Exact Student's t-distribution for two-tailed p-values and 95% Confidence Intervals",
        multipleComparisonsCorrection: 'Holm-Bonferroni step-down procedure controlling FWER at alpha = 0.05',
        confidenceLevel: '95% (alpha = 0.05)',
        identicalTraceCondition: 'All policies evaluated against identical synthetic request sequences for each seed',
      },
    },
    policyStatistics,
    comparisons,
  }
}
