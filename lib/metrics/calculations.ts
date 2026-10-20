/**
 * CloudFlow Metric Calculations
 * 
 * Mathematical formulations and implementations for simulated serverless performance evaluation.
 * Note: These metrics are derived from deterministic mathematical models, not measured live from cloud APIs.
 */

/**
 * 1. Execution Cost ($ USD)
 * Formula: Cost = (durationMs * costPerMsUSD) + invocationFixedFeeUSD
 * Assumptions:
 * - Direct compute runtime duration billed per millisecond based on allocated memory/vCPU tier.
 * - Standard cloud function invocation base fee included (defaulting to $0.0000002 per invocation or modeled in costPerMsUSD).
 */
export function calculateExecutionCost(
  durationMs: number,
  costPerMsUSD: number,
  invocationFeeUSD: number = 0.0000002
): number {
  if (durationMs < 0 || costPerMsUSD < 0) {
    throw new Error('Duration and costPerMsUSD must be non-negative')
  }
  return Number((durationMs * costPerMsUSD + invocationFeeUSD).toFixed(8))
}

/**
 * 2. Estimated Carbon Emissions (grams CO2e)
 * Formula:
 *   Energy (kWh) = (averagePowerWatts * (durationMs / 3,600,000)) / 1000
 *   Emissions (g CO2e) = Energy (kWh) * gridCarbonIntensity (g CO2e/kWh)
 * Assumptions:
 * - Serverless container average thermal design power estimated at 35W per allocated active core equivalent.
 * - Regional grid marginal carbon intensity provided in g CO2e/kWh (e.g., Electricity Maps / WattTime regional benchmarks).
 */
export function calculateCarbonEmissions(
  durationMs: number,
  gridCarbonIntensityGPerKwh: number,
  averagePowerWatts: number = 35.0
): number {
  if (durationMs < 0 || gridCarbonIntensityGPerKwh < 0 || averagePowerWatts < 0) {
    throw new Error('All carbon calculation parameters must be non-negative')
  }
  // Energy in kWh = (Watts * hours) / 1000 = (Watts * (durationMs / 3,600,000)) / 1000
  const energyKwh = (averagePowerWatts * (durationMs / 3600000.0)) / 1000.0
  const emissionsG = energyKwh * gridCarbonIntensityGPerKwh
  return Number(emissionsG.toFixed(8))
}

/**
 * 3. Average Latency (ms)
 * Formula: (1 / N) * SUM(latency_i)
 */
export function calculateAverageLatency(latencies: number[]): number {
  if (latencies.length === 0) return 0
  const sum = latencies.reduce((acc, curr) => acc + curr, 0)
  return Number((sum / latencies.length).toFixed(2))
}

/**
 * 4. P95 Latency (ms)
 * Method: Nearest-rank percentile method on sorted latency array.
 * Formula:
 *   Sorted array L of length N.
 *   Rank index = ceil(0.95 * N) - 1 (0-indexed).
 */
export function calculateP95Latency(latencies: number[]): number {
  if (latencies.length === 0) return 0
  const sorted = [...latencies].sort((a, b) => a - b)
  const index = Math.max(0, Math.ceil(0.95 * sorted.length) - 1)
  return Number(sorted[index].toFixed(2))
}

/**
 * 5. Cold-Start Rate (%)
 * Formula: (coldStartsCount / totalRequests) * 100
 */
export function calculateColdStartRate(coldStartsCount: number, totalRequests: number): number {
  if (totalRequests === 0) return 0
  return Number(((coldStartsCount / totalRequests) * 100).toFixed(2))
}

/**
 * 6. SLA Violation Rate (%)
 * Formula: (slaViolationsCount / totalRequests) * 100
 */
export function calculateSlaViolationRate(slaViolationsCount: number, totalRequests: number): number {
  if (totalRequests === 0) return 0
  return Number(((slaViolationsCount / totalRequests) * 100).toFixed(2))
}
