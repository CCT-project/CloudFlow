import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyHolmBonferroniCorrection,
  calculateDescriptiveStatistics,
  calculatePairedTTest,
  getStudentTCriticalValue,
  logGamma,
  regularizedIncompleteBeta,
  studentTTwoTailedPValue,
} from '../lib/research/statistics.ts'

test('Research Statistics: logGamma accurately matches analytical factorial values', () => {
  // Gamma(1) = 0! = 1 -> ln(1) = 0
  assert.ok(Math.abs(logGamma(1)) < 1e-12)

  // Gamma(5) = 4! = 24 -> ln(24) = 3.1780538303479458
  const ln24 = Math.log(24)
  assert.ok(Math.abs(logGamma(5) - ln24) < 1e-10)

  // Gamma(0.5) = sqrt(pi) -> ln(sqrt(pi)) = 0.5 * ln(pi)
  const lnSqrtPi = 0.5 * Math.log(Math.PI)
  assert.ok(Math.abs(logGamma(0.5) - lnSqrtPi) < 1e-12)
})

test('Research Statistics: Exact Student t critical values match standard reference tables', () => {
  // df = 29 (n = 30): t_crit = 2.04523
  const tCrit29 = getStudentTCriticalValue(29)
  assert.equal(tCrit29, 2.04523, 'df=29 must equal 2.04523')

  // df = 30: t_crit = 2.04227
  const tCrit30 = getStudentTCriticalValue(30)
  assert.equal(tCrit30, 2.04227, 'df=30 must equal 2.04227')

  // df = 1: t_crit = 12.7062
  const tCrit1 = getStudentTCriticalValue(1)
  assert.equal(tCrit1, 12.7062, 'df=1 must equal 12.7062')

  // df = 10: reference t_crit = 2.22814
  const tCrit10 = getStudentTCriticalValue(10)
  assert.ok(Math.abs(tCrit10 - 2.22814) <= 0.001, `df=10 expected ~2.22814, got ${tCrit10}`)

  // As df -> infinity, t_crit approaches Gaussian z = 1.95996
  const tCrit1000 = getStudentTCriticalValue(1000)
  assert.ok(Math.abs(tCrit1000 - 1.95996) <= 0.01, `df=1000 expected ~1.96, got ${tCrit1000}`)
})

test('Research Statistics: Two-tailed p-values match exact Student t distributions', () => {
  // t = 0 -> p = 1.0
  assert.equal(studentTTwoTailedPValue(0, 29), 1.0)

  // At exact critical value t = 2.04523 with df = 29, p-value must equal alpha = 0.05
  const pCrit = studentTTwoTailedPValue(2.04523, 29)
  assert.ok(Math.abs(pCrit - 0.05) < 0.0005, `Expected p=0.05 at critical value, got ${pCrit}`)

  // Large t-statistic (e.g. t = 5.0, df = 29) -> very small p-value
  const pExtreme = studentTTwoTailedPValue(5.0, 29)
  assert.ok(pExtreme < 0.0001, 'Extreme t-statistic must produce p < 0.0001')
})

test('Research Statistics: calculateDescriptiveStatistics computes unbiased sample statistics and 95% CIs', () => {
  // Reference dataset: 10 observations with known properties
  // [10, 12, 14, 16, 18, 20, 22, 24, 26, 28]
  const data = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28]
  const stats = calculateDescriptiveStatistics(data)

  assert.equal(stats.count, 10)
  // Mean = (10+...+28)/10 = 190 / 10 = 19.0
  assert.equal(stats.mean, 19.0)

  // Unbiased Sample Variance: sum((x - 19)^2) / 9
  // diffs: -9, -7, -5, -3, -1, 1, 3, 5, 7, 9
  // squares: 81 + 49 + 25 + 9 + 1 + 1 + 9 + 25 + 49 + 81 = 330
  // s^2 = 330 / 9 = 36.666667
  assert.ok(Math.abs(stats.variance - 36.666667) < 0.001)

  // Standard Deviation: sqrt(36.666667) = 6.055301
  assert.ok(Math.abs(stats.standardDeviation - 6.055301) < 0.001)

  // Standard Error: 6.055301 / sqrt(10) = 1.914854
  assert.ok(Math.abs(stats.standardError - 1.914854) < 0.001)

  // 95% CI: mean +/- tCrit * SE
  // df = 9, tCrit ~ 2.26216
  // Margin of error = 2.26216 * 1.914854 = 4.3317
  // CI: [14.6683, 23.3317]
  assert.ok(stats.confidenceInterval95[0] < stats.mean)
  assert.ok(stats.confidenceInterval95[1] > stats.mean)
  assert.ok(Math.abs(stats.confidenceInterval95[0] - (19 - 4.3317)) < 0.01)
})

test('Research Statistics: calculatePairedTTest accurately evaluates paired experimental designs', () => {
  // 5 seeds paired comparison between Adaptive and Baseline
  const adaptive = [10, 12, 14, 15, 13]
  const baseline = [15, 17, 18, 19, 17]
  // differences: [-5, -5, -4, -4, -4]
  // mean diff = -4.4
  // var diff = ((-5+4.4)^2*2 + (-4+4.4)^2*3) / 4 = (0.72 + 0.48) / 4 = 1.2 / 4 = 0.3
  // sd diff = sqrt(0.3) = 0.547723
  // tStat = -4.4 / (0.547723 / sqrt(5)) = -4.4 / 0.244949 = -17.9629

  const paired = calculatePairedTTest(adaptive, baseline)

  assert.equal(paired.adaptiveMean, 12.8)
  assert.equal(paired.baselineMean, 17.2)
  assert.equal(paired.meanDifference, -4.4)
  assert.ok(Math.abs(paired.tStatistic - -17.9629) < 0.01)
  assert.ok(paired.pValue < 0.0001, 'Extremely significant paired difference')
  assert.equal(paired.isStatisticallySignificant, true)

  // Cohen's dz: meanDiff / sdDiff = -4.4 / 0.547723 = -8.0333
  assert.ok(Math.abs(paired.cohensDz - -8.0333) < 0.01)
  assert.equal(paired.effectSizeMagnitude, 'Large')
})

test('Research Statistics: Holm-Bonferroni step-down correction strictly controls FWER', () => {
  // 4 paired hypotheses with distinct p-values
  const comparisons = [
    { pValue: 0.015 } as any, // comp 0
    { pValue: 0.005 } as any, // comp 1 (smallest)
    { pValue: 0.040 } as any, // comp 2
    { pValue: 0.200 } as any, // comp 3 (largest)
  ]

  const corrected = applyHolmBonferroniCorrection(comparisons, 0.05)

  // Sorted order:
  // Rank 1: p = 0.005 * (4 - 1 + 1) = 0.005 * 4 = 0.020 (< 0.05 -> Significant)
  // Rank 2: p = 0.015 * (4 - 2 + 1) = 0.015 * 3 = 0.045 (< 0.05 -> Significant)
  // Rank 3: p = 0.040 * (4 - 3 + 1) = 0.040 * 2 = 0.080 (>= 0.05 -> NOT Significant)
  // Rank 4: p = 0.200 * (4 - 4 + 1) = 0.200 * 1 = 0.200 (>= 0.05 -> NOT Significant)

  assert.equal(corrected[1].adjustedPValue, 0.02)
  assert.equal(corrected[1].isStatisticallySignificant, true)

  assert.equal(corrected[0].adjustedPValue, 0.045)
  assert.equal(corrected[0].isStatisticallySignificant, true)

  assert.equal(corrected[2].adjustedPValue, 0.08)
  assert.equal(corrected[2].isStatisticallySignificant, false)

  assert.equal(corrected[3].adjustedPValue, 0.2)
  assert.equal(corrected[3].isStatisticallySignificant, false)
})

test('Research Statistics: Handles edge cases (zero variance, identical values, empty samples)', () => {
  // 1. Empty samples
  const empty = calculateDescriptiveStatistics([])
  assert.equal(empty.count, 0)
  assert.equal(empty.mean, 0)

  // 2. Single observation
  const single = calculateDescriptiveStatistics([42])
  assert.equal(single.count, 1)
  assert.equal(single.mean, 42)
  assert.equal(single.standardDeviation, 0)

  // 3. Zero variance in paired test (identical diff on every seed)
  const pairedZeroVar = calculatePairedTTest([10, 10, 10], [10, 10, 10])
  assert.equal(pairedZeroVar.meanDifference, 0)
  assert.equal(pairedZeroVar.isStatisticallySignificant, false)
  assert.equal(pairedZeroVar.pValue, 1.0)
})
