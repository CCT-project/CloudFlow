import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseCommandLineArgs,
  validateRunnerConfig,
  runWorkloadBenchmark,
  runResearchBenchmark,
} from '../scripts/research-runner.ts'
import { ALL_POLICIES } from '../lib/simulation/engine.ts'

describe('CloudFlow Headless Research CLI Runner', () => {
  const testOutputDir = join(process.cwd(), 'research-results', 'test-runner-unit')

  after(() => {
    // Clean up test output directory
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true, force: true })
    }
  })

  describe('Configuration Parsing & Validation', () => {
    it('parses default CLI flags when no arguments provided', () => {
      const config = parseCommandLineArgs([])
      assert.equal(config.workload, 'all')
      assert.equal(config.requests, 1000)
      assert.equal(config.seeds, 30)
      assert.equal(config.seedStart, 4200)
      assert.equal(config.slaThresholdMs, 250)
      assert.equal(config.durationMinutes, 15)
      assert.equal(config.maxInstancesPerCandidate, 10)
      assert.equal(config.includeTraces, false)
      assert.equal(config.quiet, false)
    })

    it('parses custom CLI flags accurately', () => {
      const args = [
        '--workload', 'bursty',
        '--requests', '500',
        '--seeds', '15',
        '--seed-start', '9000',
        '--sla', '350',
        '--duration', '20',
        '--max-instances', '8',
        '--include-traces',
        '--quiet',
        '--run-id', 'custom-exp-01',
      ]
      const config = parseCommandLineArgs(args)
      assert.equal(config.workload, 'bursty')
      assert.equal(config.requests, 500)
      assert.equal(config.seeds, 15)
      assert.equal(config.seedStart, 9000)
      assert.equal(config.slaThresholdMs, 350)
      assert.equal(config.durationMinutes, 20)
      assert.equal(config.maxInstancesPerCandidate, 8)
      assert.equal(config.includeTraces, true)
      assert.equal(config.quiet, true)
      assert.equal(config.runId, 'custom-exp-01')
    })

    it('validates sanitized configuration and expands seed sequences', () => {
      const valid = validateRunnerConfig({
        workload: 'poisson',
        requests: 200,
        seeds: 5,
        seedStart: 100,
        slaThresholdMs: 200,
      })
      assert.deepEqual(valid.workloads, ['Poisson'])
      assert.equal(valid.requests, 200)
      assert.equal(valid.seeds.length, 5)
      assert.deepEqual(valid.seeds, [100, 101, 102, 103, 104])
      assert.equal(valid.slaThresholdMs, 200)
    })

    it('expands "all" workload to Steady, Poisson, and Bursty', () => {
      const valid = validateRunnerConfig({
        workload: 'all',
        requests: 100,
        seeds: 3,
      })
      assert.deepEqual(valid.workloads, ['Steady', 'Poisson', 'Bursty'])
    })

    it('throws errors on invalid workload selection', () => {
      assert.throws(
        () => validateRunnerConfig({ workload: 'invalid_type' as any }),
        /Invalid workload/
      )
    })

    it('throws errors on non-positive request count', () => {
      assert.throws(
        () => validateRunnerConfig({ requests: 0 }),
        /Invalid request count/
      )
      assert.throws(
        () => validateRunnerConfig({ requests: -50 }),
        /Invalid request count/
      )
    })

    it('throws errors on non-positive seed count or SLA threshold', () => {
      assert.throws(
        () => validateRunnerConfig({ seeds: 0 }),
        /Invalid seed count/
      )
      assert.throws(
        () => validateRunnerConfig({ slaThresholdMs: -10 }),
        /Invalid SLA threshold/
      )
    })
  })

  describe('Deterministic Multi-Seed Workload Execution & Parity', () => {
    it('evaluates all 5 policies over identical request traces per seed', () => {
      const seeds = [5001, 5002]
      const result = runWorkloadBenchmark('Steady', seeds, 100, 10, 250)

      assert.equal(result.workloadPattern, 'Steady')
      assert.equal(result.totalInvocations, 1000) // 100 requests * 2 seeds * 5 policies

      // Verify all 5 policies are present in statistics
      for (const policy of ALL_POLICIES) {
        const stats = result.policyStatistics[policy]
        assert.ok(stats, `Policy ${policy} should exist in output statistics`)
        assert.equal(stats.sampleSize, 2)
        assert.ok(stats.metrics.costUSD.mean > 0)
        assert.ok(stats.metrics.averageLatencyMs.mean > 0)
        assert.ok(stats.metrics.carbonG.mean > 0)
      }
    })

    it('guarantees deterministic bitwise reproducibility across runs with identical seed', () => {
      const seeds = [7777, 7778]
      const runA = runWorkloadBenchmark('Bursty', seeds, 50, 5, 200)
      const runB = runWorkloadBenchmark('Bursty', seeds, 50, 5, 200)

      for (const policy of ALL_POLICIES) {
        const statsA = runA.policyStatistics[policy]
        const statsB = runB.policyStatistics[policy]

        assert.equal(
          statsA.metrics.costUSD.mean,
          statsB.metrics.costUSD.mean,
          `Cost mean for ${policy} must match exactly`
        )
        assert.equal(
          statsA.metrics.averageLatencyMs.mean,
          statsB.metrics.averageLatencyMs.mean,
          `Latency mean for ${policy} must match exactly`
        )
        assert.equal(
          statsA.metrics.carbonG.mean,
          statsB.metrics.carbonG.mean,
          `Carbon mean for ${policy} must match exactly`
        )
        assert.equal(
          statsA.pooledP95LatencyMs,
          statsB.pooledP95LatencyMs,
          `Pooled P95 for ${policy} must match exactly`
        )
      }
    })
  })

  describe('Pooled Request Quantiles & Jensen Inequality Preservation', () => {
    it('computes monotonically non-decreasing pooled quantiles (P50 <= P90 <= P95 <= P99)', () => {
      const seeds = [123, 124, 125]
      const result = runWorkloadBenchmark('Poisson', seeds, 150, 10, 250)

      for (const policy of ALL_POLICIES) {
        const q = result.policyStatistics[policy].pooledQuantiles
        assert.ok(q, `Pooled quantiles should be computed for ${policy}`)
        assert.ok(q.p50 <= q.p90, `P50 (${q.p50}) must be <= P90 (${q.p90})`)
        assert.ok(q.p90 <= q.p95, `P90 (${q.p95}) must be <= P95 (${q.p95})`)
        assert.ok(q.p95 <= q.p99, `P95 (${q.p95}) must be <= P99 (${q.p99})`)
      }
    })

    it('generates paired t-tests, Holm-Bonferroni corrections, and Cohen dz for adaptive vs baselines', () => {
      const seeds = [10, 20, 30, 40]
      const result = runWorkloadBenchmark('Steady', seeds, 100, 10, 250)

      assert.ok(result.comparisons.length > 0, 'Comparisons should be generated')
      for (const comp of result.comparisons) {
        assert.ok(comp.metric, 'Metric key must be defined')
        assert.ok(comp.baselinePolicy, 'Baseline policy must be defined')
        assert.ok(typeof comp.rawPValue === 'number' && comp.rawPValue >= 0 && comp.rawPValue <= 1)
        assert.ok(typeof comp.adjustedPValue === 'number' && comp.adjustedPValue >= 0 && comp.adjustedPValue <= 1)
        assert.ok(['negligible', 'small', 'medium', 'large'].includes(comp.effectMagnitude))
      }
    })
  })

  describe('End-to-End Benchmark Execution & Artifact Export', () => {
    it('executes benchmark and generates JSON, CSV, manifest, and trace files', async () => {
      const result = await runResearchBenchmark({
        workload: 'steady',
        requests: 50,
        seeds: 3,
        seedStart: 1001,
        slaThresholdMs: 250,
        durationMinutes: 5,
        maxInstancesPerCandidate: 10,
        outputDir: testOutputDir,
        includeTraces: true,
        quiet: true,
        runId: 'e2e-unit-test-run',
      })

      assert.equal(result.runId, 'e2e-unit-test-run')
      assert.ok(existsSync(result.outputPaths.summaryJson), 'Summary JSON file must exist')
      assert.ok(existsSync(result.outputPaths.comparisonCsv), 'Comparison CSV file must exist')
      assert.ok(existsSync(result.outputPaths.reproducibilityManifest), 'Reproducibility Manifest file must exist')
      assert.ok(result.outputPaths.sampleTracesCsv && existsSync(result.outputPaths.sampleTracesCsv), 'Sample Traces CSV must exist')

      // Verify JSON summary content
      const jsonContent = JSON.parse(readFileSync(result.outputPaths.summaryJson, 'utf8'))
      assert.equal(jsonContent.runId, 'e2e-unit-test-run')
      assert.ok(jsonContent.workloadResults.Steady)
      assert.equal(jsonContent.workloadResults.Steady.totalInvocations, 750) // 50 requests * 3 seeds * 5 policies

      // Verify CSV content structure
      const csvContent = readFileSync(result.outputPaths.comparisonCsv, 'utf8')
      assert.ok(csvContent.includes('CloudFlow Research Suite: Automated Headless Benchmark Report'))
      assert.ok(csvContent.includes('POOLED REQUEST-LEVEL LATENCY QUANTILES'))
      assert.ok(csvContent.includes('PAIRED STUDENT T-TESTS & HOLM-BONFERRONI SIGNIFICANCE'))
      assert.ok(csvContent.includes('CloudFlow adaptive'))

      // Verify Reproducibility Manifest structure
      const manifestContent = JSON.parse(readFileSync(result.outputPaths.reproducibilityManifest, 'utf8'))
      assert.equal(manifestContent.runId, 'e2e-unit-test-run')
      assert.equal(manifestContent.experimentalParameters.requestsPerSeed, 50)
      assert.equal(manifestContent.experimentalParameters.seedCount, 3)
      assert.deepEqual(manifestContent.experimentalParameters.seedSequence, [1001, 1002, 1003])
      assert.ok(manifestContent.nodeVersion)
      assert.ok(manifestContent.hardwarePlatform)
      assert.ok(manifestContent.disclaimer)

      // Verify Sample Traces CSV
      const traceCsvContent = readFileSync(result.outputPaths.sampleTracesCsv!, 'utf8')
      assert.ok(traceCsvContent.startsWith('Workload,RequestId,ArrivalTimeMs,ExecutionDurationMs,SelectedCandidate,WasCold,QueueDelayMs,TotalLatencyMs,ViolatedSLA'))
    })

    it('handles single-seed execution gracefully without failing t-tests (k < 2)', () => {
      const result = runWorkloadBenchmark('Steady', [999], 50, 5, 250)
      assert.equal(result.seedCount, 1)
      assert.equal(result.comparisons.length, 0, 'No paired comparisons can be computed for k < 2')
      for (const policy of ALL_POLICIES) {
        assert.ok(result.policyStatistics[policy].metrics.averageLatencyMs.mean > 0)
      }
    })

    it('gracefully handles interrupted runs and preserves completed workload artifacts', async () => {
      const abortController = new AbortController()
      const interruptedDir = join(testOutputDir, 'interrupted-run')

      // Trigger abort immediately
      abortController.abort()

      const result = await runResearchBenchmark({
        workload: 'all',
        requests: 50,
        seeds: 2,
        outputDir: interruptedDir,
        runId: 'aborted-exp',
        quiet: true,
        abortSignal: abortController.signal,
      })

      assert.equal(result.executionStatus, 'interrupted')
      assert.ok(existsSync(result.outputPaths.summaryJson), 'Summary JSON should exist even on abort')
      assert.ok(existsSync(result.outputPaths.reproducibilityManifest), 'Manifest should exist even on abort')

      const manifestContent = JSON.parse(readFileSync(result.outputPaths.reproducibilityManifest, 'utf8'))
      assert.equal(manifestContent.executionStatus, 'interrupted')
    })
  })
})
