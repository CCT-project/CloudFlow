#!/usr/bin/env node
/**
 * CloudFlow Headless Sensitivity Analysis CLI Runner
 *
 * Standalone executable for evaluating CloudFlow Adaptive across varying scheduling weights,
 * SLA latency thresholds, and workload traffic conditions.
 *
 * Usage:
 *   node scripts/sensitivity-runner.ts [flags]
 *   npm run sensitivity -- [flags]
 *
 * Examples:
 *   node scripts/sensitivity-runner.ts --mode full --requests 1000 --seeds 30
 *   node scripts/sensitivity-runner.ts --mode weights --requests 500 --seeds 10
 *   node scripts/sensitivity-runner.ts --mode sla --slas 150,250,400,600 --requests 100 --seeds 5
 *   node scripts/sensitivity-runner.ts --mode workloads --requests 1000 --seeds 30
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  runSensitivityAnalysis,
  generateSensitivityCsv,
  generateSensitivityManifest,
  generateSensitivityReportMarkdown,
  type SensitivityConfig,
  type SensitivityDimension,
} from '../lib/research/sensitivity.ts'
import type { ArrivalPattern } from '../lib/types/scheduler.ts'

export function parseSensitivityArgs(rawArgs: string[]): SensitivityConfig {
  const config: SensitivityConfig = {}
  const args = [...rawArgs]

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--help' || arg === '-h') {
      console.log(`
CloudFlow Sensitivity Analysis CLI Runner

Options:
  --mode, -m <type>          Sensitivity dimension: 'weights', 'sla', 'workloads', or 'full' (default: full)
  --dimension <type>         Alias for --mode
  --requests, -r <n>         Request count per seed (default: 1000)
  --seeds, -s <k>            Number of paired random seeds (default: 30)
  --seed-start <n>           Initial seed value (default: 4200)
  --slas <list>              Comma-separated SLA thresholds in ms (e.g., 150,250,400,600)
  --weights, -w <list>       Comma-separated weight presets or 'all' (default: all)
  --workload <type>          Workload pattern: 'steady', 'poisson', 'bursty', or 'all' (default: all)
  --output-dir, -o <path>    Output directory (default: research-results)
  --quiet, -q                Suppress console progress output
  --help, -h                 Display this help manual

Examples:
  node scripts/sensitivity-runner.ts --mode full --requests 1000 --seeds 30
  node scripts/sensitivity-runner.ts --mode weights --requests 500 --seeds 10
  node scripts/sensitivity-runner.ts --mode sla --slas 150,250,400,600
`)
      process.exit(0)
    } else if (arg === '--mode' || arg === '-m' || arg === '--dimension') {
      const val = (args[++i] || '').toLowerCase()
      if (!['weights', 'sla', 'workloads', 'full'].includes(val)) {
        throw new Error(`Invalid sensitivity mode '${val}'. Supported: weights, sla, workloads, full.`)
      }
      config.dimension = val as SensitivityDimension
    } else if (arg === '--requests' || arg === '-r') {
      config.requests = parseInt(args[++i], 10)
    } else if (arg === '--seeds' || arg === '-s') {
      config.seeds = parseInt(args[++i], 10)
    } else if (arg === '--seed-start') {
      config.seedStart = parseInt(args[++i], 10)
    } else if (arg === '--slas') {
      const raw = args[++i] || ''
      config.slas = raw.split(',').map((s) => parseFloat(s.trim())).filter((n) => Number.isFinite(n) && n > 0)
    } else if (arg === '--weights' || arg === '-w') {
      const raw = args[++i] || ''
      if (raw.toLowerCase() !== 'all') {
        config.weightPresets = raw.split(',').map((w) => w.trim().toLowerCase())
      }
    } else if (arg === '--workload') {
      const val = (args[++i] || '').toLowerCase()
      if (val === 'all') {
        config.workloads = ['Steady', 'Poisson', 'Bursty']
      } else if (val === 'steady') {
        config.workloads = ['Steady']
      } else if (val === 'poisson') {
        config.workloads = ['Poisson']
      } else if (val === 'bursty') {
        config.workloads = ['Bursty']
      } else {
        throw new Error(`Invalid workload pattern '${val}'. Supported: steady, poisson, bursty, all.`)
      }
    } else if (arg === '--output-dir' || arg === '-o') {
      config.outputDir = args[++i]
    } else if (arg === '--quiet' || arg === '-q') {
      config.quiet = true
    }
  }

  return config
}

export async function executeSensitivityRun(rawConfig: SensitivityConfig) {
  const quiet = Boolean(rawConfig.quiet)
  const baseOutputDir = rawConfig.outputDir ?? 'research-results'

  if (!quiet) {
    console.log('==============================================================================')
    console.log('       CLOUDFLOW SENSITIVITY ANALYSIS EXPERIMENT RUNNER                       ')
    console.log('==============================================================================')
    console.log(`Dimension / Mode:     ${rawConfig.dimension ?? 'full'}`)
    console.log(`Requests per Seed:    ${rawConfig.requests ?? 1000}`)
    console.log(`Seeds Count:          ${typeof rawConfig.seeds === 'number' ? rawConfig.seeds : (rawConfig.seeds?.length ?? 30)}`)
    console.log(`SLA Thresholds:       ${rawConfig.slas ? rawConfig.slas.join(', ') + ' ms' : '150, 250, 400, 600 ms'}`)
    console.log(`Output Directory:     ${baseOutputDir}`)
    console.log('------------------------------------------------------------------------------')
    console.log('Executing multi-seed sensitivity analysis matrix...')
  }

  const startTime = Date.now()
  const result = await runSensitivityAnalysis(rawConfig)
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2)

  // Create target directory
  const runOutputDir = join(baseOutputDir, result.runId)
  mkdirSync(runOutputDir, { recursive: true })

  // Write the four required artifacts
  const summaryJsonPath = join(runOutputDir, 'sensitivity-summary.json')
  const resultsCsvPath = join(runOutputDir, 'sensitivity-results.csv')
  const manifestJsonPath = join(runOutputDir, 'sensitivity-manifest.json')
  const reportMdPath = join(runOutputDir, 'sensitivity-report.md')

  writeFileSync(summaryJsonPath, JSON.stringify(result, null, 2), 'utf8')
  writeFileSync(resultsCsvPath, generateSensitivityCsv(result), 'utf8')
  writeFileSync(manifestJsonPath, generateSensitivityManifest(result), 'utf8')
  writeFileSync(reportMdPath, generateSensitivityReportMarkdown(result), 'utf8')

  if (!quiet) {
    console.log(`Completed in ${durationSec}s across ${result.allResults.length} parameter conditions.`)
    console.log('==============================================================================')
    console.log('       SENSITIVITY ANALYSIS ARTIFACTS PERSISTED SUCCESSFULLY                  ')
    console.log('==============================================================================')
    console.log(`📁 Target Directory:      ${resolve(runOutputDir)}`)
    console.log(`📄 Summary JSON:          ${resolve(summaryJsonPath)}`)
    console.log(`📊 Results CSV:           ${resolve(resultsCsvPath)}`)
    console.log(`📜 Manifest JSON:         ${resolve(manifestJsonPath)}`)
    console.log(`📝 Markdown Report:       ${resolve(reportMdPath)}`)
    console.log('==============================================================================\n')
  }

  return {
    result,
    paths: {
      directory: runOutputDir,
      summaryJson: summaryJsonPath,
      resultsCsv: resultsCsvPath,
      manifestJson: manifestJsonPath,
      reportMd: reportMdPath,
    },
  }
}

// Guard for direct command-line execution
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
    const parsedConfig = parseSensitivityArgs(process.argv.slice(2))
    executeSensitivityRun(parsedConfig)
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('\n❌ Execution Error:', err instanceof Error ? err.message : String(err))
        process.exit(1)
      })
  } catch (err) {
    console.error('\n❌ Configuration Error:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
