import { jsPDF } from 'jspdf'
import type {
  BatchResearchResponseBody,
  ExperimentRecord,
  PersistedPolicyResult,
  PolicyType,
} from '../types/scheduler.ts'

/**
 * Escapes values in compliance with RFC-4180 CSV specifications.
 */
export function escapeCSVField(val: unknown): string {
  if (val === null || val === undefined) return '""'
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return `"${str}"`
}

/**
 * Generates an RFC-4180 compliant CSV export for a single experiment record.
 */
export function generateExperimentCSV(experiment: ExperimentRecord): string {
  const lines: string[] = []

  // Header & Research Disclaimer
  lines.push('CloudFlow Research Report: Adaptive Serverless Cloud Scheduling')
  lines.push('Smarter Scheduling. Efficient Execution. Sustainable Cloud.')
  lines.push('DISCLAIMER: All values represent deterministic model-based simulation results, NOT real cloud measurements.')
  lines.push('')

  // Experiment Metadata
  lines.push('=== EXPERIMENT METADATA ===')
  lines.push(`Experiment ID,${escapeCSVField(experiment.id)}`)
  lines.push(`Experiment Name,${escapeCSVField(experiment.name)}`)
  lines.push(`Creation Timestamp,${escapeCSVField(experiment.createdAt)}`)
  lines.push('')

  // Workload Configuration
  lines.push('=== WORKLOAD CONFIGURATION ===')
  lines.push(`Workload Type,${escapeCSVField(experiment.workloadType)}`)
  lines.push(`Request Count,${experiment.requestCount}`)
  lines.push(`Duration Minutes,${experiment.durationMinutes}`)
  lines.push(`SLA Latency Threshold (ms),${experiment.slaLatencyThresholdMs}`)
  lines.push(`Arrival Pattern,${escapeCSVField(experiment.arrivalPattern)}`)
  lines.push(`PRNG Seed,${experiment.seed}`)
  lines.push('')

  // Adaptive Weights
  lines.push('=== ADAPTIVE OBJECTIVE WEIGHTS ===')
  if (experiment.weights) {
    lines.push(`Alpha (Cost Weight),${experiment.weights.alpha}`)
    lines.push(`Beta (Carbon Weight),${experiment.weights.beta}`)
    lines.push(`Gamma (Latency Weight),${experiment.weights.gamma}`)
    lines.push(`Delta (Cold-Start Risk Weight),${experiment.weights.delta}`)
  } else {
    lines.push('Adaptive Weights,Unavailable')
  }
  lines.push('')

  // Simulation Assumptions
  lines.push('=== SIMULATION ASSUMPTIONS ===')
  if (experiment.assumptions) {
    lines.push(`PRNG Model,${escapeCSVField(experiment.assumptions.prng)}`)
    lines.push(`Latency Model,${escapeCSVField(experiment.assumptions.latencyModel)}`)
    lines.push(`Cost Model,${escapeCSVField(experiment.assumptions.costModel)}`)
    lines.push(`Carbon Model,${escapeCSVField(experiment.assumptions.carbonModel)}`)
    lines.push(`Cold-Start Model,${escapeCSVField(experiment.assumptions.coldStartModel)}`)
    if (experiment.assumptions.adaptivePolicyModel) {
      lines.push(`Adaptive Optimization Model,${escapeCSVField(experiment.assumptions.adaptivePolicyModel)}`)
    }
  } else {
    lines.push('Assumptions,Unavailable')
  }
  lines.push('')

  // Policy Performance Benchmark Table
  lines.push('=== POLICY BENCHMARK RESULTS (FAIR COMPARISON OVER IDENTICAL TRACE) ===')
  lines.push([
    'Policy',
    'Total Requests',
    'Average Latency (ms)',
    'P95 Latency (ms)',
    'Total Cost (USD)',
    'Total Carbon (g CO2e)',
    'Cold-Start Rate (%)',
    'SLA Violation Rate (%)',
    'Average Overhead (ms)',
  ].map(escapeCSVField).join(','))

  for (const pr of experiment.policyResults) {
    lines.push([
      pr.policy,
      pr.totalRequests,
      pr.averageLatencyMs.toFixed(2),
      pr.p95LatencyMs.toFixed(2),
      pr.totalCostUSD.toFixed(6),
      pr.totalCarbonG.toFixed(4),
      pr.coldStartRatePercent.toFixed(2),
      pr.slaViolationRatePercent.toFixed(2),
      pr.averageOverheadMs.toFixed(3),
    ].map(escapeCSVField).join(','))
  }

  return lines.join('\r\n')
}

/**
 * Generates a clean PDF document for an individual experiment record using jsPDF.
 */
export function generateExperimentPDFDoc(experiment: ExperimentRecord): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  })

  const margin = 40
  let y = 50

  // Title & Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(15, 118, 110) // Emerald 700
  doc.text('CloudFlow Research Report', margin, y)
  y += 18

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139) // Slate 500
  doc.text('Adaptive Serverless Scheduling for Cost Efficiency, Carbon Awareness, and SLA Compliance', margin, y)
  y += 16

  // Disclaimer Box
  doc.setFillColor(248, 250, 252) // Slate 50
  doc.setDrawColor(226, 232, 240) // Slate 200
  doc.roundedRect(margin, y, 515, 26, 4, 4, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(180, 83, 9) // Amber 700
  doc.text('RESEARCH NOTICE: Model-based simulated values under deterministic trace. Not real cloud-provider measurements.', margin + 10, y + 16)
  y += 40

  // Experiment Details Section
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(15, 23, 42) // Slate 900
  doc.text('1. Experiment Configuration', margin, y)
  y += 16

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(51, 65, 85) // Slate 700

  const col1 = margin
  const col2 = margin + 260

  doc.text(`Experiment ID: ${experiment.id}`, col1, y)
  doc.text(`Created: ${new Date(experiment.createdAt).toLocaleString()}`, col2, y)
  y += 14

  doc.text(`Workload Type: ${experiment.workloadType}`, col1, y)
  doc.text(`Request Count: ${experiment.requestCount.toLocaleString()}`, col2, y)
  y += 14

  doc.text(`Duration: ${experiment.durationMinutes} minutes`, col1, y)
  doc.text(`Arrival Pattern: ${experiment.arrivalPattern}`, col2, y)
  y += 14

  doc.text(`SLA Threshold: ${experiment.slaLatencyThresholdMs} ms`, col1, y)
  doc.text(`PRNG Seed: ${experiment.seed}`, col2, y)
  y += 24

  // Adaptive Weights
  if (experiment.weights) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Scheduler Objective Weights:', margin, y)
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(
      `Alpha (Cost): ${experiment.weights.alpha} | Beta (Carbon): ${experiment.weights.beta} | Gamma (Latency): ${experiment.weights.gamma} | Delta (Cold-start): ${experiment.weights.delta}`,
      margin,
      y
    )
    y += 24
  }

  // Five-Policy Comparison Table
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(15, 23, 42)
  doc.text('2. Comparative Performance (Identical Request Sequence)', margin, y)
  y += 16

  // Table Header
  const headers = ['Policy', 'Avg Lat', 'P95 Lat', 'Cost (USD)', 'Carbon (g)', 'Cold %', 'SLA Viol %']
  const widths = [120, 60, 60, 75, 75, 60, 65]

  doc.setFillColor(241, 245, 249) // Slate 100
  doc.rect(margin, y, 515, 20, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)

  let curX = margin + 6
  headers.forEach((h, i) => {
    doc.text(h, curX, y + 13)
    curX += widths[i]
  })
  y += 22

  // Table Rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(30, 41, 59)

  for (const pr of experiment.policyResults) {
    curX = margin + 6
    const isAdaptive = pr.policy === 'CloudFlow adaptive'
    if (isAdaptive) {
      doc.setFillColor(236, 253, 245) // Emerald 50
      doc.rect(margin, y - 2, 515, 18, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(6, 95, 70) // Emerald 800
    } else {
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(30, 41, 59)
    }

    const row = [
      pr.policy,
      `${pr.averageLatencyMs.toFixed(1)} ms`,
      `${pr.p95LatencyMs.toFixed(1)} ms`,
      `$${pr.totalCostUSD.toFixed(5)}`,
      `${pr.totalCarbonG.toFixed(2)} g`,
      `${pr.coldStartRatePercent.toFixed(1)}%`,
      `${pr.slaViolationRatePercent.toFixed(1)}%`,
    ]

    row.forEach((cell, i) => {
      doc.text(cell, curX, y + 10)
      curX += widths[i]
    })
    y += 18
  }

  y += 20

  // Modeling Assumptions
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text('3. Simulation Assumptions & Models', margin, y)
  y += 14

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)

  if (experiment.assumptions) {
    const asmList = [
      `PRNG: ${experiment.assumptions.prng}`,
      `Latency: ${experiment.assumptions.latencyModel}`,
      `Cost: ${experiment.assumptions.costModel}`,
      `Carbon: ${experiment.assumptions.carbonModel}`,
      `Cold-Start: ${experiment.assumptions.coldStartModel}`,
    ]
    for (const asm of asmList) {
      doc.text(`• ${asm}`, margin, y, { maxWidth: 515 })
      y += 14
    }
  }

  y += 20
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184)
  doc.text('Generated by CloudFlow Adaptive Serverless Research Engine.', margin, 800)

  return doc
}

/**
 * Triggers a browser download of a generated blob.
 */
export function downloadFile(content: Blob | string, filename: string, mimeType: string): void {
  if (typeof window === 'undefined') return
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Convenience helper to download CSV for an experiment.
 */
export function downloadExperimentCSV(experiment: ExperimentRecord): void {
  const csv = generateExperimentCSV(experiment)
  downloadFile(csv, `cloudflow-experiment-${experiment.id.slice(0, 8)}.csv`, 'text/csv;charset=utf-8;')
}

/**
 * Convenience helper to download PDF for an experiment.
 */
export function downloadExperimentPDF(experiment: ExperimentRecord): void {
  const doc = generateExperimentPDFDoc(experiment)
  doc.save(`cloudflow-experiment-${experiment.id.slice(0, 8)}.pdf`)
}

/**
 * Generates an RFC-4180 compliant CSV export for a multi-seed statistical batch research benchmark.
 */
export function generateBatchResearchCSV(result: BatchResearchResponseBody): string {
  const lines: string[] = []

  lines.push('CloudFlow Research Report: Multi-Seed Statistical Benchmark')
  lines.push('Rigorous Inferential and Descriptive Serverless Scheduling Analysis')
  lines.push('DISCLAIMER: All values represent deterministic model-based simulation results, NOT real cloud measurements.')
  lines.push('')

  // Batch Metadata
  lines.push('=== BENCHMARK METADATA ===')
  lines.push(`Batch ID,${escapeCSVField(result.batchId)}`)
  lines.push(`Timestamp,${escapeCSVField(result.timestamp)}`)
  lines.push(`Total Seeds (k >= 30),${result.metadata.totalSeeds}`)
  lines.push(`Seeds List,${escapeCSVField(result.metadata.seeds.join('; '))}`)
  lines.push(`Requests Per Seed,${result.metadata.requestCountPerSeed}`)
  lines.push(`Total Invocations Evaluated,${result.metadata.totalEvaluations}`)
  lines.push(`Workload Type,${escapeCSVField(result.metadata.workloadType)}`)
  lines.push(`Arrival Pattern,${escapeCSVField(result.metadata.arrivalPattern)}`)
  lines.push(`SLA Latency Threshold (ms),${result.metadata.slaLatencyThresholdMs}`)
  lines.push(`Execution Time (ms),${result.metadata.executionTimeMs}`)
  lines.push('')

  // Scientific Methodology
  lines.push('=== SCIENTIFIC METHODOLOGY ===')
  lines.push(`Distribution,${escapeCSVField(result.metadata.methodology.distribution)}`)
  lines.push(`Multiple Testing Correction,${escapeCSVField(result.metadata.methodology.multipleComparisonsCorrection)}`)
  lines.push(`Confidence Level,${escapeCSVField(result.metadata.methodology.confidenceLevel)}`)
  lines.push(`Trace Parity,${escapeCSVField(result.metadata.methodology.identicalTraceCondition)}`)
  lines.push('')

  // Policy Descriptive Statistics Table
  lines.push('=== POLICY DESCRIPTIVE STATISTICS (95% CONFIDENCE INTERVALS) ===')
  lines.push([
    'Policy',
    'Metric',
    'Sample Size (n)',
    'Sample Mean',
    'Sample Variance',
    'Standard Deviation',
    'Standard Error',
    '95% CI Lower Bound',
    '95% CI Upper Bound',
    'Student t Critical (df=n-1)',
  ].map(escapeCSVField).join(','))

  const policies = Object.keys(result.policyStatistics) as PolicyType[]
  const metricKeys = [
    'costUSD',
    'carbonG',
    'averageLatencyMs',
    'p95LatencyMs',
    'coldStartRatePercent',
    'slaViolationRatePercent',
    'averageOverheadMs',
  ] as const

  for (const pol of policies) {
    const stats = result.policyStatistics[pol]
    for (const m of metricKeys) {
      const metricStat = stats.metrics[m]
      lines.push([
        pol,
        m,
        metricStat.count,
        metricStat.mean,
        metricStat.variance,
        metricStat.standardDeviation,
        metricStat.standardError,
        metricStat.confidenceInterval95[0],
        metricStat.confidenceInterval95[1],
        metricStat.criticalT,
      ].map(escapeCSVField).join(','))
    }
  }
  lines.push('')

  // Paired Hypothesis Tests & Effect Sizes Table
  lines.push('=== PAIRED STUDENT T-TESTS & HOLM-BONFERRONI CORRECTION ===')
  lines.push([
    'Metric',
    'Baseline Policy Compared',
    'Adaptive Mean',
    'Baseline Mean',
    'Mean Difference (Adaptive - Baseline)',
    'Percent Difference (%)',
    'Degrees of Freedom',
    't-Statistic',
    'Raw p-Value',
    'Holm-Bonferroni Adjusted p-Value',
    'Statistically Significant (alpha=0.05)',
    "Cohen's dz Effect Size",
    'Effect Magnitude',
  ].map(escapeCSVField).join(','))

  for (const comp of result.comparisons) {
    lines.push([
      comp.metric,
      comp.baselinePolicy,
      comp.adaptiveMean,
      comp.baselineMean,
      comp.meanDifference,
      `${comp.percentDifference}%`,
      comp.degreesOfFreedom,
      comp.tStatistic,
      comp.pValue,
      comp.adjustedPValue,
      comp.isStatisticallySignificant ? 'YES' : 'NO',
      comp.cohensDz,
      comp.effectSizeMagnitude,
    ].map(escapeCSVField).join(','))
  }

  return lines.join('\r\n')
}

/**
 * Generates a publication-grade PDF report for a multi-seed batch research benchmark.
 */
export function generateBatchResearchPDFDoc(result: BatchResearchResponseBody): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  })

  const margin = 40
  let y = margin

  // Header Banner
  doc.setFillColor(15, 23, 42) // Slate 900
  doc.rect(margin, y, 515, 46, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text('CloudFlow Statistical Research Report', margin + 14, y + 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text(
    `Batch: ${result.batchId}  |  Seeds: ${result.metadata.totalSeeds}  |  Evaluations: ${result.metadata.totalEvaluations.toLocaleString()}`,
    margin + 14,
    y + 35
  )
  y += 56

  // Research Disclaimer Banner
  doc.setFillColor(254, 242, 242) // Red 50
  doc.rect(margin, y, 515, 20, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(185, 28, 28) // Red 700
  doc.text(
    'DISCLAIMER: All values represent deterministic model-based simulation results, NOT real cloud measurements.',
    margin + 10,
    y + 13
  )
  y += 30

  // Benchmark Metadata Section
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text('1. Multi-Seed Experimental Setup', margin, y)
  y += 14

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)

  const metaLines = [
    `Workload: ${result.metadata.workloadType}  |  Arrival Pattern: ${result.metadata.arrivalPattern}  |  SLA Latency Target: ${result.metadata.slaLatencyThresholdMs}ms`,
    `Independent Seeds: ${result.metadata.totalSeeds} (PRNG: Mulberry32)  |  Requests/Seed: ${result.metadata.requestCountPerSeed}  |  Execution Time: ${result.metadata.executionTimeMs}ms`,
    `Statistical Methodology: Exact Student's t critical values & 2-tailed p-values via Incomplete Beta; Holm-Bonferroni FWER step-down.`,
  ]
  metaLines.forEach((line) => {
    doc.text(line, margin, y)
    y += 12
  })
  y += 10

  // Policy Performance Table (Mean +/- 95% CI)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text('2. Policy Performance (Sample Mean +/- 95% Confidence Interval)', margin, y)
  y += 12

  const colWidths = [115, 100, 100, 100, 100]
  const tableHeaders = ['Policy', 'Cost ($)', 'Carbon (g)', 'Avg Latency (ms)', 'SLA Viol. (%)']

  doc.setFillColor(241, 245, 249)
  doc.rect(margin, y, 515, 16, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(71, 85, 105)

  let curX = margin + 6
  tableHeaders.forEach((h, i) => {
    doc.text(h, curX, y + 11)
    curX += colWidths[i]
  })
  y += 18

  const policies = Object.keys(result.policyStatistics) as PolicyType[]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)

  for (const pol of policies) {
    const stats = result.policyStatistics[pol]
    const isAdaptive = pol === 'CloudFlow adaptive'
    if (isAdaptive) {
      doc.setFillColor(236, 253, 245) // Emerald 50
      doc.rect(margin, y - 2, 515, 15, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(6, 95, 70)
    } else {
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(30, 41, 59)
    }

    const costStat = stats.metrics.costUSD
    const carbonStat = stats.metrics.carbonG
    const latStat = stats.metrics.averageLatencyMs
    const slaStat = stats.metrics.slaViolationRatePercent

    const costCi = `[${costStat.confidenceInterval95[0].toFixed(5)}, ${costStat.confidenceInterval95[1].toFixed(5)}]`
    const carbonCi = `[${carbonStat.confidenceInterval95[0].toFixed(2)}, ${carbonStat.confidenceInterval95[1].toFixed(2)}]`
    const latCi = `[${latStat.confidenceInterval95[0].toFixed(1)}, ${latStat.confidenceInterval95[1].toFixed(1)}]`
    const slaCi = `[${slaStat.confidenceInterval95[0].toFixed(1)}%, ${slaStat.confidenceInterval95[1].toFixed(1)}%]`

    const cells = [
      pol,
      `$${costStat.mean.toFixed(5)} ${costCi}`,
      `${carbonStat.mean.toFixed(2)}g ${carbonCi}`,
      `${latStat.mean.toFixed(1)}ms ${latCi}`,
      `${slaStat.mean.toFixed(1)}% ${slaCi}`,
    ]

    curX = margin + 6
    cells.forEach((c, i) => {
      doc.text(c, curX, y + 9)
      curX += colWidths[i]
    })
    y += 16
  }

  y += 14

  // Statistical Comparisons Table
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text("3. Paired Student's t-Tests & Holm-Bonferroni Significance (Adaptive vs Baselines)", margin, y)
  y += 12

  const compWidths = [95, 95, 70, 60, 65, 65, 65]
  const compHeaders = ['Metric', 'Baseline', 'Diff (%)', 't-Stat', 'p (adj)', "Cohen's dz", 'Significant?']

  doc.setFillColor(241, 245, 249)
  doc.rect(margin, y, 515, 16, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(71, 85, 105)

  curX = margin + 6
  compHeaders.forEach((h, i) => {
    doc.text(h, curX, y + 11)
    curX += compWidths[i]
  })
  y += 18

  // Sample top 8 key comparisons to fit on page
  const keyComparisons = result.comparisons.slice(0, 10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(30, 41, 59)

  for (const comp of keyComparisons) {
    const row = [
      comp.metric,
      comp.baselinePolicy,
      `${comp.percentDifference > 0 ? '+' : ''}${comp.percentDifference.toFixed(1)}%`,
      comp.tStatistic.toFixed(2),
      comp.adjustedPValue < 0.001 ? '< 0.001' : comp.adjustedPValue.toFixed(4),
      `${comp.cohensDz.toFixed(2)} (${comp.effectSizeMagnitude})`,
      comp.isStatisticallySignificant ? 'YES (p < 0.05)' : 'NO',
    ]

    curX = margin + 6
    row.forEach((cell, i) => {
      doc.text(cell, curX, y + 9)
      curX += compWidths[i]
    })
    y += 15
  }

  // Footer
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184)
  doc.text('Generated by CloudFlow Adaptive Serverless Research Engine.', margin, 800)

  return doc
}

/**
 * Convenience helper to download CSV for a batch research benchmark.
 */
export function downloadBatchResearchCSV(result: BatchResearchResponseBody): void {
  const csv = generateBatchResearchCSV(result)
  downloadFile(csv, `cloudflow-batch-research-${result.batchId}.csv`, 'text/csv;charset=utf-8;')
}

/**
 * Convenience helper to download PDF for a batch research benchmark.
 */
export function downloadBatchResearchPDF(result: BatchResearchResponseBody): void {
  const doc = generateBatchResearchPDFDoc(result)
  doc.save(`cloudflow-batch-research-${result.batchId}.pdf`)
}
