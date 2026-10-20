import type { ExperimentRecord, PersistedPolicyResult, PolicyType } from '../types/scheduler.ts'

export interface DashboardAggregateMetrics {
  totalExperiments: number
  totalRequestsEvaluated: number
  totalCostUSD: number
  totalCarbonG: number
  weightedAverageLatencyMs: number
  weightedColdStartRatePercent: number
  weightedSlaViolationRatePercent: number
  weightedAverageOverheadMs: number
  maxP95LatencyMs: number
  hasData: boolean
}

/**
 * Calculates mathematically sound aggregate metrics across multiple saved experiments.
 * Weighted by request count rather than naive arithmetic means of percentages or rates.
 */
export function calculateAggregateMetrics(
  experiments: ExperimentRecord[],
  targetPolicy: PolicyType = 'CloudFlow adaptive'
): DashboardAggregateMetrics {
  if (!experiments || experiments.length === 0) {
    return {
      totalExperiments: 0,
      totalRequestsEvaluated: 0,
      totalCostUSD: 0,
      totalCarbonG: 0,
      weightedAverageLatencyMs: 0,
      weightedColdStartRatePercent: 0,
      weightedSlaViolationRatePercent: 0,
      weightedAverageOverheadMs: 0,
      maxP95LatencyMs: 0,
      hasData: false,
    }
  }

  let totalRequests = 0
  let totalCostUSD = 0
  let totalCarbonG = 0
  let weightedLatencySum = 0
  let weightedColdStartSum = 0
  let weightedSlaViolationSum = 0
  let weightedOverheadSum = 0
  let maxP95 = 0

  for (const exp of experiments) {
    const policyResult =
      exp.policyResults.find((pr) => pr.policy === targetPolicy) || exp.policyResults[0]

    const reqCount = policyResult ? policyResult.totalRequests : exp.requestCount
    totalRequests += reqCount

    if (policyResult) {
      totalCostUSD += policyResult.totalCostUSD
      totalCarbonG += policyResult.totalCarbonG
      weightedLatencySum += policyResult.averageLatencyMs * reqCount
      weightedColdStartSum += policyResult.coldStartRatePercent * reqCount
      weightedSlaViolationSum += policyResult.slaViolationRatePercent * reqCount
      weightedOverheadSum += policyResult.averageOverheadMs * reqCount
      if (policyResult.p95LatencyMs > maxP95) {
        maxP95 = policyResult.p95LatencyMs
      }
    }
  }

  const weightedAverageLatencyMs =
    totalRequests > 0 ? Number((weightedLatencySum / totalRequests).toFixed(2)) : 0
  const weightedColdStartRatePercent =
    totalRequests > 0 ? Number((weightedColdStartSum / totalRequests).toFixed(2)) : 0
  const weightedSlaViolationRatePercent =
    totalRequests > 0 ? Number((weightedSlaViolationSum / totalRequests).toFixed(2)) : 0
  const weightedAverageOverheadMs =
    totalRequests > 0 ? Number((weightedOverheadSum / totalRequests).toFixed(3)) : 0

  return {
    totalExperiments: experiments.length,
    totalRequestsEvaluated: totalRequests,
    totalCostUSD: Number(totalCostUSD.toFixed(4)),
    totalCarbonG: Number(totalCarbonG.toFixed(2)),
    weightedAverageLatencyMs,
    weightedColdStartRatePercent,
    weightedSlaViolationRatePercent,
    weightedAverageOverheadMs,
    maxP95LatencyMs: maxP95,
    hasData: true,
  }
}

export interface PolicyMetricComparison {
  policy: PolicyType
  totalRequests: number
  averageLatencyMs: number
  p95LatencyMs: number
  totalCostUSD: number
  totalCarbonG: number
  coldStartRatePercent: number
  slaViolationRatePercent: number
  averageOverheadMs: number
  isBestCost: boolean
  isBestCarbon: boolean
  isBestLatency: boolean
  isBestSla: boolean
}

/**
 * Identifies the best policy results for each key metric across a fair comparison set.
 * Note: Lower values are better for all these optimization metrics.
 */
export function comparePolicies(policyResults: PersistedPolicyResult[]): PolicyMetricComparison[] {
  if (!policyResults || policyResults.length === 0) return []

  const minCost = Math.min(...policyResults.map((p) => p.totalCostUSD))
  const minCarbon = Math.min(...policyResults.map((p) => p.totalCarbonG))
  const minLatency = Math.min(...policyResults.map((p) => p.averageLatencyMs))
  const minSlaViolation = Math.min(...policyResults.map((p) => p.slaViolationRatePercent))

  return policyResults.map((pr) => ({
    ...pr,
    isBestCost: Math.abs(pr.totalCostUSD - minCost) < 1e-9,
    isBestCarbon: Math.abs(pr.totalCarbonG - minCarbon) < 1e-9,
    isBestLatency: Math.abs(pr.averageLatencyMs - minLatency) < 1e-9,
    isBestSla: Math.abs(pr.slaViolationRatePercent - minSlaViolation) < 1e-9,
  }))
}
