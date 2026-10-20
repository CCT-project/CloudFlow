import type {
  AdaptiveObjectiveWeights,
  CandidateEvaluationResult,
  ScheduleEvaluateResponseBody,
  ServerlessCandidate,
} from '../types/scheduler.ts'
import { DEFAULT_ADAPTIVE_WEIGHTS } from '../types/scheduler.ts'
import { calculateCarbonEmissions, calculateExecutionCost } from '../metrics/calculations.ts'

export interface AdaptiveEvaluationOptions {
  slaLatencyThresholdMs: number
  candidates: ServerlessCandidate[]
  executionDurationMs?: number
  isColdStart?: boolean
  adaptiveWeights?: Partial<AdaptiveObjectiveWeights>
}

/**
 * Validates adaptive objective weights ensuring non-negativity and that they sum to 1.0 (+/- 0.001 tolerance).
 */
export function validateAdaptiveWeights(
  weights?: Partial<AdaptiveObjectiveWeights>
): AdaptiveObjectiveWeights {
  if (!weights) {
    return { ...DEFAULT_ADAPTIVE_WEIGHTS }
  }

  const alpha = weights.alpha ?? DEFAULT_ADAPTIVE_WEIGHTS.alpha
  const beta = weights.beta ?? DEFAULT_ADAPTIVE_WEIGHTS.beta
  const gamma = weights.gamma ?? DEFAULT_ADAPTIVE_WEIGHTS.gamma
  const delta = weights.delta ?? DEFAULT_ADAPTIVE_WEIGHTS.delta

  const entries: [string, number][] = [
    ['alpha (cost)', alpha],
    ['beta (carbon)', beta],
    ['gamma (latency)', gamma],
    ['delta (coldStartRisk)', delta],
  ]

  for (const [name, val] of entries) {
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      throw new Error(`Adaptive weight '${name}' must be a finite number.`)
    }
    if (val < 0) {
      throw new Error(`Adaptive weight '${name}' cannot be negative (received: ${val}).`)
    }
  }

  const sum = alpha + beta + gamma + delta
  if (Math.abs(sum - 1.0) > 0.001) {
    throw new Error(
      `Adaptive objective weights must sum to 1.0 (+/- 0.001 tolerance). Received sum: ${Number(
        sum.toFixed(4)
      )} (alpha: ${alpha}, beta: ${beta}, gamma: ${gamma}, delta: ${delta}).`
    )
  }

  return { alpha, beta, gamma, delta }
}

/**
 * Validates that candidate input data is present, finite, and non-negative.
 * Rejects candidates with missing or NaN values.
 */
function validateCandidateMetrics(c: ServerlessCandidate): void {
  if (typeof c.baseLatencyMs !== 'number' || !Number.isFinite(c.baseLatencyMs) || c.baseLatencyMs < 0) {
    throw new Error(
      `Candidate '${c.name || c.id}' has invalid baseLatencyMs: ${c.baseLatencyMs}. Must be a non-negative finite number.`
    )
  }
  if (typeof c.coldStartLatencyMs !== 'number' || !Number.isFinite(c.coldStartLatencyMs) || c.coldStartLatencyMs < 0) {
    throw new Error(
      `Candidate '${c.name || c.id}' has invalid coldStartLatencyMs: ${c.coldStartLatencyMs}. Must be a non-negative finite number.`
    )
  }
  if (typeof c.costPerMsUSD !== 'number' || !Number.isFinite(c.costPerMsUSD) || c.costPerMsUSD < 0) {
    throw new Error(
      `Candidate '${c.name || c.id}' has invalid costPerMsUSD: ${c.costPerMsUSD}. Must be a non-negative finite number.`
    )
  }
  if (
    typeof c.carbonIntensityGPerKwh !== 'number' ||
    !Number.isFinite(c.carbonIntensityGPerKwh) ||
    c.carbonIntensityGPerKwh < 0
  ) {
    throw new Error(
      `Candidate '${c.name || c.id}' has invalid carbonIntensityGPerKwh: ${c.carbonIntensityGPerKwh}. Must be a non-negative finite number.`
    )
  }
}

/**
 * CloudFlow Adaptive Scheduling Policy.
 * 
 * Two-Stage Selection:
 *   Stage A (SLA Feasibility):
 *     Evaluate candidates against SLA latency threshold. Only candidates meeting SLA are eligible.
 *     Infeasible candidates cannot be selected merely due to lower cost or carbon.
 *     If zero candidates meet SLA, fallback to candidate with minimum SLA shortfall.
 * 
 *   Stage B (Normalized Multi-Objective Scoring):
 *     Normalize objectives in [0, 1] avoiding division by zero:
 *       score = alpha * normCost + beta * normCarbon + gamma * normLatency + delta * normColdRisk
 *     Lower score is better.
 */
export function evaluateAdaptivePolicy(options: AdaptiveEvaluationOptions): ScheduleEvaluateResponseBody {
  const startTime = performance.now()
  const {
    slaLatencyThresholdMs,
    candidates,
    executionDurationMs = 120,
    isColdStart = false,
    adaptiveWeights,
  } = options

  if (!candidates || candidates.length === 0) {
    throw new Error('At least one candidate is required for adaptive evaluation.')
  }

  // Validate weights
  const weights = validateAdaptiveWeights(adaptiveWeights)

  // Validate candidate data
  for (const c of candidates) {
    validateCandidateMetrics(c)
  }

  interface IntermediateEvaluation {
    candidate: ServerlessCandidate
    estimatedLatencyMs: number
    estimatedCostUSD: number
    estimatedCarbonG: number
    coldRiskScore: number
    coldStartRisk: 'Low' | 'Medium' | 'High'
    slaFeasible: boolean
    slaShortfallMs: number
  }

  // Stage A: Compute raw metrics & SLA feasibility
  const intermediates: IntermediateEvaluation[] = candidates.map((cand) => {
    const coldAdded = isColdStart || !cand.isWarm ? cand.coldStartLatencyMs : 0
    const estimatedLatencyMs = cand.baseLatencyMs + coldAdded
    const estimatedCostUSD = calculateExecutionCost(executionDurationMs, cand.costPerMsUSD)
    const estimatedCarbonG = calculateCarbonEmissions(executionDurationMs, cand.carbonIntensityGPerKwh)

    const coldStartRisk: 'Low' | 'Medium' | 'High' = !cand.isWarm
      ? 'High'
      : cand.activeInstances < 5
      ? 'Medium'
      : 'Low'

    const coldRiskScore = coldStartRisk === 'High' ? 1.0 : coldStartRisk === 'Medium' ? 0.5 : 0.0
    const slaFeasible = estimatedLatencyMs <= slaLatencyThresholdMs
    const slaShortfallMs = Math.max(0, estimatedLatencyMs - slaLatencyThresholdMs)

    return {
      candidate: cand,
      estimatedLatencyMs,
      estimatedCostUSD,
      estimatedCarbonG,
      coldRiskScore,
      coldStartRisk,
      slaFeasible,
      slaShortfallMs,
    }
  })

  const feasible = intermediates.filter((i) => i.slaFeasible)
  let selectedCandidate: ServerlessCandidate | null = null
  let isSlaSatisfied = false
  let decisionExplanation = ''

  const finalEvaluations: CandidateEvaluationResult[] = []

  if (feasible.length > 0) {
    // Stage B: Multi-Objective Normalization over feasible candidates
    isSlaSatisfied = true

    // Compute min and max across feasible candidates for normalization
    const costs = feasible.map((f) => f.estimatedCostUSD)
    const carbons = feasible.map((f) => f.estimatedCarbonG)
    const latencies = feasible.map((f) => f.estimatedLatencyMs)

    const minCost = Math.min(...costs)
    const maxCost = Math.max(...costs)
    const rangeCost = maxCost - minCost

    const minCarbon = Math.min(...carbons)
    const maxCarbon = Math.max(...carbons)
    const rangeCarbon = maxCarbon - minCarbon

    const minLat = Math.min(...latencies)
    const maxLat = Math.max(...latencies)
    const rangeLat = maxLat - minLat

    // Normalization helper: avoids division by zero if all candidate values are identical
    const normalize = (val: number, min: number, range: number) => {
      if (range < 1e-12) return 0.0 // All candidates equal on this objective
      return Math.max(0.0, Math.min(1.0, (val - min) / range))
    }

    // Score all candidates
    let bestScore = Infinity
    let bestFeasible: IntermediateEvaluation | null = null
    let bestContributions = { cost: 0, carbon: 0, latency: 0, cold: 0 }

    for (const item of intermediates) {
      if (!item.slaFeasible) {
        finalEvaluations.push({
          candidate: item.candidate,
          estimatedLatencyMs: item.estimatedLatencyMs,
          estimatedCostUSD: item.estimatedCostUSD,
          estimatedCarbonG: item.estimatedCarbonG,
          coldStartRisk: item.coldStartRisk,
          slaFeasible: false,
          compositeScore: 1.0,
          decision: 'Rejected: SLA Constraint',
        })
        continue
      }

      const normCost = normalize(item.estimatedCostUSD, minCost, rangeCost)
      const normCarbon = normalize(item.estimatedCarbonG, minCarbon, rangeCarbon)
      const normLat = normalize(item.estimatedLatencyMs, minLat, rangeLat)
      const normCold = item.coldRiskScore

      const costContrib = weights.alpha * normCost
      const carbonContrib = weights.beta * normCarbon
      const latContrib = weights.gamma * normLat
      const coldContrib = weights.delta * normCold

      const compositeScore = Number(
        (costContrib + carbonContrib + latContrib + coldContrib).toFixed(6)
      )

      if (compositeScore < bestScore) {
        bestScore = compositeScore
        bestFeasible = item
        bestContributions = {
          cost: Number(costContrib.toFixed(4)),
          carbon: Number(carbonContrib.toFixed(4)),
          latency: Number(latContrib.toFixed(4)),
          cold: Number(coldContrib.toFixed(4)),
        }
      }

      finalEvaluations.push({
        candidate: item.candidate,
        estimatedLatencyMs: item.estimatedLatencyMs,
        estimatedCostUSD: item.estimatedCostUSD,
        estimatedCarbonG: item.estimatedCarbonG,
        coldStartRisk: item.coldStartRisk,
        slaFeasible: true,
        compositeScore,
        decision: 'Eligible',
      })
    }

    if (bestFeasible) {
      selectedCandidate = bestFeasible.candidate
      const selectedResult = finalEvaluations.find((e) => e.candidate.id === bestFeasible!.candidate.id)
      if (selectedResult) {
        selectedResult.decision = 'Selected'
      }

      decisionExplanation =
        `CloudFlow Adaptive selected '${bestFeasible.candidate.name}' with best composite score of ${bestScore.toFixed(4)} ` +
        `(score breakdown: cost=${bestContributions.cost}, carbon=${bestContributions.carbon}, latency=${bestContributions.latency}, coldStart=${bestContributions.cold}). ` +
        `Candidate is verified SLA-feasible (${bestFeasible.estimatedLatencyMs}ms <= ${slaLatencyThresholdMs}ms).`
    }
  } else {
    // Fallback: No candidate satisfies SLA
    isSlaSatisfied = false

    // Select candidate with smallest SLA shortfall
    const sortedByShortfall = [...intermediates].sort(
      (a, b) => a.slaShortfallMs - b.slaShortfallMs
    )
    const fallback = sortedByShortfall[0]
    selectedCandidate = fallback.candidate

    for (const item of intermediates) {
      const isChosenFallback = item.candidate.id === fallback.candidate.id
      finalEvaluations.push({
        candidate: item.candidate,
        estimatedLatencyMs: item.estimatedLatencyMs,
        estimatedCostUSD: item.estimatedCostUSD,
        estimatedCarbonG: item.estimatedCarbonG,
        coldStartRisk: item.coldStartRisk,
        slaFeasible: false,
        compositeScore: Number((1.0 + item.slaShortfallMs / slaLatencyThresholdMs).toFixed(4)),
        decision: isChosenFallback ? 'Selected' : 'Rejected: SLA Constraint',
      })
    }

    decisionExplanation =
      `SLA Violation Warning: Zero candidates satisfy the configured SLA threshold of ${slaLatencyThresholdMs}ms. ` +
      `Fallback selected '${fallback.candidate.name}' with smallest SLA shortfall of ${fallback.slaShortfallMs}ms ` +
      `(estimated latency: ${fallback.estimatedLatencyMs}ms vs SLA: ${slaLatencyThresholdMs}ms).`
  }

  const endTime = performance.now()
  const schedulingOverheadMs = Number((endTime - startTime).toFixed(3))

  return {
    status: 'success',
    policy: 'CloudFlow adaptive',
    slaLatencyThresholdMs,
    isSlaSatisfied,
    selectedCandidate,
    decisionExplanation,
    evaluations: finalEvaluations,
    schedulingOverheadMs,
    weightsUsed: weights,
  }
}
