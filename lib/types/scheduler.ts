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
