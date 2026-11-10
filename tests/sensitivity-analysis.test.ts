import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_SLA_THRESHOLDS_MS,
  DEFAULT_WORKLOAD_PATTERNS,
  SENSITIVITY_WEIGHT_PRESETS,
  evaluatePracticalSignificance,
  generateSensitivityCsv,
  generateSensitivityManifest,
  generateSensitivityReportMarkdown,
  normalizeWeights,
  runSensitivityAnalysis,
  validateSlaThresholds,
  type SensitivityConfig,
} from '../lib/research/sensitivity.ts'
import { validateAdaptiveWeights } from '../lib/scheduler/adaptive-policy.ts'
import { executeSensitivityRun, parseSensitivityArgs } from '../scripts/sensitivity-runner.ts'

describe('CloudFlow Sensitivity Analysis Framework', () => {
  describe('Adaptive Weight Validation & Presets', () => {
    it('validates that all predefined weight presets sum to 1.0 within tolerance', () => {
      const presets = Object.values(SENSITIVITY_WEIGHT_PRESETS)
      assert.ok(presets.length >= 5, 'Must contain at least 5 presets')

      for (const p of presets) {
        const validated = validateAdaptiveWeights(p.weights)
        const sum = validated.alpha + validated.beta + validated.gamma + validated.delta
        assert.ok(
          Math.abs(sum - 1.0) <= 0.001,
          `Preset ${p.id} weights must sum to 1.0, got ${sum}`
        )
        assert.ok(validated.alpha >= 0, `${p.id} alpha must be non-negative`)
        assert.ok(validated.beta >= 0, `${p.id} beta must be non-negative`)
        assert.ok(validated.gamma >= 0, `${p.id} gamma must be non-negative`)
        assert.ok(validated.delta >= 0, `${p.id} delta must be non-negative`)
      }
    })

    it('correctly normalizes arbitrary positive weight ratios', () => {
      const normalized = normalizeWeights({ alpha: 2, beta: 1, gamma: 1, delta: 0 })
      const sum = normalized.alpha + normalized.beta + normalized.gamma + normalized.delta
      assert.ok(Math.abs(sum - 1.0) <= 0.001, `Normalized weights must sum to 1.0, got ${sum}`)
      assert.equal(normalized.alpha, 0.5)
      assert.equal(normalized.beta, 0.25)
      assert.equal(normalized.gamma, 0.25)
      assert.equal(normalized.delta, 0.0)
    })

    it('rejects weights with sum zero or negative in normalizeWeights', () => {
      assert.throws(() => {
        normalizeWeights({ alpha: 0, beta: 0, gamma: 0, delta: 0 })
      }, /Weight sum must be strictly positive/)
    })

    it('rejects invalid, negative, or non-finite weights via validateAdaptiveWeights', () => {
      assert.throws(() => {
        validateAdaptiveWeights({ alpha: -0.2, beta: 0.4, gamma: 0.4, delta: 0.4 })
      }, /cannot be negative/)

      assert.throws(() => {
        validateAdaptiveWeights({ alpha: NaN, beta: 0.3, gamma: 0.3, delta: 0.4 })
      }, /must be a finite number/)

      assert.throws(() => {
        validateAdaptiveWeights({ alpha: 0.5, beta: 0.5, gamma: 0.5, delta: 0.5 })
      }, /must sum to 1.0/)
    })
  })

  describe('SLA Threshold Configuration & Validation', () => {
    it('validates default SLA threshold sequence', () => {
      const validated = validateSlaThresholds(DEFAULT_SLA_THRESHOLDS_MS)
      assert.deepEqual(validated, [150, 250, 400, 600])
    })

    it('deduplicates and sorts user-provided SLA thresholds', () => {
      const validated = validateSlaThresholds([500, 100, 250, 100, 300])
      assert.deepEqual(validated, [100, 250, 300, 500])
    })

    it('rejects empty, negative, or non-finite SLA lists', () => {
      assert.throws(() => {
        validateSlaThresholds([])
      }, /non-empty array/)

      assert.throws(() => {
        validateSlaThresholds([200, -50, 300])
      }, /strictly positive/)

      assert.throws(() => {
        validateSlaThresholds([200, Infinity])
      }, /strictly positive finite number/)
    })
  })

  describe('Deterministic Execution & Trace Parity', () => {
    it('produces identical metric results across consecutive runs with identical seed sequences', async () => {
      const config: SensitivityConfig = {
        dimension: 'weights',
        requests: 25,
        seeds: [1001, 1002],
        weightPresets: ['balanced'],
        quiet: true,
      }

      const run1 = await runSensitivityAnalysis(config)
      const run2 = await runSensitivityAnalysis(config)

      assert.equal(run1.allResults.length, run2.allResults.length)
      const r1Stats = run1.allResults[0].policyStatistics['Adaptive (Balanced)']
      const r2Stats = run2.allResults[0].policyStatistics['Adaptive (Balanced)']

      assert.equal(r1Stats.averageLatencyMs.mean, r2Stats.averageLatencyMs.mean)
      assert.equal(r1Stats.costUSD.mean, r2Stats.costUSD.mean)
      assert.equal(r1Stats.carbonG.mean, r2Stats.carbonG.mean)
      assert.equal(r1Stats.pooledQuantiles.p95, r2Stats.pooledQuantiles.p95)
    })
  })

  describe('Statistical Calculations & Practical Significance', () => {
    it('evaluates practical significance based on domain thresholds and Cohen dz', () => {
      // Cost difference > 5% with dz >= 0.2 is practically significant
      const resCost = evaluatePracticalSignificance('costUSD', 8.5, 0.00005, 0.45, true)
      assert.equal(resCost.isPracticallySignificant, true)

      // Cost difference < 5% is not practically significant despite statistical significance
      const resCostSmall = evaluatePracticalSignificance('costUSD', 1.2, 0.00001, 0.15, true)
      assert.equal(resCostSmall.isPracticallySignificant, false)

      // Latency difference > 10ms is practically significant
      const resLat = evaluatePracticalSignificance('averageLatencyMs', 15.0, 18.5, 0.65, true)
      assert.equal(resLat.isPracticallySignificant, true)

      // Statistically non-significant differences cannot be practically significant
      const resNonSig = evaluatePracticalSignificance('averageLatencyMs', 25.0, 30.0, 1.2, false)
      assert.equal(resNonSig.isPracticallySignificant, false)
    })
  })

  describe('Sensitivity Evaluation Matrix Generation', () => {
    it('executes sensitivity analysis across weights, SLA, and workloads on small grid', async () => {
      const config: SensitivityConfig = {
        dimension: 'full',
        requests: 15,
        seeds: [5001, 5002],
        slas: [150, 400],
        weightPresets: ['balanced', 'cost_prioritized'],
        workloads: ['Steady', 'Poisson'],
        quiet: true,
      }

      const res = await runSensitivityAnalysis(config)

      assert.ok(res.weightSensitivity && res.weightSensitivity.length === 2)
      assert.ok(res.slaSensitivity && res.slaSensitivity.length === 2)
      assert.ok(res.workloadSensitivity && res.workloadSensitivity.length === 2)
      assert.equal(res.allResults.length, 6)

      // Verify pooled quantiles are non-decreasing
      for (const cond of res.allResults) {
        for (const [pol, stats] of Object.entries(cond.policyStatistics)) {
          const q = stats.pooledQuantiles
          assert.ok(q.p50 <= q.p90, `${pol} P50 must be <= P90`)
          assert.ok(q.p90 <= q.p95, `${pol} P90 must be <= P95`)
          assert.ok(q.p95 <= q.p99, `${pol} P95 must be <= P99`)
          assert.ok(stats.sampleMeanP95Ms > 0, `${pol} sampleMeanP95Ms must be positive`)
        }

        // Verify paired comparisons contain Holm-Bonferroni adjusted p-values
        assert.ok(cond.comparisonsVsBaselines.length > 0)
        for (const comp of cond.comparisonsVsBaselines) {
          assert.ok(comp.degreesOfFreedom === 1, 'df must be k - 1 = 1 for 2 seeds')
          assert.ok(typeof comp.tStatistic === 'number')
          assert.ok(typeof comp.pValue === 'number')
          assert.ok(typeof comp.adjustedPValue === 'number')
          assert.ok(comp.adjustedPValue >= comp.pValue, 'Adjusted p-value must be >= raw p-value')
          assert.ok(typeof comp.cohensDz === 'number')
          assert.ok(typeof comp.isPracticallySignificant === 'boolean')
        }
      }
    })
  })

  describe('Artifact Generation & CLI Integration', () => {
    const testOutputDir = 'research-results/unit-test-sensitivity'

    it('parses CLI arguments correctly in both space-separated and equals formats', () => {
      const parsed = parseSensitivityArgs([
        '--mode', 'sla',
        '--requests', '250',
        '--seeds', '15',
        '--seed-start', '100',
        '--slas', '200,300,500',
        '--weights', 'balanced,cost_prioritized',
        '--workload', 'poisson',
        '--output-dir', 'test-output',
        '--quiet',
      ])

      assert.equal(parsed.dimension, 'sla')
      assert.equal(parsed.requests, 250)
      assert.equal(parsed.seeds, 15)
      assert.equal(parsed.seedStart, 100)
      assert.deepEqual(parsed.slas, [200, 300, 500])
      assert.deepEqual(parsed.weightPresets, ['balanced', 'cost_prioritized'])
      assert.deepEqual(parsed.workloads, ['Poisson'])
      assert.equal(parsed.outputDir, 'test-output')
      assert.equal(parsed.quiet, true)

      // Verify equals-separated flags
      const parsedEquals = parseSensitivityArgs([
        '--mode=weights',
        '--requests=100',
        '--seeds=5',
        '--slas=150,250',
        '--workload=steady',
      ])
      assert.equal(parsedEquals.dimension, 'weights')
      assert.equal(parsedEquals.requests, 100)
      assert.equal(parsedEquals.seeds, 5)
      assert.deepEqual(parsedEquals.slas, [150, 250])
      assert.deepEqual(parsedEquals.workloads, ['Steady'])
    })

    it('rejects invalid request counts, non-positive seeds, and empty seed arrays', async () => {
      await assert.rejects(async () => {
        await runSensitivityAnalysis({ requests: -5, quiet: true })
      }, /Invalid request count/)

      await assert.rejects(async () => {
        await runSensitivityAnalysis({ seeds: 0, quiet: true })
      }, /Invalid seed count/)

      await assert.rejects(async () => {
        await runSensitivityAnalysis({ seeds: [], quiet: true })
      }, /Seeds array cannot be empty/)

      await assert.rejects(async () => {
        await runSensitivityAnalysis({ seeds: [1.5], quiet: true })
      }, /Must be an integer/)
    })

    it('generates compliant CSV, Manifest, and Markdown artifacts on disk', async () => {
      const execResult = await executeSensitivityRun({
        dimension: 'weights',
        requests: 10,
        seeds: [7001, 7002],
        weightPresets: ['balanced'],
        outputDir: testOutputDir,
        quiet: true,
      })

      assert.ok(existsSync(execResult.paths.summaryJson), 'summaryJson must exist')
      assert.ok(existsSync(execResult.paths.resultsCsv), 'resultsCsv must exist')
      assert.ok(existsSync(execResult.paths.manifestJson), 'manifestJson must exist')
      assert.ok(existsSync(execResult.paths.reportMd), 'reportMd must exist')

      // Verify CSV content
      const csvContent = readFileSync(execResult.paths.resultsCsv, 'utf8')
      assert.ok(csvContent.includes('DISCLAIMER: All values represent deterministic model-based simulation results'))
      assert.ok(csvContent.includes('Adaptive (Balanced)'))

      // Verify Manifest content
      const manifestContent = JSON.parse(readFileSync(execResult.paths.manifestJson, 'utf8'))
      assert.equal(manifestContent.title, 'CloudFlow Sensitivity Analysis Reproducibility Manifest')
      assert.equal(manifestContent.gitCommit, 'd8299bbf0497de650da838fb4cf51c54e4b49ce0')
      assert.deepEqual(manifestContent.experimentalGrid.seeds, [7001, 7002])

      // Verify Markdown content
      const mdContent = readFileSync(execResult.paths.reportMd, 'utf8')
      assert.ok(mdContent.includes('# CloudFlow Adaptive Scheduler: Sensitivity Analysis Report'))
      assert.ok(mdContent.includes('Dimension 1: Adaptive Objective Weight Sensitivity'))
      assert.ok(mdContent.includes('Jensen’s Inequality Fallacy Avoidance'))

      // Clean up test output
      rmSync(testOutputDir, { recursive: true, force: true })
    })
  })
})
