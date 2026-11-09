import type { ArrivalPattern, WorkloadType } from '../types/scheduler.ts'

/**
 * Documented estimates of typical serverless function execution durations by workload type (ms).
 * Used for SLA feasibility estimation prior to runtime duration resolution.
 */
export const WORKLOAD_EXECUTION_ESTIMATES: Record<WorkloadType, number> = {
  'Low': 80,
  'Medium': 150,
  'High': 200,
  'Bursty': 150,
  'Cold-Start-Heavy': 150,
}

export const DEFAULT_LATENCY_MARGIN_MS = 0

/**
 * Resolves expected function execution duration from actual value, explicit estimate,
 * or documented workload category defaults.
 */
export function resolveExpectedExecutionDuration(options: {
  executionDurationMs?: number
  expectedExecutionDurationMs?: number
  workloadType?: WorkloadType
}): number {
  if (typeof options.executionDurationMs === 'number' && Number.isFinite(options.executionDurationMs) && options.executionDurationMs >= 0) {
    return options.executionDurationMs
  }
  if (typeof options.expectedExecutionDurationMs === 'number' && Number.isFinite(options.expectedExecutionDurationMs) && options.expectedExecutionDurationMs >= 0) {
    return options.expectedExecutionDurationMs
  }
  if (options.workloadType && WORKLOAD_EXECUTION_ESTIMATES[options.workloadType]) {
    return WORKLOAD_EXECUTION_ESTIMATES[options.workloadType]
  }
  return 0
}

/**
 * Resolves latency safety margin.
 */
export function resolveLatencyMargin(latencyMarginMs?: number): number {
  if (typeof latencyMarginMs === 'number' && Number.isFinite(latencyMarginMs) && latencyMarginMs >= 0) {
    return latencyMarginMs
  }
  return DEFAULT_LATENCY_MARGIN_MS
}

/**
 * Deterministic Pseudo-Random Number Generator (Mulberry32).
 * Produces reproducible sequences of floating-point numbers in [0, 1).
 */
export class DeterministicPRNG {
  private state: number

  constructor(seed: number = 4242) {
    this.state = Math.floor(seed) >>> 0
  }

  /** Returns pseudo-random float in [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Returns pseudo-random integer in [min, max] inclusive */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }
}

export interface SyntheticRequest {
  id: number
  arrivalTimeMs: number
  executionDurationMs: number
}

/**
 * Generates synthetic workload requests deterministically.
 * Uses independent, decoupled PRNG streams for arrival timestamps and execution durations
 * ensuring that different arrival patterns produce realistic inter-arrival dynamics
 * without altering or desynchronizing runtime compute durations.
 */
export function generateWorkloadRequests(
  requestCount: number,
  durationMinutes: number,
  pattern: ArrivalPattern,
  prng: DeterministicPRNG,
  workloadType?: WorkloadType
): SyntheticRequest[] {
  const durationMs = durationMinutes * 60 * 1000
  const requests: SyntheticRequest[] = []

  // Decoupled independent PRNG stream for execution durations
  const durationSeed = (prng.nextInt(1, 2147483647) ^ 0x6d2b79f5) >>> 0
  const durationPrng = new DeterministicPRNG(durationSeed)

  // Execution duration parameters based on workload type
  let minDurMs = 60
  let maxDurMs = 240
  if (workloadType === 'Low') {
    minDurMs = 40
    maxDurMs = 120
  } else if (workloadType === 'High') {
    minDurMs = 120
    maxDurMs = 280
  }

  let currentTimeMs = 0
  const averageIntervalMs = durationMs / Math.max(1, requestCount)

  // Clustered burst state variables
  let inBurstMode = false
  let burstRemaining = 0

  for (let i = 1; i <= requestCount; i++) {
    let intervalMs = averageIntervalMs

    if (pattern === 'Poisson') {
      // Exponential distribution: -ln(1 - U) * meanInterval
      const u = Math.max(0.0001, prng.next())
      intervalMs = -Math.log(1 - u) * averageIntervalMs
    } else if (pattern === 'Bursty') {
      // Clustered burst arrival process
      if (burstRemaining <= 0) {
        // 25% probability of entering a high-concurrency burst cluster
        const enterBurst = prng.next() < 0.25
        if (enterBurst) {
          inBurstMode = true
          burstRemaining = prng.nextInt(3, 8) // Cluster of 3 to 8 concurrent requests
        } else {
          inBurstMode = false
        }
      }

      if (inBurstMode && burstRemaining > 0) {
        // High-concurrency arrival: requests arrive within 5ms to 35ms
        intervalMs = Math.round(5 + prng.next() * 30)
        burstRemaining--
      } else {
        // Inter-burst pacing interval
        const jitter = (prng.next() - 0.5) * 0.3
        intervalMs = averageIntervalMs * 1.5 * (1 + jitter)
      }
    } else {
      // Steady pattern with small pacing jitter (+/- 10%)
      const jitter = (prng.next() - 0.5) * 0.2
      intervalMs = averageIntervalMs * (1 + jitter)
    }

    currentTimeMs = Math.min(durationMs, currentTimeMs + Math.max(1, intervalMs))

    // Execution time is drawn from the independent duration stream
    const executionDurationMs = Math.round(minDurMs + durationPrng.next() * (maxDurMs - minDurMs))

    requests.push({
      id: i,
      arrivalTimeMs: Math.round(currentTimeMs),
      executionDurationMs,
    })
  }

  return requests
}
