import type {
  AdaptiveObjectiveWeights,
  ArrivalPattern,
  BatchResearchRequestBody,
  CreateExperimentRequestBody,
  PersistedPolicyResult,
  PolicyType,
  ScheduleEvaluateRequestBody,
  ServerlessCandidate,
  SimulateRequestBody,
  WorkloadType,
} from '../types/scheduler.ts'
import { validateAdaptiveWeights } from '../scheduler/adaptive-policy.ts'

export const MAX_SIMULATION_REQUEST_COUNT = 50000
export const MIN_SIMULATION_REQUEST_COUNT = 1

export const VALID_POLICIES: PolicyType[] = [
  'Latency-first',
  'Cost-first',
  'Carbon-first',
  'Default',
  'CloudFlow adaptive',
]

/**
 * Normalizes user-supplied policy strings to official PolicyType.
 */
export function normalizePolicyName(p: unknown): PolicyType | null {
  if (typeof p !== 'string') return null
  const cleaned = p.trim().toLowerCase().replace(/[-_ ]+/g, '')
  if (cleaned === 'latencyfirst' || cleaned === 'latency') return 'Latency-first'
  if (cleaned === 'costfirst' || cleaned === 'cost') return 'Cost-first'
  if (cleaned === 'carbonfirst' || cleaned === 'carbon') return 'Carbon-first'
  if (cleaned === 'default' || cleaned === 'fixed') return 'Default'
  if (cleaned === 'cloudflowadaptive' || cleaned === 'adaptive') return 'CloudFlow adaptive'
  return null
}

export interface ValidationSuccess<T> {
  isValid: true
  data: T
}

export interface ValidationFailure {
  isValid: false
  code: string
  message: string
  details: string[]
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure

/**
 * Validates the request body for POST /api/simulate
 */
export function validateSimulateRequest(body: unknown): ValidationResult<SimulateRequestBody> {
  const details: string[] = []

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      code: 'INVALID_JSON_BODY',
      message: 'Request payload must be a valid JSON object.',
      details: ['Expected JSON object as root payload.'],
    }
  }

  const raw = body as Record<string, unknown>

  // Request Count Validation
  if (raw.requestCount === undefined || raw.requestCount === null) {
    details.push("Missing required field 'requestCount'.")
  } else if (typeof raw.requestCount !== 'number' || !Number.isFinite(raw.requestCount)) {
    details.push("Field 'requestCount' must be a finite number.")
  } else if (!Number.isInteger(raw.requestCount)) {
    details.push("Field 'requestCount' must be an integer.")
  } else if (raw.requestCount < MIN_SIMULATION_REQUEST_COUNT) {
    details.push(`Field 'requestCount' must be at least ${MIN_SIMULATION_REQUEST_COUNT}.`)
  } else if (raw.requestCount > MAX_SIMULATION_REQUEST_COUNT) {
    details.push(
      `Field 'requestCount' exceeds maximum allowable limit of ${MAX_SIMULATION_REQUEST_COUNT} requests.`
    )
  }

  // SLA Threshold Validation
  if (raw.slaLatencyThresholdMs === undefined || raw.slaLatencyThresholdMs === null) {
    details.push("Missing required field 'slaLatencyThresholdMs'.")
  } else if (typeof raw.slaLatencyThresholdMs !== 'number' || !Number.isFinite(raw.slaLatencyThresholdMs)) {
    details.push("Field 'slaLatencyThresholdMs' must be a finite number.")
  } else if (raw.slaLatencyThresholdMs <= 0) {
    details.push("Field 'slaLatencyThresholdMs' must be strictly positive (> 0 ms).")
  }

  // Duration Minutes Validation (if provided)
  if (raw.durationMinutes !== undefined && raw.durationMinutes !== null) {
    if (typeof raw.durationMinutes !== 'number' || !Number.isFinite(raw.durationMinutes) || raw.durationMinutes <= 0) {
      details.push("Field 'durationMinutes' must be a finite positive number.")
    }
  }

  // Policy Validation (if provided)
  let validatedPolicy: PolicyType = 'Latency-first'
  if (raw.policy !== undefined && raw.policy !== null) {
    const normalized = normalizePolicyName(raw.policy)
    if (!normalized || !VALID_POLICIES.includes(normalized)) {
      details.push(
        `Invalid policy '${raw.policy}'. Supported policies are: ${VALID_POLICIES.join(', ')}.`
      )
    } else {
      validatedPolicy = normalized
    }
  }

  // Multi-policy comparison validation (if provided)
  let validatedPoliciesToEvaluate: PolicyType[] | undefined
  if (raw.policiesToEvaluate !== undefined && raw.policiesToEvaluate !== null) {
    if (!Array.isArray(raw.policiesToEvaluate)) {
      details.push("Field 'policiesToEvaluate' must be an array of policy names.")
    } else if (raw.policiesToEvaluate.length === 0) {
      details.push("Field 'policiesToEvaluate' cannot be an empty array if specified.")
    } else {
      validatedPoliciesToEvaluate = []
      for (let idx = 0; idx < raw.policiesToEvaluate.length; idx++) {
        const item = raw.policiesToEvaluate[idx]
        const norm = normalizePolicyName(item)
        if (!norm) {
          details.push(`Field 'policiesToEvaluate[${idx}]' has invalid policy '${item}'. Supported: ${VALID_POLICIES.join(', ')}.`)
        } else {
          validatedPoliciesToEvaluate.push(norm)
        }
      }
    }
  } else if (raw.compareAllPolicies === true) {
    validatedPoliciesToEvaluate = [...VALID_POLICIES]
  }

  // Adaptive Weights Validation (if provided)
  if (raw.adaptiveWeights !== undefined && raw.adaptiveWeights !== null) {
    if (typeof raw.adaptiveWeights !== 'object' || Array.isArray(raw.adaptiveWeights)) {
      details.push("Field 'adaptiveWeights' must be an object with numeric alpha, beta, gamma, delta weights.")
    } else {
      try {
        validateAdaptiveWeights(raw.adaptiveWeights as Partial<AdaptiveObjectiveWeights>)
      } catch (err: unknown) {
        details.push(err instanceof Error ? err.message : 'Invalid adaptiveWeights configuration.')
      }
    }
  }

  // Candidates Validation (if provided)
  if (raw.candidates !== undefined && raw.candidates !== null) {
    if (!Array.isArray(raw.candidates)) {
      details.push("Field 'candidates' must be an array of candidate objects.")
    } else if (raw.candidates.length === 0) {
      details.push("Field 'candidates' cannot be an empty array if specified.")
    } else {
      raw.candidates.forEach((cand, idx) => {
        validateCandidate(cand, `candidates[${idx}]`, details)
      })
    }
  }

  // Seed Validation (if provided)
  if (raw.seed !== undefined && raw.seed !== null) {
    if (typeof raw.seed !== 'number' || !Number.isFinite(raw.seed)) {
      details.push("Field 'seed' must be a finite number.")
    }
  }

  // Optional Experiment Persistence Validation
  if (raw.saveExperiment !== undefined && raw.saveExperiment !== null) {
    if (typeof raw.saveExperiment !== 'boolean') {
      details.push("Field 'saveExperiment' must be a boolean.")
    }
  }
  if (raw.experimentName !== undefined && raw.experimentName !== null) {
    if (typeof raw.experimentName !== 'string' || raw.experimentName.trim().length === 0) {
      details.push("Field 'experimentName' must be a non-empty string.")
    } else if (raw.experimentName.trim().length > 100) {
      details.push("Field 'experimentName' cannot exceed 100 characters.")
    }
  }

  if (details.length > 0) {
    return {
      isValid: false,
      code: 'VALIDATION_ERROR',
      message: 'The request payload failed schema validation.',
      details,
    }
  }

  return {
    isValid: true,
    data: body as SimulateRequestBody,
  }
}

/**
 * Validates the request body for POST /api/schedule/evaluate
 */
export function validateScheduleEvaluateRequest(body: unknown): ValidationResult<ScheduleEvaluateRequestBody> {
  const details: string[] = []

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      code: 'INVALID_JSON_BODY',
      message: 'Request payload must be a valid JSON object.',
      details: ['Expected JSON object as root payload.'],
    }
  }

  const raw = body as Record<string, unknown>

  // Policy Validation
  let validatedPolicy: PolicyType = 'Latency-first'
  if (raw.policy === undefined || raw.policy === null) {
    details.push("Missing required field 'policy'.")
  } else {
    const normalized = normalizePolicyName(raw.policy)
    if (!normalized || !VALID_POLICIES.includes(normalized)) {
      details.push(
        `Invalid policy '${raw.policy}'. Supported policies are: ${VALID_POLICIES.join(', ')}.`
      )
    } else {
      validatedPolicy = normalized
    }
  }

  // Adaptive Weights Validation (if provided)
  if (raw.adaptiveWeights !== undefined && raw.adaptiveWeights !== null) {
    if (typeof raw.adaptiveWeights !== 'object' || Array.isArray(raw.adaptiveWeights)) {
      details.push("Field 'adaptiveWeights' must be an object with numeric alpha, beta, gamma, delta weights.")
    } else {
      try {
        validateAdaptiveWeights(raw.adaptiveWeights as Partial<AdaptiveObjectiveWeights>)
      } catch (err: unknown) {
        details.push(err instanceof Error ? err.message : 'Invalid adaptiveWeights configuration.')
      }
    }
  }

  // SLA Threshold Validation
  if (raw.slaLatencyThresholdMs === undefined || raw.slaLatencyThresholdMs === null) {
    details.push("Missing required field 'slaLatencyThresholdMs'.")
  } else if (typeof raw.slaLatencyThresholdMs !== 'number' || !Number.isFinite(raw.slaLatencyThresholdMs)) {
    details.push("Field 'slaLatencyThresholdMs' must be a finite number.")
  } else if (raw.slaLatencyThresholdMs <= 0) {
    details.push("Field 'slaLatencyThresholdMs' must be strictly positive (> 0 ms).")
  }

  // Candidates Validation
  if (!raw.candidates) {
    details.push("Missing required field 'candidates'.")
  } else if (!Array.isArray(raw.candidates)) {
    details.push("Field 'candidates' must be an array.")
  } else if (raw.candidates.length === 0) {
    details.push("Field 'candidates' cannot be empty. At least one candidate must be provided.")
  } else {
    raw.candidates.forEach((cand, idx) => {
      validateCandidate(cand, `candidates[${idx}]`, details)
    })
  }

  // Execution Duration Validation (if provided)
  if (raw.executionDurationMs !== undefined && raw.executionDurationMs !== null) {
    if (typeof raw.executionDurationMs !== 'number' || !Number.isFinite(raw.executionDurationMs) || raw.executionDurationMs <= 0) {
      details.push("Field 'executionDurationMs' must be a finite positive number.")
    }
  }

  if (details.length > 0) {
    return {
      isValid: false,
      code: 'VALIDATION_ERROR',
      message: 'The schedule evaluation request failed schema validation.',
      details,
    }
  }

  return {
    isValid: true,
    data: body as ScheduleEvaluateRequestBody,
  }
}

function validateCandidate(cand: unknown, prefix: string, details: string[]): void {
  if (!cand || typeof cand !== 'object') {
    details.push(`${prefix} must be an object.`)
    return
  }
  const c = cand as Partial<ServerlessCandidate>
  if (!c.id || typeof c.id !== 'string') details.push(`${prefix}.id must be a non-empty string.`)
  if (!c.name || typeof c.name !== 'string') details.push(`${prefix}.name must be a non-empty string.`)
  if (typeof c.baseLatencyMs !== 'number' || !Number.isFinite(c.baseLatencyMs) || c.baseLatencyMs < 0) {
    details.push(`${prefix}.baseLatencyMs must be a non-negative finite number.`)
  }
  if (typeof c.coldStartLatencyMs !== 'number' || !Number.isFinite(c.coldStartLatencyMs) || c.coldStartLatencyMs < 0) {
    details.push(`${prefix}.coldStartLatencyMs must be a non-negative finite number.`)
  }
  if (typeof c.costPerMsUSD !== 'number' || !Number.isFinite(c.costPerMsUSD) || c.costPerMsUSD < 0) {
    details.push(`${prefix}.costPerMsUSD must be a non-negative finite number.`)
  }
  if (typeof c.carbonIntensityGPerKwh !== 'number' || !Number.isFinite(c.carbonIntensityGPerKwh) || c.carbonIntensityGPerKwh < 0) {
    details.push(`${prefix}.carbonIntensityGPerKwh must be a non-negative finite number.`)
  }
}

export const VALID_WORKLOAD_TYPES: WorkloadType[] = [
  'Low',
  'Medium',
  'High',
  'Bursty',
  'Cold-Start-Heavy',
]

export const VALID_ARRIVAL_PATTERNS: ArrivalPattern[] = ['Steady', 'Poisson', 'Bursty']

export interface ValidatedGetExperimentsQuery {
  page: number
  limit: number
  sortBy: 'createdAt' | 'name'
  order: 'asc' | 'desc'
  scope?: 'all' | 'mine'
}

/**
 * Validates query parameters for GET /api/experiments
 */
export function validateGetExperimentsQuery(
  searchParams: URLSearchParams
): ValidationResult<ValidatedGetExperimentsQuery> {
  const details: string[] = []

  let page = 1
  const rawPage = searchParams.get('page')
  if (rawPage !== null) {
    const parsed = Number(rawPage)
    if (!Number.isInteger(parsed) || parsed < 1) {
      details.push("Query parameter 'page' must be a positive integer >= 1.")
    } else {
      page = parsed
    }
  }

  let limit = 10
  const rawLimit = searchParams.get('limit')
  if (rawLimit !== null) {
    const parsed = Number(rawLimit)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      details.push("Query parameter 'limit' must be an integer between 1 and 100.")
    } else {
      limit = parsed
    }
  }

  let sortBy: 'createdAt' | 'name' = 'createdAt'
  const rawSortBy = searchParams.get('sortBy')
  if (rawSortBy !== null) {
    if (rawSortBy === 'createdAt' || rawSortBy === 'name') {
      sortBy = rawSortBy
    } else {
      details.push("Query parameter 'sortBy' must be either 'createdAt' or 'name'.")
    }
  }

  let order: 'asc' | 'desc' = 'desc'
  const rawOrder = searchParams.get('order')
  if (rawOrder !== null) {
    const lower = rawOrder.toLowerCase()
    if (lower === 'asc' || lower === 'desc') {
      order = lower as 'asc' | 'desc'
    } else {
      details.push("Query parameter 'order' must be either 'asc' or 'desc'.")
    }
  }

  let scope: 'all' | 'mine' | undefined
  const rawScope = searchParams.get('scope')
  if (rawScope !== null) {
    const lower = rawScope.toLowerCase()
    if (lower === 'all' || lower === 'mine') {
      scope = lower as 'all' | 'mine'
    } else {
      details.push("Query parameter 'scope' must be either 'all' or 'mine'.")
    }
  }

  if (details.length > 0) {
    return {
      isValid: false,
      code: 'INVALID_QUERY_PARAMETERS',
      message: 'Query parameters failed validation.',
      details,
    }
  }

  return {
    isValid: true,
    data: { page, limit, sortBy, order, scope },
  }
}

/**
 * Validates the request body for POST /api/experiments
 */
export function validateCreateExperimentRequest(
  body: unknown
): ValidationResult<CreateExperimentRequestBody> {
  const details: string[] = []

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      code: 'INVALID_JSON_BODY',
      message: 'Request payload must be a valid JSON object.',
      details: ['Expected JSON object as root payload.'],
    }
  }

  const raw = body as Record<string, unknown>

  // Name Validation
  if (!raw.name || typeof raw.name !== 'string' || raw.name.trim().length === 0) {
    details.push("Missing required field 'name' (must be a non-empty string).")
  } else if (raw.name.trim().length > 100) {
    details.push("Field 'name' cannot exceed 100 characters.")
  }

  // Workload Type Validation
  if (raw.workloadType !== undefined && raw.workloadType !== null) {
    if (!VALID_WORKLOAD_TYPES.includes(raw.workloadType as WorkloadType)) {
      details.push(
        `Invalid workloadType '${raw.workloadType}'. Supported: ${VALID_WORKLOAD_TYPES.join(', ')}.`
      )
    }
  }

  // Request Count Validation
  if (raw.requestCount === undefined || raw.requestCount === null) {
    details.push("Missing required field 'requestCount'.")
  } else if (typeof raw.requestCount !== 'number' || !Number.isFinite(raw.requestCount)) {
    details.push("Field 'requestCount' must be a finite number.")
  } else if (!Number.isInteger(raw.requestCount) || raw.requestCount < 1) {
    details.push("Field 'requestCount' must be a positive integer >= 1.")
  }

  // Duration Minutes Validation
  if (raw.durationMinutes !== undefined && raw.durationMinutes !== null) {
    if (typeof raw.durationMinutes !== 'number' || !Number.isFinite(raw.durationMinutes) || raw.durationMinutes <= 0) {
      details.push("Field 'durationMinutes' must be a positive number.")
    }
  }

  // SLA Latency Threshold Validation
  if (raw.slaLatencyThresholdMs === undefined || raw.slaLatencyThresholdMs === null) {
    details.push("Missing required field 'slaLatencyThresholdMs'.")
  } else if (typeof raw.slaLatencyThresholdMs !== 'number' || !Number.isFinite(raw.slaLatencyThresholdMs) || raw.slaLatencyThresholdMs <= 0) {
    details.push("Field 'slaLatencyThresholdMs' must be a positive finite number (> 0 ms).")
  }

  // Arrival Pattern Validation
  if (raw.arrivalPattern !== undefined && raw.arrivalPattern !== null) {
    if (!VALID_ARRIVAL_PATTERNS.includes(raw.arrivalPattern as ArrivalPattern)) {
      details.push(`Invalid arrivalPattern '${raw.arrivalPattern}'. Supported: ${VALID_ARRIVAL_PATTERNS.join(', ')}.`)
    }
  }

  // isPublic Validation (if provided)
  if (raw.isPublic !== undefined && raw.isPublic !== null) {
    if (typeof raw.isPublic !== 'boolean') {
      details.push("Field 'isPublic' must be a boolean.")
    }
  }

  // Seed Validation
  if (raw.seed !== undefined && raw.seed !== null) {
    if (typeof raw.seed !== 'number' || !Number.isFinite(raw.seed)) {
      details.push("Field 'seed' must be a finite number.")
    }
  }

  // Adaptive Weights Validation (if provided)
  if (raw.adaptiveWeights !== undefined && raw.adaptiveWeights !== null) {
    if (typeof raw.adaptiveWeights !== 'object' || Array.isArray(raw.adaptiveWeights)) {
      details.push("Field 'adaptiveWeights' must be an object with numeric alpha, beta, gamma, delta weights.")
    } else {
      try {
        validateAdaptiveWeights(raw.adaptiveWeights as Partial<AdaptiveObjectiveWeights>)
      } catch (err: unknown) {
        details.push(err instanceof Error ? err.message : 'Invalid adaptiveWeights configuration.')
      }
    }
  }

  // Policy Results Validation
  if (!raw.policyResults) {
    details.push("Missing required field 'policyResults'.")
  } else if (!Array.isArray(raw.policyResults)) {
    details.push("Field 'policyResults' must be an array of policy result summaries.")
  } else if (raw.policyResults.length === 0) {
    details.push("Field 'policyResults' cannot be empty. Persisted experiments require policy results.")
  } else {
    raw.policyResults.forEach((pr, idx) => {
      validatePersistedPolicyResult(pr, `policyResults[${idx}]`, details)
    })
  }

  if (details.length > 0) {
    return {
      isValid: false,
      code: 'VALIDATION_ERROR',
      message: 'The experiment payload failed validation.',
      details,
    }
  }

  return {
    isValid: true,
    data: body as CreateExperimentRequestBody,
  }
}

function validatePersistedPolicyResult(pr: unknown, prefix: string, details: string[]): void {
  if (!pr || typeof pr !== 'object') {
    details.push(`${prefix} must be an object.`)
    return
  }
  const p = pr as Partial<PersistedPolicyResult>
  const normPolicy = normalizePolicyName(p.policy)
  if (!normPolicy) {
    details.push(`${prefix}.policy must be one of: ${VALID_POLICIES.join(', ')}.`)
  }
  if (typeof p.totalRequests !== 'number' || !Number.isFinite(p.totalRequests) || p.totalRequests < 0) {
    details.push(`${prefix}.totalRequests must be a non-negative finite number.`)
  }
  if (typeof p.averageLatencyMs !== 'number' || !Number.isFinite(p.averageLatencyMs) || p.averageLatencyMs < 0) {
    details.push(`${prefix}.averageLatencyMs must be a non-negative finite number.`)
  }
  if (typeof p.p95LatencyMs !== 'number' || !Number.isFinite(p.p95LatencyMs) || p.p95LatencyMs < 0) {
    details.push(`${prefix}.p95LatencyMs must be a non-negative finite number.`)
  }
  if (typeof p.totalCostUSD !== 'number' || !Number.isFinite(p.totalCostUSD) || p.totalCostUSD < 0) {
    details.push(`${prefix}.totalCostUSD must be a non-negative finite number.`)
  }
  if (typeof p.totalCarbonG !== 'number' || !Number.isFinite(p.totalCarbonG) || p.totalCarbonG < 0) {
    details.push(`${prefix}.totalCarbonG must be a non-negative finite number.`)
  }
  if (typeof p.coldStartRatePercent !== 'number' || !Number.isFinite(p.coldStartRatePercent) || p.coldStartRatePercent < 0 || p.coldStartRatePercent > 100) {
    details.push(`${prefix}.coldStartRatePercent must be a percentage between 0 and 100.`)
  }
  if (typeof p.slaViolationRatePercent !== 'number' || !Number.isFinite(p.slaViolationRatePercent) || p.slaViolationRatePercent < 0 || p.slaViolationRatePercent > 100) {
    details.push(`${prefix}.slaViolationRatePercent must be a percentage between 0 and 100.`)
  }
  if (p.averageOverheadMs !== undefined && (typeof p.averageOverheadMs !== 'number' || !Number.isFinite(p.averageOverheadMs) || p.averageOverheadMs < 0)) {
    details.push(`${prefix}.averageOverheadMs must be a non-negative finite number.`)
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface RegisterInput {
  name: string
  email: string
  password: string
}

export function validateRegisterRequest(body: unknown): ValidationResult<RegisterInput> {
  const details: string[] = []
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      code: 'INVALID_PAYLOAD',
      message: 'Request body must be a JSON object.',
      details: ['Body is not an object.'],
    }
  }

  const { name, email, password } = body as Record<string, unknown>

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    details.push('Full name is required and must be at least 2 characters.')
  } else if (name.trim().length > 100) {
    details.push('Full name must not exceed 100 characters.')
  }

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    details.push('A valid email address is required.')
  } else if (email.trim().length > 255) {
    details.push('Email address must not exceed 255 characters.')
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    details.push('Password must be at least 8 characters long.')
  } else if (password.length > 128) {
    details.push('Password must not exceed 128 characters.')
  }

  if (details.length > 0) {
    return {
      isValid: false,
      code: 'VALIDATION_FAILED',
      message: details[0],
      details,
    }
  }

  return {
    isValid: true,
    data: {
      name: (name as string).trim(),
      email: (email as string).trim().toLowerCase(),
      password: password as string,
    },
  }
}

export interface LoginInput {
  email: string
  password: string
}

export function validateLoginRequest(body: unknown): ValidationResult<LoginInput> {
  const details: string[] = []
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      code: 'INVALID_PAYLOAD',
      message: 'Request body must be a JSON object.',
      details: ['Body is not an object.'],
    }
  }

  const { email, password } = body as Record<string, unknown>

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    details.push('A valid email address is required.')
  } else if (email.trim().length > 255) {
    details.push('Email address must not exceed 255 characters.')
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    details.push('Password is required.')
  } else if (password.length > 128) {
    details.push('Password must not exceed 128 characters.')
  }

  if (details.length > 0) {
    return {
      isValid: false,
      code: 'VALIDATION_FAILED',
      message: details[0],
      details,
    }
  }

  return {
    isValid: true,
    data: {
      email: (email as string).trim().toLowerCase(),
      password: password as string,
    },
  }
}

export const MIN_BATCH_SEEDS = 30
export const MAX_BATCH_SEEDS = 100
export const MIN_BATCH_REQUEST_COUNT = 50
export const MAX_BATCH_REQUEST_COUNT = 5000
export const MAX_BATCH_TOTAL_EVALUATIONS_PRODUCT = 50000

export function validateBatchResearchRequest(body: unknown): ValidationResult<BatchResearchRequestBody> {
  const details: string[] = []

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      code: 'INVALID_JSON_BODY',
      message: 'Request payload must be a valid JSON object.',
      details: ['Expected JSON object as root payload.'],
    }
  }

  const raw = body as Record<string, unknown>

  // Seeds validation
  let validatedSeeds: number[] | undefined
  let seedCount = 30
  let startingSeed = 4200

  if (raw.seeds !== undefined && raw.seeds !== null) {
    if (!Array.isArray(raw.seeds)) {
      details.push("Field 'seeds' must be an array of numbers.")
    } else {
      const distinct = new Set<number>()
      for (const s of raw.seeds) {
        if (typeof s !== 'number' || !Number.isInteger(s)) {
          details.push('All elements in seeds must be valid integers.')
          break
        }
        distinct.add(s)
      }
      if (distinct.size < MIN_BATCH_SEEDS) {
        details.push(
          `Field 'seeds' must contain at least ${MIN_BATCH_SEEDS} distinct seeds (received ${distinct.size}).`
        )
      } else if (raw.seeds.length > MAX_BATCH_SEEDS) {
        details.push(`Field 'seeds' exceeds maximum limit of ${MAX_BATCH_SEEDS} seeds.`)
      } else {
        validatedSeeds = raw.seeds as number[]
      }
    }
  } else if (raw.seedCount !== undefined && raw.seedCount !== null) {
    if (typeof raw.seedCount !== 'number' || !Number.isInteger(raw.seedCount)) {
      details.push("Field 'seedCount' must be an integer.")
    } else if (raw.seedCount < MIN_BATCH_SEEDS) {
      details.push(
        `Field 'seedCount' must be at least ${MIN_BATCH_SEEDS} for statistically defensible results.`
      )
    } else if (raw.seedCount > MAX_BATCH_SEEDS) {
      details.push(`Field 'seedCount' exceeds maximum allowable limit of ${MAX_BATCH_SEEDS}.`)
    } else {
      seedCount = raw.seedCount
    }
  }

  if (raw.startingSeed !== undefined && raw.startingSeed !== null) {
    if (typeof raw.startingSeed !== 'number' || !Number.isInteger(raw.startingSeed)) {
      details.push("Field 'startingSeed' must be an integer.")
    } else {
      startingSeed = raw.startingSeed
    }
  }

  // Request count
  let requestCount = 500
  if (raw.requestCount !== undefined && raw.requestCount !== null) {
    if (typeof raw.requestCount !== 'number' || !Number.isInteger(raw.requestCount)) {
      details.push("Field 'requestCount' must be an integer.")
    } else if (raw.requestCount < MIN_BATCH_REQUEST_COUNT) {
      details.push(`Field 'requestCount' must be at least ${MIN_BATCH_REQUEST_COUNT}.`)
    } else if (raw.requestCount > MAX_BATCH_REQUEST_COUNT) {
      details.push(
        `Field 'requestCount' exceeds maximum allowable limit of ${MAX_BATCH_REQUEST_COUNT} per seed.`
      )
    } else {
      requestCount = raw.requestCount
    }
  }

  // Compound computation limit: seedCount * requestCount <= 50,000
  const effectiveSeedCount = validatedSeeds ? validatedSeeds.length : seedCount
  if (effectiveSeedCount * requestCount > MAX_BATCH_TOTAL_EVALUATIONS_PRODUCT) {
    details.push(
      `Combined batch computation size of ${effectiveSeedCount * requestCount} requests (${effectiveSeedCount} seeds × ${requestCount} req/seed) exceeds the allowable computation limit of ${MAX_BATCH_TOTAL_EVALUATIONS_PRODUCT} requests.`
    )
  }

  // SLA threshold
  let slaLatencyThresholdMs = 250
  if (raw.slaLatencyThresholdMs !== undefined && raw.slaLatencyThresholdMs !== null) {
    if (
      typeof raw.slaLatencyThresholdMs !== 'number' ||
      !Number.isFinite(raw.slaLatencyThresholdMs) ||
      raw.slaLatencyThresholdMs <= 0
    ) {
      details.push("Field 'slaLatencyThresholdMs' must be a strictly positive number.")
    } else {
      slaLatencyThresholdMs = raw.slaLatencyThresholdMs
    }
  }

  // Duration minutes
  let durationMinutes = 15
  if (raw.durationMinutes !== undefined && raw.durationMinutes !== null) {
    if (
      typeof raw.durationMinutes !== 'number' ||
      !Number.isFinite(raw.durationMinutes) ||
      raw.durationMinutes <= 0
    ) {
      details.push("Field 'durationMinutes' must be a positive number.")
    } else {
      durationMinutes = raw.durationMinutes
    }
  }

  // Arrival pattern
  let arrivalPattern: ArrivalPattern = 'Poisson'
  if (raw.arrivalPattern !== undefined && raw.arrivalPattern !== null) {
    const validPatterns: ArrivalPattern[] = ['Poisson', 'Steady', 'Bursty']
    if (!validPatterns.includes(raw.arrivalPattern as ArrivalPattern)) {
      details.push("Field 'arrivalPattern' must be one of: 'Poisson', 'Steady', 'Bursty'.")
    } else {
      arrivalPattern = raw.arrivalPattern as ArrivalPattern
    }
  }

  // Workload type
  let workloadType: WorkloadType = 'Medium'
  if (raw.workloadType !== undefined && raw.workloadType !== null) {
    const validWorkloads: WorkloadType[] = ['Low', 'Medium', 'High', 'Bursty', 'Cold-Start-Heavy']
    if (!validWorkloads.includes(raw.workloadType as WorkloadType)) {
      details.push(
        "Field 'workloadType' must be one of: 'Low', 'Medium', 'High', 'Bursty', 'Cold-Start-Heavy'."
      )
    } else {
      workloadType = raw.workloadType as WorkloadType
    }
  }

  // Adaptive weights (optional)
  let validatedWeights: Partial<AdaptiveObjectiveWeights> | undefined
  if (raw.adaptiveWeights !== undefined && raw.adaptiveWeights !== null) {
    if (typeof raw.adaptiveWeights !== 'object' || Array.isArray(raw.adaptiveWeights)) {
      details.push("Field 'adaptiveWeights' must be an object with numeric alpha, beta, gamma, delta weights.")
    } else {
      try {
        validateAdaptiveWeights(raw.adaptiveWeights as Partial<AdaptiveObjectiveWeights>)
        validatedWeights = raw.adaptiveWeights as Partial<AdaptiveObjectiveWeights>
      } catch (err: unknown) {
        details.push(err instanceof Error ? err.message : 'Invalid adaptiveWeights configuration.')
      }
    }
  }

  if (details.length > 0) {
    return {
      isValid: false,
      code: 'VALIDATION_FAILED',
      message: details[0],
      details,
    }
  }

  // If seeds array was not provided, generate deterministically from startingSeed and seedCount
  if (!validatedSeeds) {
    validatedSeeds = []
    for (let i = 0; i < seedCount; i++) {
      validatedSeeds.push(startingSeed + i)
    }
  }

  return {
    isValid: true,
    data: {
      seedCount: validatedSeeds.length,
      startingSeed,
      seeds: validatedSeeds,
      requestCount,
      durationMinutes,
      slaLatencyThresholdMs,
      arrivalPattern,
      workloadType,
      adaptiveWeights: validatedWeights,
      candidates: Array.isArray(raw.candidates) ? (raw.candidates as ServerlessCandidate[]) : undefined,
    },
  }
}
