/**
 * CloudFlow Headless Research CLI Runner
 *
 * Provides a high-throughput, memory-efficient, reproducible command-line benchmarking
 * kernel for executing large-scale serverless scheduling experiments:
 * - Supports Steady, Poisson, and Clustered Bursty workloads.
 * - Evaluates all five scheduling policies (CloudFlow adaptive + 4 baselines).
 * - Enforces identical request traces, initial warm pools, and candidate pools per seed.
 * - Scales to 1K, 5K, 10K, and 50K requests per seed across k >= 30 seeds.
 * - Calculates pooled request-level P95 latency and quantiles (P50, P90, P95, P99).
 * - Computes paired Student's t-tests, Holm-Bonferroni FWER corrections, and Cohen's dz effect sizes.
 * - Generates structured JSON, RFC-4180 CSV, and reproducibility manifests under research-results/.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import type {
  AdaptiveObjectiveWeights,
  ArrivalPattern,
  ContainerLifecycleEvent,
  EvaluatedMetric,
  PolicyBatchStatistics,
  PolicyType,
  ServerlessCandidate,
  SimulatedRequestTrace,
  WorkloadType,
} from '../lib/types/scheduler.ts'
import { DEFAULT_CANDIDATES, DEFAULT_SIMULATION_ASSUMPTIONS } from '../lib/simulation/defaults.ts'
import { ALL_POLICIES, simulatePolicyOnWorkload } from '../lib/simulation/engine.ts'
import { DeterministicPRNG, generateWorkloadRequests } from '../lib/simulation/workload.ts'
import { calculatePercentile, calculatePooledP95Latency } from '../lib/metrics/calculations.ts'
import {
  applyHolmBonferroniCorrection,
  calculateDescriptiveStatistics,
  calculatePairedTTest,
} from '../lib/research/statistics.ts'
import { escapeCSVField } from '../lib/reports/export.ts'

export interface ResearchRunnerConfig {
  workload?: 'steady' | 'poisson' | 'bursty' | 'all'
  requests?: number
  seeds?: number | number[]
  seedStart?: number
  slaThresholdMs?: number
  durationMinutes?: number
  outputDir?: string
  includeTraces?: boolean
  maxInstancesPerCandidate?: number
  adaptiveWeights?: Partial<AdaptiveObjectiveWeights>
  workloadType?: WorkloadType
  candidates?: ServerlessCandidate[]
  quiet?: boolean
  runId?: string
}

export interface MetricSummaryRow {
  policy: PolicyType
  metric: EvaluatedMetric
  sampleSize: number
  mean: number
  stdDev: number
  standardError: number
  ci95Lower: number
  ci95Upper: number
}

export interface PairedComparisonRow {
  metric: EvaluatedMetric
  baselinePolicy: PolicyType
  adaptiveMean: number
  baselineMean: number
  meanDifference: number
  percentDifference: number
  df: number
  tStatistic: number
  rawPValue: number
  adjustedPValue: number
  isSignificant: boolean
  cohensD: number
  effectMagnitude: 'negligible' | 'small' | 'medium' | 'large'
}

export interface WorkloadBenchmarkResult {
  workloadPattern: ArrivalPattern
  requestCountPerSeed: number
  seedCount: number
  seeds: number[]
  slaThresholdMs: number
  durationMinutes: number
  totalInvocations: number
  executionDurationMs: number
  policyStatistics: Record<PolicyType, PolicyBatchStatistics>
  comparisons: PairedComparisonRow[]
  representativeTraces?: SimulatedRequestTrace[]
  representativeLifecycleEvents?: ContainerLifecycleEvent[]
}

export interface ResearchRunnerResult {
  runId: string
  timestamp: string
  config: ResearchRunnerConfig
  systemMetadata: {
    nodeVersion: string
    gitCommit: string
    platform: string
    arch: string
  }
  workloadResults: Record<ArrivalPattern, WorkloadBenchmarkResult>
  outputPaths: {
    directory: string
    summaryJson: string
    comparisonCsv: string
    reproducibilityManifest: string
    sampleTracesCsv?: string
  }
}

const EVALUATED_METRIC_KEYS: EvaluatedMetric[] = [
  'costUSD',
  'carbonG',
  'averageLatencyMs',
  'p95LatencyMs',
  'coldStartRatePercent',
  'slaViolationRatePercent',
  'averageOverheadMs',
]

const BASELINE_POLICIES: PolicyType[] = [
  'Latency-first',
  'Cost-first',
  'Carbon-first',
  'Default',
]

/**
 * Retrieves the current git commit hash safely.
 */
export function getGitCommitHash(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'unknown-dev-build'
  }
}

export interface ValidatedRunnerConfig extends Required<Omit<ResearchRunnerConfig, 'seeds'>> {
  seeds: number[]
  workloads: ArrivalPattern[]
}

/**
 * Validates and normalizes CLI or programmatic configuration parameters.
 */
export function validateRunnerConfig(config: ResearchRunnerConfig): ValidatedRunnerConfig {
  const requests = config.requests ?? 1000
  if (!Number.isInteger(requests) || requests < 1) {
    throw new Error(`Invalid request count: ${requests}. Must be an integer >= 1.`)
  }

  let seeds: number[]
  const seedStart = config.seedStart ?? 4200
  if (Array.isArray(config.seeds)) {
    if (config.seeds.length === 0) {
      throw new Error('Seeds array cannot be empty.')
    }
    seeds = config.seeds
  } else {
    const seedCount = config.seeds ?? 30
    if (!Number.isInteger(seedCount) || seedCount < 1) {
      throw new Error(`Invalid seed count: ${seedCount}. Must be an integer >= 1.`)
    }
    seeds = Array.from({ length: seedCount }, (_, i) => seedStart + i)
  }

  const rawWorkload = (config.workload ?? 'all').toLowerCase()
  if (!['steady', 'poisson', 'bursty', 'all'].includes(rawWorkload)) {
    throw new Error(`Invalid workload '${config.workload}'. Supported: steady, poisson, bursty, all.`)
  }
  const workload = rawWorkload as 'steady' | 'poisson' | 'bursty' | 'all'

  const slaThresholdMs = config.slaThresholdMs ?? 250
  if (typeof slaThresholdMs !== 'number' || !Number.isFinite(slaThresholdMs) || slaThresholdMs <= 0) {
    throw new Error(`Invalid SLA threshold: ${slaThresholdMs}. Must be a strictly positive finite number.`)
  }

  const durationMinutes = config.durationMinutes ?? 15
  if (typeof durationMinutes !== 'number' || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error(`Invalid duration minutes: ${durationMinutes}. Must be a strictly positive finite number.`)
  }

  const outputDir = config.outputDir ?? 'research-results'
  const includeTraces = Boolean(config.includeTraces)
  const maxInstancesPerCandidate = config.maxInstancesPerCandidate ?? 10
  const workloadType: WorkloadType = config.workloadType ?? 'Medium'
  const candidates = config.candidates && config.candidates.length > 0 ? config.candidates : DEFAULT_CANDIDATES
  const quiet = Boolean(config.quiet)

  const adaptiveWeights: Partial<AdaptiveObjectiveWeights> = config.adaptiveWeights ?? {
    alpha: 0.35,
    beta: 0.25,
    gamma: 0.25,
    delta: 0.15,
  }

  const now = new Date()
  const dateStr = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const runId = config.runId ?? `benchmark-${dateStr}-${workload}-r${requests}-s${seeds.length}`

  const workloads: ArrivalPattern[] =
    workload === 'all'
      ? ['Steady', 'Poisson', 'Bursty']
      : workload === 'steady'
      ? ['Steady']
      : workload === 'poisson'
      ? ['Poisson']
      : ['Bursty']

  return {
    workload,
    workloads,
    requests,
    seeds,
    seedStart,
    slaThresholdMs,
    durationMinutes,
    outputDir,
    includeTraces,
    maxInstancesPerCandidate,
    adaptiveWeights,
    workloadType,
    candidates,
    quiet,
    runId,
  }
}

/**
 * Executes research benchmark for a specific arrival pattern over a sequence of seeds.
 */
export function runWorkloadBenchmark(
  pattern: ArrivalPattern,
  seeds: number[],
  requestCount: number = 1000,
  durationMinutes: number = 15,
  slaThresholdMs: number = 250,
  candidates: ServerlessCandidate[] = DEFAULT_CANDIDATES,
  adaptiveWeights: Partial<AdaptiveObjectiveWeights> = { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
  maxInstances: number = 10,
  quiet: boolean = false,
  onProgress?: (seedIndex: number, totalSeeds: number) => void
): WorkloadBenchmarkResult {
  const startTime = Date.now()

  // Structure samples per policy: Record<PolicyType, Record<EvaluatedMetric, number[]>>
  const policySamples: Record<PolicyType, Record<EvaluatedMetric, number[]>> = {
    'Latency-first': { costUSD: [], carbonG: [], averageLatencyMs: [], p95LatencyMs: [], coldStartRatePercent: [], slaViolationRatePercent: [], averageOverheadMs: [] },
    'Cost-first': { costUSD: [], carbonG: [], averageLatencyMs: [], p95LatencyMs: [], coldStartRatePercent: [], slaViolationRatePercent: [], averageOverheadMs: [] },
    'Carbon-first': { costUSD: [], carbonG: [], averageLatencyMs: [], p95LatencyMs: [], coldStartRatePercent: [], slaViolationRatePercent: [], averageOverheadMs: [] },
    'Default': { costUSD: [], carbonG: [], averageLatencyMs: [], p95LatencyMs: [], coldStartRatePercent: [], slaViolationRatePercent: [], averageOverheadMs: [] },
    'CloudFlow adaptive': { costUSD: [], carbonG: [], averageLatencyMs: [], p95LatencyMs: [], coldStartRatePercent: [], slaViolationRatePercent: [], averageOverheadMs: [] },
  }

  const pooledLatencies: Record<PolicyType, number[]> = {
    'Latency-first': [],
    'Cost-first': [],
    'Carbon-first': [],
    'Default': [],
    'CloudFlow adaptive': [],
  }

  let representativeTraces: SimulatedRequestTrace[] | undefined
  let representativeLifecycleEvents: ContainerLifecycleEvent[] | undefined

  for (let idx = 0; idx < seeds.length; idx++) {
    const seed = seeds[idx]
    const prng = new DeterministicPRNG(seed)
    // Generate identical synthetic request sequence for this seed
    const requests = generateWorkloadRequests(requestCount, durationMinutes, pattern, prng)

    // Evaluate all 5 policies consecutively over the exact same request trace
    for (const policy of ALL_POLICIES) {
      const result = simulatePolicyOnWorkload(
        requests,
        policy,
        candidates,
        slaThresholdMs,
        adaptiveWeights,
        seed,
        {
          maxInstancesPerCandidate: maxInstances,
        }
      )

      if (idx === 0 && policy === 'CloudFlow adaptive') {
        representativeTraces = result.traces
        representativeLifecycleEvents = result.lifecycleEvents
      }

      const s = result.summary
      policySamples[policy].costUSD.push(s.totalCostUSD)
      policySamples[policy].carbonG.push(s.totalCarbonG)
      policySamples[policy].averageLatencyMs.push(s.averageLatencyMs)
      policySamples[policy].p95LatencyMs.push(s.p95LatencyMs)
      policySamples[policy].coldStartRatePercent.push(s.coldStartRatePercent)
      policySamples[policy].slaViolationRatePercent.push(s.slaViolationRatePercent)
      policySamples[policy].averageOverheadMs.push(s.averageOverheadMs)

      if (result.latencies && result.latencies.length > 0) {
        pooledLatencies[policy].push(...result.latencies)
      }
    }

    if (onProgress) {
      onProgress(idx + 1, seeds.length)
    }
  }

  // Calculate descriptive statistics and true pooled request quantiles
  const policyStatistics = {} as Record<PolicyType, PolicyBatchStatistics>
  for (const policy of ALL_POLICIES) {
    const latList = pooledLatencies[policy]
    policyStatistics[policy] = {
      policy,
      sampleSize: seeds.length,
      pooledP95LatencyMs: latList.length > 0 ? calculatePooledP95Latency(latList) : undefined,
      pooledQuantiles: latList.length > 0
        ? {
            p50: calculatePercentile(latList, 50),
            p90: calculatePercentile(latList, 90),
            p95: calculatePercentile(latList, 95),
            p99: calculatePercentile(latList, 99),
          }
        : undefined,
      metrics: {
        costUSD: calculateDescriptiveStatistics(policySamples[policy].costUSD),
        carbonG: calculateDescriptiveStatistics(policySamples[policy].carbonG),
        averageLatencyMs: calculateDescriptiveStatistics(policySamples[policy].averageLatencyMs),
        p95LatencyMs: calculateDescriptiveStatistics(policySamples[policy].p95LatencyMs),
        coldStartRatePercent: calculateDescriptiveStatistics(policySamples[policy].coldStartRatePercent),
        slaViolationRatePercent: calculateDescriptiveStatistics(policySamples[policy].slaViolationRatePercent),
        averageOverheadMs: calculateDescriptiveStatistics(policySamples[policy].averageOverheadMs),
      },
    }
  }

  // Paired Student's t-tests, Holm-Bonferroni corrections, and Cohen's dz
  const comparisons: PairedComparisonRow[] = []
  for (const metric of EVALUATED_METRIC_KEYS) {
    const adaptiveValues = policySamples['CloudFlow adaptive'][metric]
    const metricComparisons = BASELINE_POLICIES.map((baseline) => {
      const baselineValues = policySamples[baseline][metric]
      const paired = calculatePairedTTest(adaptiveValues, baselineValues)
      return { baseline, paired }
    })

    const rawPairs = metricComparisons.map((m) => m.paired)
    const correctedPairs = applyHolmBonferroniCorrection(rawPairs, 0.05)

    metricComparisons.forEach((m, idx) => {
      const c = correctedPairs[idx]
      comparisons.push({
        metric,
        baselinePolicy: m.baseline,
        adaptiveMean: c.adaptiveMean,
        baselineMean: c.baselineMean,
        meanDifference: c.meanDifference,
        percentDifference: c.percentDifference,
        df: c.degreesOfFreedom,
        tStatistic: c.tStatistic,
        rawPValue: c.pValue,
        adjustedPValue: c.adjustedPValue ?? c.pValue,
        isSignificant: (c.adjustedPValue ?? c.pValue) < 0.05,
        cohensD: c.cohensDz,
        effectMagnitude: (c.effectSizeMagnitude.toLowerCase() as any),
      })
    })
  }

  const executionDurationMs = Date.now() - startTime
  const totalInvocations = seeds.length * requestCount * ALL_POLICIES.length

  return {
    workloadPattern: pattern,
    requestCountPerSeed: requestCount,
    seedCount: seeds.length,
    seeds,
    slaThresholdMs,
    durationMinutes,
    totalInvocations,
    executionDurationMs,
    policyStatistics,
    comparisons,
    representativeTraces,
    representativeLifecycleEvents,
  }
}

/**
 * Builds RFC-4180 CSV export for comprehensive research benchmark results.
 */
export function generateRunnerCSV(result: ResearchRunnerResult): string {
  const lines: string[] = []

  lines.push('CloudFlow Research Suite: Automated Headless Benchmark Report')
  lines.push('Multi-Objective Adaptive Serverless Scheduling Evaluation')
  lines.push('DISCLAIMER: All values represent deterministic model-based simulation results, NOT physical cloud hypervisor measurements.')
  lines.push('')

  // Manifest header
  lines.push('=== BENCHMARK EXECUTION MANIFEST ===')
  lines.push(`Run ID,${escapeCSVField(result.runId)}`)
  lines.push(`Timestamp,${escapeCSVField(result.timestamp)}`)
  lines.push(`Git Commit,${escapeCSVField(result.systemMetadata.gitCommit)}`)
  lines.push(`Node Version,${escapeCSVField(result.systemMetadata.nodeVersion)}`)
  lines.push(`Platform,${escapeCSVField(`${result.systemMetadata.platform} (${result.systemMetadata.arch})`)}`)
  lines.push(`Requests Per Seed,${result.config.requests}`)
  lines.push(`Total Seeds (k),${Array.isArray(result.config.seeds) ? result.config.seeds.length : result.config.seeds}`)
  lines.push(`SLA Latency Threshold (ms),${result.config.slaThresholdMs}`)
  lines.push('')

  for (const [pattern, wResult] of Object.entries(result.workloadResults)) {
    lines.push(`=== WORKLOAD: ${pattern.toUpperCase()} ===`)
    lines.push(`Workload Pattern,${pattern}`)
    lines.push(`Total Invocations Evaluated,${wResult.totalInvocations}`)
    lines.push(`Execution Runtime (ms),${wResult.executionDurationMs}`)
    lines.push('')

    // True Pooled Request Quantiles Table
    lines.push('--- POOLED REQUEST-LEVEL LATENCY QUANTILES (TRUE POPULATION QUANTILES) ---')
    lines.push([
      'Workload',
      'Policy',
      'Pooled P50 (ms)',
      'Pooled P90 (ms)',
      'Pooled P95 (ms)',
      'Pooled P99 (ms)',
      'Sample Mean P95 (ms)',
      'Methodology Note',
    ].map(escapeCSVField).join(','))

    for (const policy of ALL_POLICIES) {
      const stats = wResult.policyStatistics[policy]
      const q = stats.pooledQuantiles
      const meanP95 = stats.metrics.p95LatencyMs.mean
      lines.push([
        pattern,
        policy,
        q ? q.p50.toFixed(2) : 'N/A',
        q ? q.p90.toFixed(2) : 'N/A',
        stats.pooledP95LatencyMs ? stats.pooledP95LatencyMs.toFixed(2) : (q ? q.p95.toFixed(2) : 'N/A'),
        q ? q.p99.toFixed(2) : 'N/A',
        meanP95.toFixed(2),
        'Evaluated across all request observations concatenated, avoiding Jensen Inequality fallacy of averaging P95s',
      ].map(escapeCSVField).join(','))
    }
    lines.push('')

    // Descriptive Statistics Table
    lines.push('--- POLICY DESCRIPTIVE STATISTICS (95% CONFIDENCE INTERVALS) ---')
    lines.push([
      'Workload',
      'Policy',
      'Metric',
      'Sample Count (k)',
      'Mean',
      'Variance',
      'StdDev',
      'StdError',
      '95% CI Lower',
      '95% CI Upper',
    ].map(escapeCSVField).join(','))

    for (const policy of ALL_POLICIES) {
      const stats = wResult.policyStatistics[policy]
      for (const m of EVALUATED_METRIC_KEYS) {
        const metricStat = stats.metrics[m]
        lines.push([
          pattern,
          policy,
          m,
          metricStat.count,
          metricStat.mean,
          metricStat.variance,
          metricStat.standardDeviation,
          metricStat.standardError,
          metricStat.confidenceInterval95[0],
          metricStat.confidenceInterval95[1],
        ].map(escapeCSVField).join(','))
      }
    }
    lines.push('')

    // Paired Statistical Comparisons Table
    lines.push('--- PAIRED STUDENT T-TESTS & HOLM-BONFERRONI SIGNIFICANCE ---')
    lines.push([
      'Workload',
      'Metric',
      'Baseline Policy',
      'Adaptive Mean',
      'Baseline Mean',
      'Mean Difference',
      'Percent Difference (%)',
      'Degrees of Freedom (df)',
      't-Statistic',
      'Raw p-Value',
      'Holm-Bonferroni Adjusted p-Value',
      'Statistically Significant (alpha=0.05)',
      "Cohen's dz",
      'Effect Magnitude',
    ].map(escapeCSVField).join(','))

    for (const comp of wResult.comparisons) {
      lines.push([
        pattern,
        comp.metric,
        comp.baselinePolicy,
        comp.adaptiveMean.toFixed(4),
        comp.baselineMean.toFixed(4),
        comp.meanDifference.toFixed(4),
        comp.percentDifference.toFixed(2),
        comp.df,
        comp.tStatistic.toFixed(4),
        comp.rawPValue.toExponential(4),
        comp.adjustedPValue.toExponential(4),
        comp.isSignificant ? 'TRUE' : 'FALSE',
        comp.cohensD.toFixed(3),
        comp.effectMagnitude,
      ].map(escapeCSVField).join(','))
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Main execution entrypoint for running research experiments.
 */
export async function runResearchBenchmark(rawConfig: ResearchRunnerConfig): Promise<ResearchRunnerResult> {
  const config = validateRunnerConfig(rawConfig)
  const targetWorkloads: ArrivalPattern[] = config.workloads

  const targetDir = isAbsolute(config.outputDir)
    ? join(config.outputDir, config.runId)
    : join(process.cwd(), config.outputDir, config.runId)
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true })
  }

  if (!config.quiet) {
    console.log('='.repeat(78))
    console.log('   CLOUDFLOW HEADLESS RESEARCH BENCHMARK RUNNER')
    console.log('='.repeat(78))
    console.log(`Run Identifier:       ${config.runId}`)
    console.log(`Requests per Seed:    ${config.requests.toLocaleString()}`)
    console.log(`Seeds Count (k):      ${config.seeds.length} (Seeds: ${config.seeds[0]}..${config.seeds[config.seeds.length - 1]})`)
    console.log(`Workloads Selected:   ${targetWorkloads.join(', ')}`)
    console.log(`Evaluated Policies:   ${ALL_POLICIES.join(', ')}`)
    console.log(`SLA Latency Target:   ${config.slaThresholdMs} ms`)
    console.log(`Output Directory:     ${targetDir}`)
    console.log('-'.repeat(78))
  }

  const workloadResults = {} as Record<ArrivalPattern, WorkloadBenchmarkResult>

  for (let wIdx = 0; wIdx < targetWorkloads.length; wIdx++) {
    const pattern = targetWorkloads[wIdx]
    if (!config.quiet) {
      console.log(`\n[Workload ${wIdx + 1}/${targetWorkloads.length}] Running pattern: ${pattern.toUpperCase()}`)
    }

    const wStart = Date.now()
    const result = runWorkloadBenchmark(
      pattern,
      config.seeds,
      config.requests,
      config.durationMinutes,
      config.slaThresholdMs,
      config.candidates,
      config.adaptiveWeights,
      config.maxInstancesPerCandidate,
      config.quiet,
      (currentSeed, totalSeeds) => {
        if (!config.quiet && (currentSeed === 1 || currentSeed % 5 === 0 || currentSeed === totalSeeds)) {
          const pct = ((currentSeed / totalSeeds) * 100).toFixed(0)
          const elapsed = ((Date.now() - wStart) / 1000).toFixed(1)
          process.stdout.write(`\r  Progress: Seed ${currentSeed}/${totalSeeds} (${pct}%) | Elapsed: ${elapsed}s    `)
        }
      }
    )

    if (!config.quiet) {
      const elapsed = ((Date.now() - wStart) / 1000).toFixed(2)
      console.log(`\n  Done in ${elapsed}s. Evaluated ${result.totalInvocations.toLocaleString()} total policy invocations.`)
      // Print quick summary table
      console.log('  ' + '-'.repeat(74))
      console.log(`  ${'Policy'.padEnd(20)} | ${'Cost ($)'.padEnd(10)} | ${'Carbon (g)'.padEnd(10)} | ${'Avg Lat (ms)'.padEnd(12)} | ${'Pooled P95'.padEnd(12)}`)
      console.log('  ' + '-'.repeat(74))
      for (const pol of ALL_POLICIES) {
        const stats = result.policyStatistics[pol]
        const cost = `$${stats.metrics.costUSD.mean.toFixed(5)}`
        const carb = `${stats.metrics.carbonG.mean.toFixed(2)}g`
        const avgL = `${stats.metrics.averageLatencyMs.mean.toFixed(1)}ms`
        const p95L = `${(stats.pooledP95LatencyMs ?? stats.metrics.p95LatencyMs.mean).toFixed(1)}ms`
        console.log(`  ${pol.padEnd(20)} | ${cost.padEnd(10)} | ${carb.padEnd(10)} | ${avgL.padEnd(12)} | ${p95L.padEnd(12)}`)
      }
      console.log('  ' + '-'.repeat(74))
    }

    workloadResults[pattern] = result
  }

  const finalResult: ResearchRunnerResult = {
    runId: config.runId,
    timestamp: new Date().toISOString(),
    config,
    systemMetadata: {
      nodeVersion: process.version,
      gitCommit: getGitCommitHash(),
      platform: process.platform,
      arch: process.arch,
    },
    workloadResults,
    outputPaths: {
      directory: targetDir,
      summaryJson: join(targetDir, 'benchmark-summary.json'),
      comparisonCsv: join(targetDir, 'policy-comparison.csv'),
      reproducibilityManifest: join(targetDir, 'reproducibility-manifest.json'),
    },
  }

  // 1. Export summary JSON
  writeFileSync(finalResult.outputPaths.summaryJson, JSON.stringify(finalResult, null, 2), 'utf8')

  // 2. Export comparison CSV
  const csvContent = generateRunnerCSV(finalResult)
  writeFileSync(finalResult.outputPaths.comparisonCsv, csvContent, 'utf8')

  // 3. Export Reproducibility Manifest
  const manifest = {
    manifestVersion: '1.0',
    title: 'CloudFlow Reproducibility Manifest',
    runId: config.runId,
    timestamp: finalResult.timestamp,
    gitCommit: finalResult.systemMetadata.gitCommit,
    nodeVersion: finalResult.systemMetadata.nodeVersion,
    hardwarePlatform: `${finalResult.systemMetadata.platform}-${finalResult.systemMetadata.arch}`,
    experimentalParameters: {
      workloadPatterns: targetWorkloads,
      requestsPerSeed: config.requests,
      seedCount: config.seeds.length,
      seedSequence: config.seeds,
      slaLatencyThresholdMs: config.slaThresholdMs,
      durationMinutes: config.durationMinutes,
      maxInstancesPerCandidate: config.maxInstancesPerCandidate,
      adaptiveWeights: config.adaptiveWeights,
    },
    candidates: config.candidates.map((c) => ({
      id: c.id,
      name: c.name,
      provider: c.provider,
      region: c.region,
      baseLatencyMs: c.baseLatencyMs,
      coldStartLatencyMs: c.coldStartLatencyMs,
      costPerMsUSD: c.costPerMsUSD,
      carbonIntensityGPerKwh: c.carbonIntensityGPerKwh,
    })),
    simulationAssumptions: DEFAULT_SIMULATION_ASSUMPTIONS,
    reproductionCommand: `pnpm research --workload ${config.workload} --requests ${config.requests} --seeds ${config.seeds.length} --seed-start ${config.seedStart} --sla ${config.slaThresholdMs}`,
    disclaimer: 'Deterministic model-based simulation results calibrated against empirical cloud provider characteristics.',
  }
  writeFileSync(finalResult.outputPaths.reproducibilityManifest, JSON.stringify(manifest, null, 2), 'utf8')

  // 4. Optional representative traces CSV
  if (config.includeTraces) {
    const tracesPath = join(targetDir, 'sample-traces.csv')
    finalResult.outputPaths.sampleTracesCsv = tracesPath
    const traceLines: string[] = []
    traceLines.push('Workload,RequestId,ArrivalTimeMs,ExecutionDurationMs,SelectedCandidate,WasCold,QueueDelayMs,TotalLatencyMs,ViolatedSLA')
    for (const [pattern, wRes] of Object.entries(workloadResults)) {
      if (wRes.representativeTraces) {
        for (const t of wRes.representativeTraces) {
          traceLines.push([
            pattern,
            t.requestId,
            t.arrivalTimeMs.toFixed(2),
            (t.executionDurationMs ?? 0).toFixed(2),
            escapeCSVField(t.selectedCandidateName),
            t.isColdStart ? 'TRUE' : 'FALSE',
            (t.queueingDelayMs ?? 0).toFixed(2),
            t.latencyMs.toFixed(2),
            !t.meetsSLA ? 'TRUE' : 'FALSE',
          ].join(','))
        }
      }
    }
    writeFileSync(tracesPath, traceLines.join('\n'), 'utf8')
  }

  if (!config.quiet) {
    console.log('\n' + '='.repeat(78))
    console.log('   EXPERIMENT EXECUTION COMPLETE — ALL ARTIFACTS PERSISTED')
    console.log('='.repeat(78))
    console.log(`📁 Target Directory:       ${targetDir}`)
    console.log(`📄 Summary JSON:           ${finalResult.outputPaths.summaryJson}`)
    console.log(`📊 Comparison CSV:         ${finalResult.outputPaths.comparisonCsv}`)
    console.log(`📜 Manifest:               ${finalResult.outputPaths.reproducibilityManifest}`)
    if (finalResult.outputPaths.sampleTracesCsv) {
      console.log(`📈 Sample Traces CSV:      ${finalResult.outputPaths.sampleTracesCsv}`)
    }
    console.log('='.repeat(78) + '\n')
  }

  return finalResult
}

/**
 * Command-line interface parser
 */
export function parseCommandLineArgs(args: string[]): ResearchRunnerConfig {
  const config: ResearchRunnerConfig = {
    workload: 'all',
    requests: 1000,
    seeds: 30,
    seedStart: 4200,
    slaThresholdMs: 250,
    durationMinutes: 15,
    maxInstancesPerCandidate: 10,
    includeTraces: false,
    quiet: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--help' || arg === '-h') {
      console.log(`
CloudFlow Headless Research Benchmark CLI Runner

Usage:
  pnpm research [options]
  node scripts/research-runner.ts [options]

Options:
  -w, --workload <type>       Workload pattern: steady, poisson, bursty, all (default: all)
  -r, --requests <number>     Requests per seed (e.g. 1000, 5000, 10000, 50000) (default: 1000)
  -s, --seeds <number>        Number of paired seeds (k >= 30 recommended) (default: 30)
  --seed-start <number>       Initial PRNG seed integer (default: 4200)
  --sla <number>              SLA latency threshold in milliseconds (default: 250)
  --duration <number>         Synthetic workload duration in minutes (default: 15)
  -M, --max-instances <num>   Maximum concurrent instances per candidate pool (default: 10)
  -o, --output-dir <path>     Directory to store results (default: research-results)
  --include-traces            Include representative sample request traces CSV
  --quiet, -q                 Suppress verbose console output
  --run-id <name>             Custom run identifier for output directory
  -h, --help                  Display this help message

Examples:
  pnpm research --workload steady --requests 1000 --seeds 30
  pnpm research --workload poisson --requests 5000 --seeds 30
  pnpm research --workload bursty --requests 10000 --seeds 30
  pnpm research --workload all --requests 1000 --seeds 30
`)
      process.exit(0)
    } else if (arg === '--workload' || arg === '-w') {
      config.workload = (args[++i] as any)
    } else if (arg === '--requests' || arg === '-r') {
      config.requests = parseInt(args[++i], 10)
    } else if (arg === '--seeds' || arg === '-s') {
      config.seeds = parseInt(args[++i], 10)
    } else if (arg === '--seed-start') {
      config.seedStart = parseInt(args[++i], 10)
    } else if (arg === '--sla') {
      config.slaThresholdMs = parseFloat(args[++i])
    } else if (arg === '--duration') {
      config.durationMinutes = parseFloat(args[++i])
    } else if (arg === '--max-instances' || arg === '-M') {
      config.maxInstancesPerCandidate = parseInt(args[++i], 10)
    } else if (arg === '--output-dir' || arg === '-o') {
      config.outputDir = args[++i]
    } else if (arg === '--include-traces') {
      config.includeTraces = true
    } else if (arg === '--quiet' || arg === '-q') {
      config.quiet = true
    } else if (arg === '--run-id') {
      config.runId = args[++i]
    }
  }

  return config
}

// Direct CLI execution guard
const isDirectExecution = (): boolean => {
  if (!process.argv[1]) return false
  try {
    const currentFilePath = fileURLToPath(import.meta.url)
    return resolve(process.argv[1]) === resolve(currentFilePath)
  } catch {
    return false
  }
}

if (isDirectExecution()) {
  try {
    const config = parseCommandLineArgs(process.argv.slice(2))
    runResearchBenchmark(config)
      .then(() => {
        process.exit(0)
      })
      .catch((err) => {
        console.error('\n❌ Execution Error:', err instanceof Error ? err.message : String(err))
        process.exit(1)
      })
  } catch (err) {
    console.error('\n❌ Configuration Error:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
