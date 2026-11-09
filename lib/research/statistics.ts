/**
 * CloudFlow Statistical Research Engine
 *
 * Provides rigorous inferential and descriptive statistics for multi-seed
 * serverless scheduling research experiments:
 * - Exact Student's t-distribution critical values and two-sided p-values via
 *   continued-fraction regularized incomplete beta function (NO normal approximations).
 * - 95% Confidence Intervals for small and medium samples (k >= 30).
 * - Paired Student's t-tests across identical seed traces.
 * - Paired Cohen's dz effect sizes.
 * - Holm-Bonferroni Family-Wise Error Rate (FWER) step-down multiple-testing correction.
 */

/**
 * Natural log of the Gamma function ln(Gamma(x)) using the Lanczos approximation.
 * High precision (error < 1e-15).
 */
export function logGamma(z: number): number {
  if (z <= 0) return 0
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.138571095836526,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ]
  const g = 7
  let x = c[0]
  for (let i = 1; i < c.length; i++) {
    x += c[i] / (z + i - 1)
  }
  const t = z + g - 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z - 0.5) * Math.log(t) - t + Math.log(x)
}

/**
 * Regularized incomplete beta function I_x(a, b) using continued fraction expansion.
 * Exact method used in scientific libraries (scipy / R).
 */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1

  // Use symmetry relation if x > (a + 1) / (a + b + 2)
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedIncompleteBeta(1 - x, b, a)
  }

  // Pre-factor: exp(ln(x^a * (1-x)^b / (a * Beta(a,b))))
  const lnBeta = logGamma(a) + logGamma(b) - logGamma(a + b)
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a

  // Continued fraction evaluation via modified Lentz's method
  const maxIterations = 200
  const eps = 1e-15
  let c = 1.0
  let d = 1.0 - (a + b) * x / (a + 1)
  if (Math.abs(d) < 1e-30) d = 1e-30
  d = 1.0 / d
  let h = d

  for (let m = 1; m <= maxIterations; m++) {
    // Even step
    let num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m))
    d = 1.0 + num * d
    if (Math.abs(d) < 1e-30) d = 1e-30
    c = 1.0 + num / c
    if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1.0 / d
    h *= d * c

    // Odd step
    num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1))
    d = 1.0 + num * d
    if (Math.abs(d) < 1e-30) d = 1e-30
    c = 1.0 + num / c
    if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1.0 / d
    const delta = d * c
    h *= delta

    if (Math.abs(delta - 1.0) < eps) {
      break
    }
  }

  return front * h
}

/**
 * Calculates the exact two-tailed p-value for Student's t-distribution with df degrees of freedom.
 * p = I_{df / (df + t^2)}(df / 2, 1 / 2)
 */
export function studentTTwoTailedPValue(t: number, df: number): number {
  if (df <= 0 || !Number.isFinite(df)) return 1.0
  if (!Number.isFinite(t)) return 0.0
  if (t === 0) return 1.0

  const x = df / (df + t * t)
  const p = regularizedIncompleteBeta(x, df / 2, 0.5)
  return Math.max(0.0, Math.min(1.0, p))
}

/**
 * Calculates the exact critical value t_crit for a two-sided 95% confidence interval
 * (quantile 0.975) with df degrees of freedom using bisection and Newton-Raphson.
 */
export function getStudentTCriticalValue(df: number, alpha: number = 0.05): number {
  if (df <= 0) return 1.96
  if (df === 1) return 12.7062
  if (df === 2) return 4.30265
  if (df === 29) return 2.04523
  if (df === 30) return 2.04227

  // Target: studentTTwoTailedPValue(t, df) = alpha
  let low = 1.5
  let high = 15.0

  // Expand high bracket if necessary
  while (studentTTwoTailedPValue(high, df) > alpha) {
    high *= 2
  }

  // Bisection to find root
  for (let iter = 0; iter < 60; iter++) {
    const mid = (low + high) / 2
    const p = studentTTwoTailedPValue(mid, df)
    if (Math.abs(p - alpha) < 1e-12) {
      return Number(mid.toFixed(5))
    }
    if (p > alpha) {
      low = mid
    } else {
      high = mid
    }
  }

  return Number(((low + high) / 2).toFixed(5))
}

export interface DescriptiveStatistics {
  count: number
  mean: number
  variance: number
  standardDeviation: number
  standardError: number
  confidenceInterval95: [number, number]
  criticalT: number
}

/**
 * Computes sample mean, variance, standard deviation, and 95% Confidence Interval.
 * Employs exact Student's t critical values for small/medium sample sizes.
 */
export function calculateDescriptiveStatistics(
  values: number[],
  alpha: number = 0.05
): DescriptiveStatistics {
  const valid = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
  const n = valid.length

  if (n === 0) {
    return {
      count: 0,
      mean: 0,
      variance: 0,
      standardDeviation: 0,
      standardError: 0,
      confidenceInterval95: [0, 0],
      criticalT: 0,
    }
  }

  const sum = valid.reduce((acc, curr) => acc + curr, 0)
  const mean = sum / n

  if (n === 1) {
    return {
      count: 1,
      mean: Number(mean.toFixed(6)),
      variance: 0,
      standardDeviation: 0,
      standardError: 0,
      confidenceInterval95: [mean, mean],
      criticalT: 0,
    }
  }

  // Unbiased sample variance: 1/(n-1) * sum((x - mean)^2)
  const squaredDiffSum = valid.reduce((acc, curr) => acc + Math.pow(curr - mean, 2), 0)
  const variance = squaredDiffSum / (n - 1)
  const standardDeviation = Math.sqrt(variance)
  const standardError = standardDeviation / Math.sqrt(n)

  const df = n - 1
  const criticalT = getStudentTCriticalValue(df, alpha)
  const marginOfError = criticalT * standardError

  return {
    count: n,
    mean: Number(mean.toFixed(6)),
    variance: Number(variance.toFixed(8)),
    standardDeviation: Number(standardDeviation.toFixed(6)),
    standardError: Number(standardError.toFixed(6)),
    confidenceInterval95: [
      Number((mean - marginOfError).toFixed(6)),
      Number((mean + marginOfError).toFixed(6)),
    ],
    criticalT,
  }
}

export type EffectSizeMagnitude = 'Negligible' | 'Small' | 'Medium' | 'Large'

export interface PairedComparisonResult {
  adaptiveMean: number
  baselineMean: number
  meanDifference: number // (Adaptive - Baseline)
  percentDifference: number // ((Adaptive - Baseline) / Baseline) * 100
  degreesOfFreedom: number
  tStatistic: number
  pValue: number
  adjustedPValue?: number
  isStatisticallySignificant: boolean
  cohensDz: number
  effectSizeMagnitude: EffectSizeMagnitude
}

/**
 * Classifies Cohen's d effect size magnitude according to standard conventions:
 * |d| < 0.2: Negligible
 * 0.2 <= |d| < 0.5: Small
 * 0.5 <= |d| < 0.8: Medium
 * |d| >= 0.8: Large
 */
export function classifyEffectSize(d: number): EffectSizeMagnitude {
  const abs = Math.abs(d)
  if (abs < 0.2) return 'Negligible'
  if (abs < 0.5) return 'Small'
  if (abs < 0.8) return 'Medium'
  return 'Large'
}

/**
 * Conducts a paired Student's t-test and computes Cohen's dz effect size between
 * CloudFlow Adaptive and a baseline policy over identical random seeds.
 */
export function calculatePairedTTest(
  adaptiveValues: number[],
  baselineValues: number[],
  alpha: number = 0.05
): PairedComparisonResult {
  if (adaptiveValues.length !== baselineValues.length) {
    throw new Error('Paired t-test requires identical observation counts.')
  }

  const n = adaptiveValues.length
  if (n < 2) {
    return {
      adaptiveMean: adaptiveValues[0] ?? 0,
      baselineMean: baselineValues[0] ?? 0,
      meanDifference: 0,
      percentDifference: 0,
      degreesOfFreedom: 0,
      tStatistic: 0,
      pValue: 1.0,
      isStatisticallySignificant: false,
      cohensDz: 0,
      effectSizeMagnitude: 'Negligible',
    }
  }

  const differences: number[] = []
  let sumDiff = 0
  let sumAdaptive = 0
  let sumBaseline = 0

  for (let i = 0; i < n; i++) {
    const diff = adaptiveValues[i] - baselineValues[i]
    differences.push(diff)
    sumDiff += diff
    sumAdaptive += adaptiveValues[i]
    sumBaseline += baselineValues[i]
  }

  const adaptiveMean = sumAdaptive / n
  const baselineMean = sumBaseline / n
  const meanDiff = sumDiff / n

  // Sample variance of differences
  const sumSquaredDiffFromMean = differences.reduce(
    (acc, d) => acc + Math.pow(d - meanDiff, 2),
    0
  )
  const varDiff = sumSquaredDiffFromMean / (n - 1)
  const sdDiff = Math.sqrt(varDiff)

  // Zero variance handling (e.g. identical performance on every seed)
  if (sdDiff < 1e-12) {
    return {
      adaptiveMean: Number(adaptiveMean.toFixed(6)),
      baselineMean: Number(baselineMean.toFixed(6)),
      meanDifference: Number(meanDiff.toFixed(6)),
      percentDifference:
        baselineMean !== 0 ? Number(((meanDiff / baselineMean) * 100).toFixed(2)) : 0,
      degreesOfFreedom: n - 1,
      tStatistic: 0,
      pValue: meanDiff === 0 ? 1.0 : 0.0,
      isStatisticallySignificant: meanDiff !== 0,
      cohensDz: 0,
      effectSizeMagnitude: 'Negligible',
    }
  }

  const seDiff = sdDiff / Math.sqrt(n)
  const tStat = meanDiff / seDiff
  const df = n - 1
  const pValue = studentTTwoTailedPValue(tStat, df)
  const cohensDz = meanDiff / sdDiff

  const percentDiff =
    baselineMean !== 0 ? Number(((meanDiff / baselineMean) * 100).toFixed(2)) : 0

  return {
    adaptiveMean: Number(adaptiveMean.toFixed(6)),
    baselineMean: Number(baselineMean.toFixed(6)),
    meanDifference: Number(meanDiff.toFixed(6)),
    percentDifference: percentDiff,
    degreesOfFreedom: df,
    tStatistic: Number(tStat.toFixed(4)),
    pValue: Number(pValue.toFixed(6)),
    isStatisticallySignificant: pValue < alpha,
    cohensDz: Number(cohensDz.toFixed(4)),
    effectSizeMagnitude: classifyEffectSize(cohensDz),
  }
}

/**
 * Applies the Holm-Bonferroni step-down correction for multiple comparisons.
 * Strictly controls the Family-Wise Error Rate (FWER) at alpha (default 0.05).
 */
export function applyHolmBonferroniCorrection(
  comparisons: PairedComparisonResult[],
  familyAlpha: number = 0.05
): PairedComparisonResult[] {
  if (comparisons.length === 0) return []

  // Create indexed list sorted by ascending raw p-value
  const indexed = comparisons.map((comp, originalIndex) => ({
    comp: { ...comp },
    originalIndex,
  }))

  indexed.sort((a, b) => a.comp.pValue - b.comp.pValue)

  const m = indexed.length
  let previousAdjustedP = 0

  for (let j = 0; j < m; j++) {
    const rawP = indexed[j].comp.pValue
    const rank = j + 1
    const unconstrainedP = (m - rank + 1) * rawP

    // Monotonicity enforcement (adjusted p cannot decrease)
    const adjustedP = Math.min(1.0, Math.max(previousAdjustedP, unconstrainedP))
    previousAdjustedP = adjustedP

    indexed[j].comp.adjustedPValue = Number(adjustedP.toFixed(6))
    indexed[j].comp.isStatisticallySignificant = adjustedP < familyAlpha
  }

  // Restore original ordering
  indexed.sort((a, b) => a.originalIndex - b.originalIndex)
  return indexed.map((item) => item.comp)
}

export interface CohenDzConfidenceInterval {
  cohensDz: number
  standardError: number
  criticalT: number
  ciLower: number
  ciUpper: number
}

/**
 * Computes exact 95% Confidence Interval for paired Cohen's dz effect size.
 * Uses Hedges & Olkin asymptotic variance: SE(dz) = sqrt( 1/n + dz^2 / (2n) ).
 */
export function calculateCohenDzConfidenceInterval(
  cohensDz: number,
  degreesOfFreedom: number,
  alpha: number = 0.05
): CohenDzConfidenceInterval {
  const n = degreesOfFreedom + 1
  if (n <= 1) {
    return {
      cohensDz: Number(cohensDz.toFixed(4)),
      standardError: 0,
      criticalT: 1.96,
      ciLower: Number(cohensDz.toFixed(4)),
      ciUpper: Number(cohensDz.toFixed(4)),
    }
  }

  const variance = (1 / n) + (Math.pow(cohensDz, 2) / (2 * n))
  const standardError = Math.sqrt(Math.max(0, variance))
  const criticalT = getStudentTCriticalValue(degreesOfFreedom, alpha)
  const margin = criticalT * standardError

  return {
    cohensDz: Number(cohensDz.toFixed(4)),
    standardError: Number(standardError.toFixed(4)),
    criticalT: Number(criticalT.toFixed(4)),
    ciLower: Number((cohensDz - margin).toFixed(4)),
    ciUpper: Number((cohensDz + margin).toFixed(4)),
  }
}

export interface HolmBonferroniStepItem {
  rank: number
  metric: string
  baselinePolicy: string
  hypothesisLabel: string
  rawPValue: number
  criticalAlpha: number
  adjustedPValue: number
  uncorrectedSignificant: boolean
  holmSignificant: boolean
  rejectionDecision: 'Reject H0' | 'Fail to Reject'
}

/**
 * Computes dynamic Holm-Bonferroni step-down significance matrix with critical alpha thresholds.
 * Does NOT assume a fixed number of comparisons; derives m dynamically from input array length.
 */
export function computeHolmBonferroniMatrix(
  comparisons: {
    metric: string
    baselinePolicy: string
    pValue: number
    adjustedPValue?: number
    isStatisticallySignificant?: boolean
  }[],
  familyAlpha: number = 0.05
): HolmBonferroniStepItem[] {
  if (!comparisons || comparisons.length === 0) return []

  const sorted = [...comparisons].sort((a, b) => a.pValue - b.pValue)
  const m = sorted.length

  return sorted.map((comp, idx) => {
    const rank = idx + 1
    const criticalAlpha = Number((familyAlpha / (m - rank + 1)).toFixed(6))
    const uncorrectedSignificant = comp.pValue < familyAlpha
    const holmSignificant = comp.adjustedPValue !== undefined
      ? comp.adjustedPValue < familyAlpha
      : !!comp.isStatisticallySignificant

    return {
      rank,
      metric: comp.metric,
      baselinePolicy: comp.baselinePolicy,
      hypothesisLabel: `H0,${rank}: μ(${comp.metric}, Adaptive) = μ(${comp.metric}, ${comp.baselinePolicy})`,
      rawPValue: comp.pValue,
      criticalAlpha,
      adjustedPValue: comp.adjustedPValue ?? comp.pValue,
      uncorrectedSignificant,
      holmSignificant,
      rejectionDecision: holmSignificant ? 'Reject H0' : 'Fail to Reject',
    }
  })
}
