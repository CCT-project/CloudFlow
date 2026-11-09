'use client'

import React, { useState } from 'react'
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Info,
  Layers,
  Leaf,
  Loader2,
  Play,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  ArrivalPattern,
  BatchResearchResponseBody,
  PolicyType,
  WorkloadType,
} from '@/lib/types/scheduler'
import {
  downloadBatchResearchCSV,
  downloadBatchResearchPDF,
} from '@/lib/reports/export'

export function ResearchBenchmark() {
  const [seedCount, setSeedCount] = useState<number>(30)
  const [requestCount, setRequestCount] = useState<number>(200)
  const [workloadType, setWorkloadType] = useState<WorkloadType>('Medium')
  const [arrivalPattern, setArrivalPattern] = useState<ArrivalPattern>('Poisson')
  const [slaThreshold, setSlaThreshold] = useState<number>(250)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [benchmarkResult, setBenchmarkResult] = useState<BatchResearchResponseBody | null>(null)

  const handleRunBenchmark = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/research/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': `research-batch-${Date.now()}`,
        },
        body: JSON.stringify({
          seedCount,
          requestCount,
          workloadType,
          arrivalPattern,
          slaLatencyThresholdMs: slaThreshold,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const msg = errorData?.error?.message || `Benchmark execution failed with status ${response.status}.`
        throw new Error(msg)
      }

      const data: BatchResearchResponseBody = await response.json()
      setBenchmarkResult(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to execute multi-seed research benchmark.'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const policies: PolicyType[] = [
    'CloudFlow adaptive',
    'Latency-first',
    'Cost-first',
    'Carbon-first',
    'Default',
  ]

  return (
    <div className="space-y-6">
      {/* Header & Academic Research Disclaimer */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-700 border border-emerald-200">
              <Sparkles size={12} /> Rigorous Inferential Research
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              Multi-Seed Statistical Benchmark (k &ge; 30)
            </h2>
            <p className="mt-1 text-xs text-slate-500 max-w-2xl">
              Conducts repeated-measures experiments across 30+ independent PRNG seeds playing identical synthetic request streams across all five policies.
              Computes exact Student&apos;s t 95% Confidence Intervals, paired t-tests, Cohen&apos;s d<sub>z</sub> effect sizes, and Holm-Bonferroni FWER step-down corrections.
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 max-w-md">
            <div className="flex items-start gap-2">
              <AlertCircle size={15} className="mt-0.5 text-amber-700 flex-shrink-0" />
              <div>
                <strong className="font-semibold">Research Disclaimer:</strong> All reported metrics reflect deterministic model-based simulation results, NOT direct cloud measurements.
              </div>
            </div>
          </div>
        </div>

        {/* Configuration Controls */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5 border-t border-slate-100 pt-5 text-xs">
          <div>
            <label className="font-medium text-slate-700">Sample Size (k Seeds)</label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="number"
                min="30"
                max="100"
                value={seedCount}
                onChange={(e) => setSeedCount(Math.max(30, parseInt(e.target.value) || 30))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-mono font-medium focus:border-emerald-500 focus:outline-none"
              />
              <span className="text-slate-400 font-mono text-[11px]">&ge;30</span>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">Guarantees Student&apos;s t asymptotic validity.</p>
          </div>

          <div>
            <label className="font-medium text-slate-700">Requests Per Seed</label>
            <input
              type="number"
              min="50"
              max="2000"
              step="50"
              value={requestCount}
              onChange={(e) => setRequestCount(Math.max(50, parseInt(e.target.value) || 100))}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-mono font-medium focus:border-emerald-500 focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-slate-400">Invocations per independent run.</p>
          </div>

          <div>
            <label className="font-medium text-slate-700">Workload Profile</label>
            <select
              value={workloadType}
              onChange={(e) => setWorkloadType(e.target.value as WorkloadType)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium focus:border-emerald-500 focus:outline-none"
            >
              <option value="Low">Low (1-10 req/s)</option>
              <option value="Medium">Medium (10-50 req/s)</option>
              <option value="High">High (50-200 req/s)</option>
              <option value="Bursty">Bursty (Clustered Spikes)</option>
              <option value="Cold-Start-Heavy">Cold-Start-Heavy</option>
            </select>
          </div>

          <div>
            <label className="font-medium text-slate-700">Arrival Distribution</label>
            <select
              value={arrivalPattern}
              onChange={(e) => setArrivalPattern(e.target.value as ArrivalPattern)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium focus:border-emerald-500 focus:outline-none"
            >
              <option value="Poisson">Poisson (Stochastic)</option>
              <option value="Steady">Steady (Deterministic)</option>
              <option value="Bursty">Bursty (Pulse Clusters)</option>
            </select>
          </div>

          <div>
            <label className="font-medium text-slate-700">SLA Latency Target</label>
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                type="number"
                min="100"
                max="1000"
                step="25"
                value={slaThreshold}
                onChange={(e) => setSlaThreshold(parseInt(e.target.value) || 250)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-mono font-medium focus:border-emerald-500 focus:outline-none"
              />
              <span className="text-slate-500 text-xs">ms</span>
            </div>
          </div>
        </div>

        {/* Action Button & Error */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="text-xs text-slate-500">
            Total evaluations per benchmark: <strong className="font-mono text-slate-800">{(seedCount * requestCount * 5).toLocaleString()}</strong> invocations.
            {seedCount * requestCount > 50000 && (
              <span className="ml-2 font-semibold text-rose-600">
                (Exceeds 50,000 compound request limit: {(seedCount * requestCount).toLocaleString()} requests)
              </span>
            )}
          </div>

          <Button
            onClick={handleRunBenchmark}
            disabled={isLoading || seedCount * requestCount > 50000}
            className="rounded-xl bg-emerald-600 px-5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Evaluating {seedCount} Seeds...
              </>
            ) : (
              <>
                <Play size={14} />
                Run {seedCount}-Seed Statistical Benchmark
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Results View */}
      {benchmarkResult && (
        <div className="space-y-6">
          {/* Metadata Banner & Export Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs space-y-1">
              <span className="font-semibold text-slate-900">
                Benchmark Batch Completed: {benchmarkResult.batchId}
              </span>
              <p className="text-slate-400">
                Evaluated {benchmarkResult.metadata.totalEvaluations.toLocaleString()} synthetic requests across {benchmarkResult.metadata.totalSeeds} seeds in {benchmarkResult.metadata.executionTimeMs}ms.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadBatchResearchCSV(benchmarkResult)}
                className="rounded-xl text-xs gap-1.5"
              >
                <FileSpreadsheet size={13} className="text-emerald-600" />
                Download Statistical CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadBatchResearchPDF(benchmarkResult)}
                className="rounded-xl text-xs gap-1.5"
              >
                <FileText size={13} className="text-rose-600" />
                Download Scientific PDF
              </Button>
            </div>
          </div>

          {/* Table 1: Descriptive Statistics & 95% Confidence Intervals */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900">1. Policy Performance (Sample Mean &plusmn; 95% Confidence Intervals)</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Exact Student&apos;s t critical value t<sub>crit</sub> = {benchmarkResult.policyStatistics['CloudFlow adaptive'].metrics.costUSD.criticalT} for df = {benchmarkResult.metadata.totalSeeds - 1}.
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-2.5 px-3 font-semibold">Policy</th>
                    <th className="py-2.5 px-3 font-semibold">Cost (USD) Mean &plusmn; 95% CI</th>
                    <th className="py-2.5 px-3 font-semibold">Carbon (g CO₂e) Mean &plusmn; 95% CI</th>
                    <th className="py-2.5 px-3 font-semibold">Avg Latency (ms) Mean &plusmn; 95% CI</th>
                    <th className="py-2.5 px-3 font-semibold">P95 Latency (ms)</th>
                    <th className="py-2.5 px-3 font-semibold">SLA Violation Rate (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {policies.map((pol) => {
                    const stats = benchmarkResult.policyStatistics[pol]
                    const isAdaptive = pol === 'CloudFlow adaptive'
                    const cost = stats.metrics.costUSD
                    const carbon = stats.metrics.carbonG
                    const lat = stats.metrics.averageLatencyMs
                    const p95 = stats.metrics.p95LatencyMs
                    const sla = stats.metrics.slaViolationRatePercent

                    return (
                      <tr key={pol} className={isAdaptive ? 'bg-emerald-50/50 font-semibold' : ''}>
                        <td className="py-2.5 px-3 font-sans text-slate-900">
                          {pol}
                          {isAdaptive && (
                            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">
                              Proposed
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">
                          ${cost.mean.toFixed(5)}
                          <span className="text-[10px] text-slate-400 ml-1">
                            [{cost.confidenceInterval95[0].toFixed(5)}, {cost.confidenceInterval95[1].toFixed(5)}]
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">
                          {carbon.mean.toFixed(2)} g
                          <span className="text-[10px] text-slate-400 ml-1">
                            [{carbon.confidenceInterval95[0].toFixed(2)}, {carbon.confidenceInterval95[1].toFixed(2)}]
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">
                          {lat.mean.toFixed(1)} ms
                          <span className="text-[10px] text-slate-400 ml-1">
                            [{lat.confidenceInterval95[0].toFixed(1)}, {lat.confidenceInterval95[1].toFixed(1)}]
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{p95.mean.toFixed(1)} ms</td>
                        <td className="py-2.5 px-3 text-slate-700">{sla.mean.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 2: Paired Hypothesis Tests & Holm-Bonferroni Correction */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900">
                  2. Paired Student&apos;s t-Tests &amp; Holm-Bonferroni Multiple Comparisons Correction
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Adaptive vs. Baselines over identical random seed traces. Adjusted p-values control Family-Wise Error Rate (FWER) at &alpha; = 0.05.
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-2.5 px-3 font-semibold">Evaluated Metric</th>
                    <th className="py-2.5 px-3 font-semibold">Baseline Policy</th>
                    <th className="py-2.5 px-3 font-semibold">Mean Difference</th>
                    <th className="py-2.5 px-3 font-semibold">Difference (%)</th>
                    <th className="py-2.5 px-3 font-semibold">t-Statistic</th>
                    <th className="py-2.5 px-3 font-semibold">Raw p-Value</th>
                    <th className="py-2.5 px-3 font-semibold">Holm Adjusted p</th>
                    <th className="py-2.5 px-3 font-semibold">Cohen&apos;s d<sub>z</sub></th>
                    <th className="py-2.5 px-3 font-semibold">Significance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {benchmarkResult.comparisons.map((c, idx) => (
                    <tr key={`${c.metric}-${c.baselinePolicy}-${idx}`}>
                      <td className="py-2 px-3 font-sans font-medium text-slate-800">{c.metric}</td>
                      <td className="py-2 px-3 font-sans text-slate-600">{c.baselinePolicy}</td>
                      <td className="py-2 px-3 text-slate-700">{c.meanDifference.toFixed(4)}</td>
                      <td className={`py-2 px-3 font-semibold ${c.percentDifference <= 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {c.percentDifference > 0 ? '+' : ''}{c.percentDifference.toFixed(1)}%
                      </td>
                      <td className="py-2 px-3 text-slate-600">{c.tStatistic.toFixed(2)}</td>
                      <td className="py-2 px-3 text-slate-600">
                        {c.pValue < 0.0001 ? '< 0.0001' : c.pValue.toFixed(4)}
                      </td>
                      <td className="py-2 px-3 text-slate-800 font-semibold">
                        {c.adjustedPValue < 0.0001 ? '< 0.0001' : c.adjustedPValue.toFixed(4)}
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        {c.cohensDz.toFixed(2)}{' '}
                        <span className="text-[10px] text-slate-400 font-sans">({c.effectSizeMagnitude})</span>
                      </td>
                      <td className="py-2 px-3 font-sans">
                        {c.isStatisticallySignificant ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            <CheckCircle2 size={11} /> p &lt; 0.05
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            Not Sig.
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
