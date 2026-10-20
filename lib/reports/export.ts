import { jsPDF } from 'jspdf'
import type { ExperimentRecord, PersistedPolicyResult } from '../types/scheduler.ts'

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
