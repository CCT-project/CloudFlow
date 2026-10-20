import type {
  AdaptiveObjectiveWeights,
  CandidateEvaluationResult,
  PolicyType,
  ScheduleEvaluateResponseBody,
  ServerlessCandidate,
} from '../types/scheduler.ts'
import { calculateCarbonEmissions, calculateExecutionCost } from '../metrics/calculations.ts'
import { evaluateAdaptivePolicy } from './adaptive-policy.ts'

export interface PolicyEvaluationOptions {
  policy: PolicyType
  slaLatencyThresholdMs: number
  candidates: ServerlessCandidate[]
  executionDurationMs?: number
  isColdStart?: boolean
  adaptiveWeights?: Partial<AdaptiveObjectiveWeights>
}

/**
 * Evaluates candidate serverless instances against baseline scheduling policies:
 * - latency-first: Greedy selection minimizing latency among SLA-feasible candidates.
 * - cost-first: Greedy selection minimizing execution cost among SLA-feasible candidates.
 * - carbon-first: Greedy selection minimizing estimated carbon emissions among SLA-feasible candidates.
 * - fixed/default: Static assignment to default provider/region (baseline).
 * - cloudflow-adaptive: Two-stage multi-objective optimization with SLA feasibility enforcement.
 *
 * Enforces SLA feasibility first: Candidates exceeding the SLA latency threshold
 * are categorized as 'Rejected: SLA Constraint'.
 */
export function evaluateBaselinePolicy(options: PolicyEvaluationOptions): ScheduleEvaluateResponseBody {
  const {
    policy,
    slaLatencyThresholdMs,
    candidates,
    executionDurationMs = 120,
    isColdStart = false,
    adaptiveWeights,
  } = options

  // Delegate adaptive policy to evaluateAdaptivePolicy
  if (policy === 'CloudFlow adaptive') {
    return evaluateAdaptivePolicy({
      slaLatencyThresholdMs,
      candidates,
      executionDurationMs,
      isColdStart,
      adaptiveWeights,
    })
  }

  const startTime = performance.now()

  if (candidates.length === 0) {
    throw new Error('At least one candidate is required for evaluation.')
  }

  // 1. Evaluate individual candidate metrics
  const evaluations: CandidateEvaluationResult[] = candidates.map((cand) => {
    const coldAdded = isColdStart || !cand.isWarm ? cand.coldStartLatencyMs : 0
    const estimatedLatencyMs = cand.baseLatencyMs + coldAdded
    const estimatedCostUSD = calculateExecutionCost(executionDurationMs, cand.costPerMsUSD)
    const estimatedCarbonG = calculateCarbonEmissions(executionDurationMs, cand.carbonIntensityGPerKwh)

    const coldStartRisk: 'Low' | 'Medium' | 'High' = !cand.isWarm
      ? 'High'
      : cand.activeInstances < 5
      ? 'Medium'
      : 'Low'

    const slaFeasible = estimatedLatencyMs <= slaLatencyThresholdMs

    return {
      candidate: cand,
      estimatedLatencyMs,
      estimatedCostUSD,
      estimatedCarbonG,
      coldStartRisk,
      slaFeasible,
      compositeScore: 0,
      decision: slaFeasible ? 'Eligible' : 'Rejected: SLA Constraint',
    }
  })

  // 2. Filter feasible candidates
  const feasibleEvaluations = evaluations.filter((e) => e.slaFeasible)

  // 3. Selection according to policy
  let selectedEval: CandidateEvaluationResult | null = null
  let decisionExplanation = ''

  if (policy === 'Default') {
    // Default/Fixed Policy: Assigns statically to the first configured candidate
    const defaultCandidate = evaluations[0]
    selectedEval = defaultCandidate
    if (defaultCandidate.slaFeasible) {
      defaultCandidate.decision = 'Selected'
      decisionExplanation = `Static default policy selected primary candidate '${defaultCandidate.candidate.name}', which satisfies the ${slaLatencyThresholdMs}ms SLA threshold.`
    } else {
      decisionExplanation = `Static default policy assigned '${defaultCandidate.candidate.name}', but it VIOLATES the ${slaLatencyThresholdMs}ms SLA threshold (estimated latency: ${defaultCandidate.estimatedLatencyMs}ms).`
    }
  } else if (feasibleEvaluations.length === 0) {
    // No candidates meet the SLA threshold
    decisionExplanation = `Zero eligible candidates satisfy the configured SLA threshold of ${slaLatencyThresholdMs}ms. All ${candidates.length} candidates were rejected due to SLA constraints.`
  } else {
    // Choose among feasible candidates based on greedy objective
    if (policy === 'Latency-first') {
      feasibleEvaluations.sort((a, b) => a.estimatedLatencyMs - b.estimatedLatencyMs)
      selectedEval = feasibleEvaluations[0]
      selectedEval.decision = 'Selected'
      decisionExplanation = `Selected '${selectedEval.candidate.name}' minimizing expected latency (${selectedEval.estimatedLatencyMs}ms) within SLA limit (${slaLatencyThresholdMs}ms).`
    } else if (policy === 'Cost-first') {
      feasibleEvaluations.sort((a, b) => a.estimatedCostUSD - b.estimatedCostUSD)
      selectedEval = feasibleEvaluations[0]
      selectedEval.decision = 'Selected'
      decisionExplanation = `Selected '${selectedEval.candidate.name}' offering lowest execution cost ($${selectedEval.estimatedCostUSD}) among SLA-feasible candidates.`
    } else if (policy === 'Carbon-first') {
      feasibleEvaluations.sort((a, b) => a.estimatedCarbonG - b.estimatedCarbonG)
      selectedEval = feasibleEvaluations[0]
      selectedEval.decision = 'Selected'
      decisionExplanation = `Selected '${selectedEval.candidate.name}' minimizing regional carbon emissions (${selectedEval.estimatedCarbonG}g CO2e) among SLA-feasible candidates.`
    }
  }

  const endTime = performance.now()
  const overheadMs = Number((endTime - startTime).toFixed(3))

  return {
    status: 'success',
    policy,
    slaLatencyThresholdMs,
    isSlaSatisfied: selectedEval ? selectedEval.slaFeasible : false,
    selectedCandidate: selectedEval ? selectedEval.candidate : null,
    decisionExplanation,
    evaluations,
    schedulingOverheadMs: overheadMs,
  }
}
