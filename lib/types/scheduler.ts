/**
 * CloudFlow Core Domain Types
 * Defines data structures for serverless candidates, workloads, scheduling policies, and evaluation metrics.
 */

export type WorkloadType = 'Low' | 'Medium' | 'High' | 'Bursty' | 'Cold-Start-Heavy'
export type ArrivalPattern = 'Poisson' | 'Steady' | 'Bursty'

export type PolicyType =
  | 'Latency-first'
  | 'Cost-first'
  | 'Carbon-first'
  | 'Default'
  | 'CloudFlow adaptive'

export interface ServerlessCandidate {
  id: string
  name: string
  provider: 'AWS' | 'GCP' | 'Azure'
  region: string
  baseLatencyMs: number
  coldStartLatencyMs: number
  costPerMsUSD: number
  carbonIntensityGPerKwh: number
  activeInstances: number
  isWarm: boolean
}

export interface SchedulingConstraints {
  slaLatencyThresholdMs: number
  weights?: {
    cost: number
    carbon: number
    latency: number
    coldStartRisk: number
  }
}

export interface CandidateEvaluationResult {
  candidate: ServerlessCandidate
  estimatedLatencyMs: number
  estimatedCostUSD: number
  estimatedCarbonG: number
  coldStartRisk: 'Low' | 'Medium' | 'High'
  slaFeasible: boolean
  compositeScore: number
  decision: 'Selected' | 'Eligible' | 'Rejected: SLA Constraint'
}

export interface SchedulingDecision {
  requestId: string
  policy: PolicyType
  selectedCandidate: ServerlessCandidate
  allEvaluations: CandidateEvaluationResult[]
  schedulingOverheadMs: number
  timestamp: string
}

export interface WorkloadSimulationConfig {
  workloadType: WorkloadType
  requestCount: number
  durationMinutes: number
  slaLatencyThresholdMs: number
  arrivalPattern: ArrivalPattern
  policiesToEvaluate: PolicyType[]
}

export interface PolicyPerformanceSummary {
  policy: PolicyType
  totalRequests: number
  averageLatencyMs: number
  p95LatencyMs: number
  totalCostUSD: number
  totalCarbonG: number
  coldStartRatePercent: number
  slaViolationRatePercent: number
  averageOverheadMs: number
}

export interface ExperimentRun {
  id: string
  timestamp: string
  workloadConfig: WorkloadSimulationConfig
  policySummaries: Record<PolicyType, PolicyPerformanceSummary>
  status: 'Pending' | 'Running' | 'Completed' | 'Failed'
}

export interface AdaptiveObjectiveWeights {
  alpha: number // Cost weight
  beta: number  // Carbon weight
  gamma: number // Latency weight
  delta: number // Cold-start risk weight
}

export const DEFAULT_ADAPTIVE_WEIGHTS: AdaptiveObjectiveWeights = {
  alpha: 0.35,
  beta: 0.25,
  gamma: 0.25,
  delta: 0.15,
}

export interface SimulateRequestBody {
  workloadType?: WorkloadType
  requestCount: number
  durationMinutes?: number
  slaLatencyThresholdMs: number
  arrivalPattern?: ArrivalPattern
  policy?: PolicyType
  policiesToEvaluate?: PolicyType[]
  compareAllPolicies?: boolean
  candidates?: ServerlessCandidate[]
  seed?: number
  adaptiveWeights?: Partial<AdaptiveObjectiveWeights>
}

export interface SimulatedRequestTrace {
  requestId: number
  arrivalTimeMs: number
  latencyMs: number
  costUSD: number
  carbonG: number
  isColdStart: boolean
  meetsSLA: boolean
  selectedCandidateId: string
  selectedCandidateName: string
}

export interface SimulateResponseBody {
  status: 'success'
  simulationId: string
  timestamp: string
  workload: WorkloadSimulationConfig
  policy: PolicyType
  summary: PolicyPerformanceSummary
  policySummaries?: Partial<Record<PolicyType, PolicyPerformanceSummary>>
  simulationAssumptions: {
    prng: string
    latencyModel: string
    costModel: string
    carbonModel: string
    coldStartModel: string
    adaptivePolicyModel?: string
  }
  sampleTraces: SimulatedRequestTrace[]
}

export interface ScheduleEvaluateRequestBody {
  policy: PolicyType
  slaLatencyThresholdMs: number
  candidates: ServerlessCandidate[]
  executionDurationMs?: number
  isColdStart?: boolean
  adaptiveWeights?: Partial<AdaptiveObjectiveWeights>
}

export interface ScheduleEvaluateResponseBody {
  status: 'success'
  policy: PolicyType
  slaLatencyThresholdMs: number
  isSlaSatisfied: boolean
  selectedCandidate: ServerlessCandidate | null
  decisionExplanation: string
  evaluations: CandidateEvaluationResult[]
  schedulingOverheadMs: number
  weightsUsed?: AdaptiveObjectiveWeights
}

export interface ApiErrorResponse {
  status: 'error'
  error: {
    code: string
    message: string
    details?: string[]
  }
}
