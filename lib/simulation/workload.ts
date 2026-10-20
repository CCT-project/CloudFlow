import type { ArrivalPattern } from '../types/scheduler.ts'

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
 */
export function generateWorkloadRequests(
  requestCount: number,
  durationMinutes: number,
  pattern: ArrivalPattern,
  prng: DeterministicPRNG
): SyntheticRequest[] {
  const durationMs = durationMinutes * 60 * 1000
  const requests: SyntheticRequest[] = []

  let currentTimeMs = 0
  const averageIntervalMs = durationMs / Math.max(1, requestCount)

  for (let i = 1; i <= requestCount; i++) {
    let intervalMs = averageIntervalMs

    if (pattern === 'Poisson') {
      // Exponential distribution: -ln(1 - U) * meanInterval
      const u = Math.max(0.0001, prng.next())
      intervalMs = -Math.log(1 - u) * averageIntervalMs
    } else if (pattern === 'Bursty') {
      // Bursty traffic: alternate between dense bursts and quiet intervals
      const isBurst = prng.next() < 0.25
      intervalMs = isBurst ? averageIntervalMs * 0.15 : averageIntervalMs * 1.35
    } else {
      // Steady pattern with small jitter (+/- 10%)
      const jitter = (prng.next() - 0.5) * 0.2
      intervalMs = averageIntervalMs * (1 + jitter)
    }

    currentTimeMs = Math.min(durationMs, currentTimeMs + Math.max(1, intervalMs))

    // Execution time typically has log-normal or bounded normal characteristics:
    // Base 60ms to 240ms duration
    const executionDurationMs = Math.round(60 + prng.next() * 180)

    requests.push({
      id: i,
      arrivalTimeMs: Math.round(currentTimeMs),
      executionDurationMs,
    })
  }

  return requests
}
