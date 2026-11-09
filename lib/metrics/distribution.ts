import type { PolicyType } from '../types/scheduler.ts'
import { calculatePercentile } from './calculations.ts'

export interface HistogramBin {
  binStart: number
  binEnd: number
  binLabel: string
  count: number
  frequencyPercent: number
}

export interface MultiPolicyHistogramRow {
  binStart: number
  binEnd: number
  binLabel: string
  [policy: string]: number | string
}

export interface CdfDataPoint {
  latencyMs: number
  cumulativeProbabilityPercent: number
}

export interface MultiPolicyCdfRow {
  latencyMs: number
  [policy: string]: number
}

export interface EmpiricalQuantileSummary {
  sampleCount: number
  min: number
  max: number
  p50: number
  p90: number
  p95: number
  p99: number
  slaViolationRatePercent: number
}

/**
 * Builds empirical histogram bins of configurable width for a single array of latencies.
 */
export function buildHistogramBins(
  latencies: number[],
  binWidth: number = 25,
  minBound?: number,
  maxBound?: number
): HistogramBin[] {
  if (!latencies || latencies.length === 0 || binWidth <= 0) {
    return []
  }

  const min = minBound !== undefined ? minBound : Math.floor(Math.min(...latencies) / binWidth) * binWidth
  const max = maxBound !== undefined ? maxBound : Math.ceil(Math.max(...latencies) / binWidth) * binWidth

  const numBins = Math.max(1, Math.ceil((max - min) / binWidth))
  const bins: HistogramBin[] = []

  for (let i = 0; i < numBins; i++) {
    const start = min + i * binWidth
    const end = start + binWidth
    bins.push({
      binStart: start,
      binEnd: end,
      binLabel: `${start}–${end}ms`,
      count: 0,
      frequencyPercent: 0,
    })
  }

  for (const lat of latencies) {
    let index = Math.floor((lat - min) / binWidth)
    if (index >= numBins) index = numBins - 1
    if (index < 0) index = 0
    bins[index].count++
  }

  for (const b of bins) {
    b.frequencyPercent = Number(((b.count / latencies.length) * 100).toFixed(2))
  }

  return bins
}

/**
 * Builds synchronized multi-policy histogram data sharing identical bin boundaries.
 */
export function buildMultiPolicyHistogram(
  latencyMap: Partial<Record<PolicyType, number[]>>,
  binWidth: number = 25
): { bins: MultiPolicyHistogramRow[]; policies: PolicyType[] } {
  const activePolicies = (Object.keys(latencyMap) as PolicyType[]).filter(
    (p) => (latencyMap[p]?.length ?? 0) > 0
  )

  if (activePolicies.length === 0 || binWidth <= 0) {
    return { bins: [], policies: [] }
  }

  let globalMin = Infinity
  let globalMax = -Infinity

  for (const pol of activePolicies) {
    const arr = latencyMap[pol]!
    for (const v of arr) {
      if (v < globalMin) globalMin = v
      if (v > globalMax) globalMax = v
    }
  }

  if (globalMin === Infinity || globalMax === -Infinity) {
    return { bins: [], policies: activePolicies }
  }

  const roundedMin = Math.max(0, Math.floor(globalMin / binWidth) * binWidth)
  const roundedMax = Math.ceil(globalMax / binWidth) * binWidth
  const numBins = Math.max(1, Math.ceil((roundedMax - roundedMin) / binWidth))

  const rows: MultiPolicyHistogramRow[] = []
  for (let i = 0; i < numBins; i++) {
    const start = roundedMin + i * binWidth
    const end = start + binWidth
    const row: MultiPolicyHistogramRow = {
      binStart: start,
      binEnd: end,
      binLabel: `${start}–${end}ms`,
    }
    for (const pol of activePolicies) {
      row[pol] = 0
    }
    rows.push(row)
  }

  for (const pol of activePolicies) {
    const arr = latencyMap[pol]!
    const total = arr.length
    if (total === 0) continue

    for (const lat of arr) {
      let index = Math.floor((lat - roundedMin) / binWidth)
      if (index >= numBins) index = numBins - 1
      if (index < 0) index = 0
      rows[index][pol] = ((rows[index][pol] as number) || 0) + 1
    }
  }

  return { bins: rows, policies: activePolicies }
}

/**
 * Builds empirical Cumulative Distribution Function (CDF) for a single latency series.
 */
export function buildEmpiricalCdf(latencies: number[]): CdfDataPoint[] {
  if (!latencies || latencies.length === 0) return []

  const sorted = [...latencies].sort((a, b) => a - b)
  const n = sorted.length
  const cdfPoints: CdfDataPoint[] = []

  let prevLat = -1
  for (let i = 0; i < n; i++) {
    const lat = Number(sorted[i].toFixed(1))
    if (lat !== prevLat || i === n - 1) {
      const prob = Number((((i + 1) / n) * 100).toFixed(2))
      cdfPoints.push({
        latencyMs: lat,
        cumulativeProbabilityPercent: prob,
      })
      prevLat = lat
    }
  }

  return cdfPoints
}

/**
 * Builds aligned empirical CDF data across multiple policies on a shared continuous evaluation grid.
 */
export function buildMultiPolicyCdf(
  latencyMap: Partial<Record<PolicyType, number[]>>,
  gridSteps: number = 60
): { cdfData: MultiPolicyCdfRow[]; policies: PolicyType[] } {
  const activePolicies = (Object.keys(latencyMap) as PolicyType[]).filter(
    (p) => (latencyMap[p]?.length ?? 0) > 0
  )

  if (activePolicies.length === 0) {
    return { cdfData: [], policies: [] }
  }

  let minLat = 0
  let maxLat = -Infinity

  const sortedMap: Partial<Record<PolicyType, number[]>> = {}
  for (const pol of activePolicies) {
    const sorted = [...latencyMap[pol]!].sort((a, b) => a - b)
    sortedMap[pol] = sorted
    const pMax = sorted[sorted.length - 1]
    if (pMax > maxLat) maxLat = pMax
  }

  if (maxLat <= 0) {
    return { cdfData: [], policies: activePolicies }
  }

  const step = Math.max(1, (maxLat - minLat) / gridSteps)
  const rows: MultiPolicyCdfRow[] = []

  for (let current = minLat; current <= maxLat + step * 0.5; current += step) {
    const latencyPoint = Number(current.toFixed(1))
    const row: MultiPolicyCdfRow = { latencyMs: latencyPoint }

    for (const pol of activePolicies) {
      const arr = sortedMap[pol]!
      // Binary search / upper bound count
      let low = 0
      let high = arr.length
      while (low < high) {
        const mid = (low + high) >>> 1
        if (arr[mid] <= latencyPoint) {
          low = mid + 1
        } else {
          high = mid
        }
      }
      const probPercent = Number(((low / arr.length) * 100).toFixed(2))
      row[pol] = probPercent
    }

    rows.push(row)
  }

  return { cdfData: rows, policies: activePolicies }
}

/**
 * Summarizes pooled empirical quantiles for a policy.
 */
export function summarizeEmpiricalQuantiles(
  values: number[],
  slaThresholdMs: number = 250
): EmpiricalQuantileSummary {
  if (!values || values.length === 0) {
    return {
      sampleCount: 0,
      min: 0,
      max: 0,
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      slaViolationRatePercent: 0,
    }
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const p50 = calculatePercentile(values, 50)
  const p90 = calculatePercentile(values, 90)
  const p95 = calculatePercentile(values, 95)
  const p99 = calculatePercentile(values, 99)

  const slaViolations = values.filter((v) => v > slaThresholdMs).length
  const slaViolationRatePercent = Number(((slaViolations / values.length) * 100).toFixed(2))

  return {
    sampleCount: values.length,
    min: Number(min.toFixed(1)),
    max: Number(max.toFixed(1)),
    p50,
    p90,
    p95,
    p99,
    slaViolationRatePercent,
  }
}
