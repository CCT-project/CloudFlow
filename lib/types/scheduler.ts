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
  maxInstances?: number
  concurrencyPerInstance?: number
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
  maxInstancesPerCandidate?: number
  coldStartTimeoutMs?: number
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
  averageExecutionDurationMs?: number
  averageQueueingDelayMs?: number
  averageColdStartDelayMs?: number
  maxConcurrency?: number
  containerUtilizationPercent?: number
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
  saveExperiment?: boolean
  experimentName?: string
  maxInstancesPerCandidate?: number
  coldStartTimeoutMs?: number
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
  executionDurationMs?: number
  queueingDelayMs?: number
  coldStartDelayMs?: number
  containerId?: string
  serviceStartTimeMs?: number
  serviceFinishTimeMs?: number
  activeConcurrency?: number
  lifecycleState?: 'cold_start_scale_out' | 'warm_reuse' | 'queue_delayed'
}

export interface ContainerLifecycleEvent {
  timestampMs: number
  candidateId: string
  containerId: string
  eventType: 'created' | 'warm_reuse' | 'queue_wait' | 'busy' | 'idle' | 'expired'
  durationMs?: number
  activeConcurrency: number
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
    concurrencyModel?: string
    latencyModel: string
    costModel: string
    carbonModel: string
    coldStartModel: string
    adaptivePolicyModel?: string
  }
  sampleTraces: SimulatedRequestTrace[]
  policyTraces?: Partial<Record<PolicyType, SimulatedRequestTrace[]>>
  lifecycleEvents?: ContainerLifecycleEvent[]
  isSaved?: boolean
  savedExperimentId?: string
}

export interface ScheduleEvaluateRequestBody {
  policy: PolicyType
  slaLatencyThresholdMs: number
  candidates: ServerlessCandidate[]
  executionDurationMs?: number
  expectedExecutionDurationMs?: number
  latencyMarginMs?: number
  workloadType?: WorkloadType
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

export interface PersistedPolicyResult {
  id?: string
  experimentId?: string
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

export interface ExperimentRecord {
  id: string
  name: string
  createdAt: string
  workloadType: WorkloadType
  requestCount: number
  durationMinutes: number
  slaLatencyThresholdMs: number
  arrivalPattern: ArrivalPattern
  seed: number
  weights: AdaptiveObjectiveWeights
  assumptions: {
    prng: string
    concurrencyModel?: string
    latencyModel: string
    costModel: string
    carbonModel: string
    coldStartModel: string
    adaptivePolicyModel?: string
  }
  userId?: string | null
  isPublic?: boolean
  policyResults: PersistedPolicyResult[]
}

export interface CreateExperimentRequestBody {
  name: string
  workloadType?: WorkloadType
  requestCount: number
  durationMinutes?: number
  slaLatencyThresholdMs: number
  arrivalPattern?: ArrivalPattern
  seed?: number
  adaptiveWeights?: Partial<AdaptiveObjectiveWeights>
  simulationAssumptions?: {
    prng?: string
    concurrencyModel?: string
    latencyModel?: string
    costModel?: string
    carbonModel?: string
    coldStartModel?: string
    adaptivePolicyModel?: string
  }
  isPublic?: boolean
  policyResults: PersistedPolicyResult[]
}

export interface GetExperimentsResponseBody {
  status: 'success'
  data: {
    experiments: ExperimentRecord[]
    total: number
    page: number
    limit: number
    totalPages: number
    persistence: {
      enabled: boolean
      storageType: string
      verified: boolean
    }
  }
}

export interface SingleExperimentResponseBody {
  status: 'success'
  data: {
    experiment: ExperimentRecord
    persistence: {
      enabled: boolean
      storageType: string
    }
  }
}

export type EvaluatedMetric =
  | 'costUSD'
  | 'carbonG'
  | 'averageLatencyMs'
  | 'p95LatencyMs'
  | 'coldStartRatePercent'
  | 'slaViolationRatePercent'
  | 'averageOverheadMs'

export interface BatchResearchRequestBody {
  seedCount?: number
  startingSeed?: number
  seeds?: number[]
  requestCount?: number
  durationMinutes?: number
  slaLatencyThresholdMs?: number
  arrivalPattern?: ArrivalPattern
  workloadType?: WorkloadType
  adaptiveWeights?: Partial<AdaptiveObjectiveWeights>
  candidates?: ServerlessCandidate[]
  maxInstancesPerCandidate?: number
  coldStartTimeoutMs?: number
}

export interface MetricSummaryStatistics {
  count: number
  mean: number
  variance: number
  standardDeviation: number
  standardError: number
  confidenceInterval95: [number, number]
  criticalT: number
}

export interface PolicyBatchStatistics {
  policy: PolicyType
  sampleSize: number
  pooledP95LatencyMs?: number
  pooledQuantiles?: {
    p50: number
    p90: number
    p95: number
    p99: number
  }
  metrics: {
    costUSD: MetricSummaryStatistics
    carbonG: MetricSummaryStatistics
    averageLatencyMs: MetricSummaryStatistics
    p95LatencyMs: MetricSummaryStatistics
    coldStartRatePercent: MetricSummaryStatistics
    slaViolationRatePercent: MetricSummaryStatistics
    averageOverheadMs: MetricSummaryStatistics
  }
}

export interface BatchComparisonItem {
  metric: EvaluatedMetric
  baselinePolicy: PolicyType
  adaptiveMean: number
  baselineMean: number
  meanDifference: number
  percentDifference: number
  degreesOfFreedom: number
  tStatistic: number
  pValue: number
  adjustedPValue: number
  isStatisticallySignificant: boolean
  cohensDz: number
  effectSizeMagnitude: 'Negligible' | 'Small' | 'Medium' | 'Large'
}

export interface BatchResearchResponseBody {
  status: 'success'
  batchId: string
  timestamp: string
  metadata: {
    totalSeeds: number
    seeds: number[]
    requestCountPerSeed: number
    totalEvaluations: number
    workloadType: WorkloadType
    arrivalPattern: ArrivalPattern
    slaLatencyThresholdMs: number
    executionTimeMs: number
    methodology: {
      distribution: string
      multipleComparisonsCorrection: string
      confidenceLevel: string
      identicalTraceCondition: string
    }
  }
  policyStatistics: Record<PolicyType, PolicyBatchStatistics>
  comparisons: BatchComparisonItem[]
  latencyObservations?: Partial<Record<PolicyType, number[]>>
  representativeTraces?: SimulatedRequestTrace[]
  representativeLifecycleEvents?: ContainerLifecycleEvent[]
}
