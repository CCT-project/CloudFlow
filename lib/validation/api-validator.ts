import type {
  AdaptiveObjectiveWeights,
  PolicyType,
  ScheduleEvaluateRequestBody,
  ServerlessCandidate,
  SimulateRequestBody,
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
