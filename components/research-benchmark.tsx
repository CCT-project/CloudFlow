'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Filter,
  FlaskConical,
  HelpCircle,
  Info,
  Layers,
  Leaf,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Scale,
  Server,
  ShieldCheck,
  Sliders,
  Sparkles,
  Timer,
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
import { LatencyDistributionChart } from '@/components/latency-distribution-chart'
import { ContainerLifecycleChart } from '@/components/container-lifecycle-chart'
import { StatisticalForestPlot } from '@/components/statistical-forest-plot'

interface ResearchBenchmarkProps {
  onNavigateAnalytics?: () => void
}

export function ResearchBenchmark({ onNavigateAnalytics }: ResearchBenchmarkProps = {}) {
  // Configuration State
  const [seedCount, setSeedCount] = useState<number>(30)
  const [requestCount, setRequestCount] = useState<number>(200)
  const [startingSeed, setStartingSeed] = useState<number>(42)
  const [workloadType, setWorkloadType] = useState<WorkloadType>('Medium')
  const [arrivalPattern, setArrivalPattern] = useState<ArrivalPattern>('Poisson')
  const [slaThreshold, setSlaThreshold] = useState<number>(250)

  // Execution & Progress State
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [elapsedMs, setElapsedMs] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [benchmarkResult, setBenchmarkResult] = useState<BatchResearchResponseBody | null>(null)

  // Interactive UI State
  const [showReproducibility, setShowReproducibility] = useState<boolean>(true)
  const [metricFilter, setMetricFilter] = useState<'all' | 'latency' | 'cost' | 'carbon' | 'sla' | 'significant'>('all')

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)

  // Live timer effect during execution
  useEffect(() => {
    if (isLoading) {
      startTimeRef.current = performance.now()
      setElapsedMs(0)
      timerRef.current = setInterval(() => {
        setElapsedMs(Math.round(performance.now() - startTimeRef.current))
      }, 50)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [isLoading])

  // Boundary validations
  const compoundEvaluations = seedCount * requestCount
  const isCompoundExceeded = compoundEvaluations > 50000
  const isSeedCountInvalid = seedCount < 30 || seedCount > 100
  const isRequestCountInvalid = requestCount < 50 || requestCount > 1000
  const isSlaInvalid = slaThreshold < 100 || slaThreshold > 1000
  const isFormInvalid = isCompoundExceeded || isSeedCountInvalid || isRequestCountInvalid || isSlaInvalid

  const handleResetDefaults = () => {
    setSeedCount(30)
    setRequestCount(200)
    setStartingSeed(42)
    setWorkloadType('Medium')
    setArrivalPattern('Poisson')
    setSlaThreshold(250)
    setError(null)
  }

  const handleRunBenchmark = async () => {
    if (isFormInvalid) return

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
          startingSeed,
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

  // Filtered comparisons
  const filteredComparisons = benchmarkResult?.comparisons.filter((c) => {
    if (metricFilter === 'all') return true
    if (metricFilter === 'significant') return c.isStatisticallySignificant
    if (metricFilter === 'latency') return c.metric === 'averageLatencyMs' || c.metric === 'p95LatencyMs'
    if (metricFilter === 'cost') return c.metric === 'costUSD'
    if (metricFilter === 'carbon') return c.metric === 'carbonG'
    if (metricFilter === 'sla') return c.metric === 'slaViolationRatePercent'
    return true
  }) || []

  return (
    <div className="space-y-6">
      {/* 1. Academic Header & Scope */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-700 border border-emerald-200">
              <Sparkles size={12} /> Rigorous Inferential Research
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              Multi-Seed Statistical Benchmark Framework (k &ge; 30)
            </h2>
            <p className="mt-1 text-xs text-slate-500 max-w-2xl leading-relaxed">
              Conducts repeated-measures experiments across 30–100 independent PRNG seeds playing identical synthetic request streams across all five policies.
              Computes exact Student&apos;s t 95% Confidence Intervals, paired t-tests, Cohen&apos;s d<sub>z</sub> effect sizes, pooled request-level P95, and Holm-Bonferroni FWER step-down corrections.
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 max-w-md">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={16} className="mt-0.5 text-amber-700 flex-shrink-0" />
              <div className="space-y-1">
                <strong className="font-semibold text-amber-950">Research Simulation Disclaimer</strong>
                <p className="text-[11px] leading-relaxed text-amber-900/90">
                  All reported metrics reflect deterministic model-based simulation results, NOT direct cloud measurements. Baseline models simulate AWS Lambda, GCP Functions, and Azure Functions behaviors.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Interactive Parameter Configuration */}
        <div className="mt-6 border-t border-slate-100 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders size={14} className="text-emerald-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Experimental Configuration</h3>
            </div>
            <button
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-700 transition"
            >
              <RotateCcw size={11} /> Reset Defaults
            </button>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 text-xs">
            {/* Arrival Distribution */}
            <div>
              <label className="font-medium text-slate-700 flex items-center justify-between">
                <span>Arrival Distribution</span>
              </label>
              <select
                value={arrivalPattern}
                onChange={(e) => setArrivalPattern(e.target.value as ArrivalPattern)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium focus:border-emerald-500 focus:outline-none"
              >
                <option value="Poisson">Poisson (Stochastic)</option>
                <option value="Steady">Steady (Deterministic)</option>
                <option value="Bursty">Bursty (Pulse Clusters)</option>
              </select>
              <p className="mt-1 text-[10px] text-slate-400">
                {arrivalPattern === 'Steady' ? 'Deterministic inter-arrival' : arrivalPattern === 'Poisson' ? 'Memoryless exponential arrivals' : 'High variance pulse bursts (Cv > 1)'}
              </p>
            </div>

            {/* Workload Profile */}
            <div>
              <label className="font-medium text-slate-700">Workload Profile</label>
              <select
                value={workloadType}
                onChange={(e) => setWorkloadType(e.target.value as WorkloadType)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium focus:border-emerald-500 focus:outline-none"
              >
                <option value="Low">Low (1-10 req/s)</option>
                <option value="Medium">Medium (10-50 req/s)</option>
                <option value="High">High (50-200 req/s)</option>
                <option value="Bursty">Bursty (Clustered Spikes)</option>
                <option value="Cold-Start-Heavy">Cold-Start-Heavy</option>
              </select>
              <p className="mt-1 text-[10px] text-slate-400">Base concurrency & scale pressure.</p>
            </div>

            {/* Sample Size (k Seeds) */}
            <div>
              <label className="font-medium text-slate-700 flex items-center justify-between">
                <span>Seeds (k &ge; 30)</span>
                <span className="font-mono text-[10px] text-slate-400">30–100</span>
              </label>
              <div className="mt-1.5 flex items-center gap-1.5">
                <input
                  type="number"
                  min="30"
                  max="100"
                  value={seedCount}
                  onChange={(e) => setSeedCount(parseInt(e.target.value) || 30)}
                  className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-mono font-medium focus:outline-none ${isSeedCountInvalid ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white focus:border-emerald-500'}`}
                />
              </div>
              <div className="mt-1.5 flex gap-1">
                {[30, 50, 100].map((k) => (
                  <button
                    key={k}
                    onClick={() => setSeedCount(k)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-mono transition ${seedCount === k ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    k={k}
                  </button>
                ))}
              </div>
            </div>

            {/* Requests Per Seed */}
            <div>
              <label className="font-medium text-slate-700 flex items-center justify-between">
                <span>Requests / Seed</span>
                <span className="font-mono text-[10px] text-slate-400">50–1,000</span>
              </label>
              <input
                type="number"
                min="50"
                max="1000"
                step="50"
                value={requestCount}
                onChange={(e) => setRequestCount(parseInt(e.target.value) || 50)}
                className={`mt-1.5 w-full rounded-lg border px-2.5 py-1.5 text-xs font-mono font-medium focus:outline-none ${isRequestCountInvalid ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white focus:border-emerald-500'}`}
              />
              <div className="mt-1.5 flex gap-1">
                {[100, 200, 500, 1000].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRequestCount(n)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-mono transition ${requestCount === n ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* SLA Target */}
            <div>
              <label className="font-medium text-slate-700 flex items-center justify-between">
                <span>SLA Latency Target</span>
                <span className="font-mono text-[10px] text-slate-400">ms</span>
              </label>
              <input
                type="number"
                min="100"
                max="1000"
                step="25"
                value={slaThreshold}
                onChange={(e) => setSlaThreshold(parseInt(e.target.value) || 250)}
                className={`mt-1.5 w-full rounded-lg border px-2.5 py-1.5 text-xs font-mono font-medium focus:outline-none ${isSlaInvalid ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white focus:border-emerald-500'}`}
              />
              <div className="mt-1.5 flex gap-1">
                {[200, 250, 300, 400].map((t) => (
                  <button
                    key={t}
                    onClick={() => setSlaThreshold(t)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-mono transition ${slaThreshold === t ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {t}ms
                  </button>
                ))}
              </div>
            </div>

            {/* Starting Seed */}
            <div>
              <label className="font-medium text-slate-700 flex items-center justify-between">
                <span>Starting PRNG Seed</span>
                <span className="font-mono text-[10px] text-slate-400">Integer</span>
              </label>
              <input
                type="number"
                min="1"
                value={startingSeed}
                onChange={(e) => setStartingSeed(Math.max(1, parseInt(e.target.value) || 1))}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-emerald-500 focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-slate-400 font-mono">
                Range: [{startingSeed} … {startingSeed + seedCount - 1}]
              </p>
            </div>
          </div>

          {/* Compound Request Warning */}
          {isCompoundExceeded && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span>
                Compound computation limit exceeded: <strong>{(seedCount * requestCount).toLocaleString()} requests</strong> (Maximum allowed is 50,000 across all seeds). Please reduce seeds or requests per seed.
              </span>
            </div>
          )}

          {/* Action Button & Runtime Meta */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="text-xs text-slate-500 flex items-center gap-3">
              <span>
                Total evaluations: <strong className="font-mono text-slate-800">{(seedCount * requestCount * 5).toLocaleString()}</strong> invocations ({seedCount} seeds &times; 5 policies).
              </span>
              <span className="text-slate-300">|</span>
              <button
                onClick={() => setShowReproducibility(!showReproducibility)}
                className="text-emerald-700 hover:underline font-medium inline-flex items-center gap-1"
              >
                <Code2 size={12} /> {showReproducibility ? 'Hide' : 'Show'} Reproducibility Details
              </button>
            </div>

            <Button
              onClick={handleRunBenchmark}
              disabled={isLoading || isFormInvalid}
              className="rounded-xl bg-emerald-600 px-5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 gap-2 disabled:opacity-50 min-w-[200px]"
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Running {seedCount} Seeds ({elapsedMs}ms)...
                </>
              ) : (
                <>
                  <Play size={14} />
                  Run {seedCount}-Seed Statistical Benchmark
                </>
              )}
            </Button>
          </div>
        </div>

        {/* 3. Reproducibility & Trace Parity Panel */}
        {showReproducibility && (
          <div className="mt-5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-xs">
            <div className="flex items-center gap-2 text-slate-800 font-semibold mb-3">
              <ShieldCheck size={14} className="text-emerald-600" />
              <span>Scientific Reproducibility &amp; Experimental Design Manifest</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-[11px] text-slate-600">
              <div className="rounded-lg border border-slate-200/60 bg-white p-2.5">
                <span className="font-bold text-slate-800 block mb-1">1. Decoupled PRNG Streams</span>
                <p className="text-slate-500 leading-relaxed">
                  Independent Mulberry32 streams decouple inter-arrival timestamps from execution durations. Seed sequence: <span className="font-mono text-slate-700 font-semibold">[{startingSeed} ... {startingSeed + seedCount - 1}]</span>.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200/60 bg-white p-2.5">
                <span className="font-bold text-slate-800 block mb-1">2. Strict Trace Parity</span>
                <p className="text-slate-500 leading-relaxed">
                  All 5 policies (Adaptive, Latency, Cost, Carbon, Default) execute against <em>byte-for-byte identical</em> request streams within each seed for valid paired testing.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200/60 bg-white p-2.5">
                <span className="font-bold text-slate-800 block mb-1">3. Concurrency &amp; Lifecycle</span>
                <p className="text-slate-500 leading-relaxed">
                  Discrete-event container pool: Finite concurrency (M=10 instances/region), FIFO queueing on saturation, and 10-min idle container expiration timeouts.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200/60 bg-white p-2.5">
                <span className="font-bold text-slate-800 block mb-1">4. Statistical Inference</span>
                <p className="text-slate-500 leading-relaxed">
                  Exact Student&apos;s t critical values via Incomplete Beta; Holm-Bonferroni step-down FWER control; paired Cohen&apos;s d<sub>z</sub> effect sizes; pooled request P95.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700 flex items-start gap-2.5">
            <AlertCircle size={16} className="mt-0.5 text-rose-600 flex-shrink-0" />
            <div>
              <strong className="font-semibold">Execution Failure:</strong> {error}
            </div>
          </div>
        )}
      </div>

      {/* 4. Results Workspace */}
      {benchmarkResult && (
        <div className="space-y-6">
          {/* Metadata Banner & Export Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  <CheckCircle2 size={11} /> COMPLETED
                </span>
                <span className="font-semibold text-slate-900 font-mono">
                  {benchmarkResult.batchId}
                </span>
                <span className="text-slate-400 text-[11px]">
                  ({new Date(benchmarkResult.timestamp).toLocaleTimeString()})
                </span>
              </div>
              <p className="text-slate-500 text-[11px]">
                Evaluated <strong className="text-slate-800">{benchmarkResult.metadata.totalEvaluations.toLocaleString()}</strong> invocations across {benchmarkResult.metadata.totalSeeds} seeds ({benchmarkResult.metadata.requestCountPerSeed} req/seed, pattern: {benchmarkResult.metadata.arrivalPattern}) in <strong className="text-slate-800">{benchmarkResult.metadata.executionTimeMs}ms</strong>.
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
                Export CSV (RFC-4180)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadBatchResearchPDF(benchmarkResult)}
                className="rounded-xl text-xs gap-1.5"
              >
                <FileText size={13} className="text-rose-600" />
                Export Scientific PDF
              </Button>
            </div>
          </div>

          {/* Statistical Forest Plot & Holm-Bonferroni Matrix */}
          <StatisticalForestPlot benchmarkResult={benchmarkResult} />

          {/* Table 1: Descriptive Statistics & 95% Confidence Intervals */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">
                  1. Policy Performance (Sample Mean &plusmn; 95% Confidence Intervals)
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Exact Student&apos;s t critical value t<sub>crit</sub> = {benchmarkResult.policyStatistics['CloudFlow adaptive'].metrics.costUSD.criticalT} for df = {benchmarkResult.metadata.totalSeeds - 1}.
                </p>
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 font-mono">
                SLA Target: <strong>{benchmarkResult.metadata.slaLatencyThresholdMs}ms</strong>
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
                    <th className="py-2.5 px-3 font-semibold">
                      Pooled P95 Latency
                      <span className="ml-1 text-[10px] font-normal text-emerald-700">(True Empirical)</span>
                    </th>
                    <th className="py-2.5 px-3 font-semibold">Sample Mean P95</th>
                    <th className="py-2.5 px-3 font-semibold">Cold Start Rate</th>
                    <th className="py-2.5 px-3 font-semibold">SLA Violation Rate</th>
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
                    const cold = stats.metrics.coldStartRatePercent
                    const sla = stats.metrics.slaViolationRatePercent
                    const pooledP95 = stats.pooledP95LatencyMs ?? p95.mean

                    return (
                      <tr key={pol} className={isAdaptive ? 'bg-emerald-50/60 font-semibold' : 'hover:bg-slate-50/50'}>
                        <td className="py-2.5 px-3 font-sans text-slate-900">
                          {pol}
                          {isAdaptive && (
                            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800 font-semibold">
                              CloudFlow (Proposed)
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
                        <td className="py-2.5 px-3 font-bold text-emerald-700 bg-emerald-50/40">
                          {pooledP95.toFixed(1)} ms
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{p95.mean.toFixed(1)} ms</td>
                        <td className="py-2.5 px-3 text-slate-700">{cold.mean.toFixed(1)}%</td>
                        <td className="py-2.5 px-3 text-slate-700">{sla.mean.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-500 border border-slate-100">
              <strong className="text-slate-700">Statistical Method Note:</strong> Pooled Request-Level P95 evaluates the non-linear 95th percentile over the complete concatenated population of {benchmarkResult.metadata.totalEvaluations.toLocaleString()} requests. It is mathematically preferred over averaging seed-level sample P95s due to Jensen&apos;s Inequality for non-linear quantile operators.
            </div>
          </div>

          {/* Table 2: Paired Hypothesis Tests & Holm-Bonferroni Correction */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">
                  2. Paired Student&apos;s t-Tests &amp; Holm-Bonferroni Multiple Comparisons Correction
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Adaptive vs. Baselines over identical random seed traces. Adjusted p-values control Family-Wise Error Rate (FWER) at &alpha; = 0.05.
                </p>
              </div>

              {/* Filter Pills */}
              <div className="flex flex-wrap items-center gap-1 text-xs">
                <span className="text-[11px] text-slate-400 mr-1 flex items-center gap-1">
                  <Filter size={11} /> Filter:
                </span>
                {[
                  { id: 'all', label: 'All (28)' },
                  { id: 'significant', label: 'Sig. Only' },
                  { id: 'latency', label: 'Latency' },
                  { id: 'cost', label: 'Cost' },
                  { id: 'carbon', label: 'Carbon' },
                  { id: 'sla', label: 'SLA' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setMetricFilter(f.id as any)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${metricFilter === f.id ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {f.label}
                  </button>
                ))}
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
                  {filteredComparisons.map((c, idx) => (
                    <tr key={`${c.metric}-${c.baselinePolicy}-${idx}`} className="hover:bg-slate-50/50">
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
                        <span className={`text-[10px] font-sans px-1.5 py-0.5 rounded ${c.effectSizeMagnitude === 'Large' ? 'bg-purple-50 text-purple-700 font-medium' : c.effectSizeMagnitude === 'Medium' ? 'bg-blue-50 text-blue-700' : 'text-slate-400'}`}>
                          {c.effectSizeMagnitude}
                        </span>
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
                  {filteredComparisons.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-slate-400 font-sans">
                        No pairwise comparisons matched the selected filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Empirical Latency Distribution & Cumulative CDF */}
          <LatencyDistributionChart
            latencyObservations={benchmarkResult.latencyObservations}
            slaThresholdMs={benchmarkResult.metadata.slaLatencyThresholdMs}
            title="3. Empirical Request Latency Distribution & Cumulative Probability (CDF)"
            subtitle={`Pooled observations across ${benchmarkResult.metadata.totalSeeds} seeds (${benchmarkResult.metadata.requestCountPerSeed} req/seed)`}
          />

          {/* 4. Container Lifecycle & Concurrency Dynamics */}
          <ContainerLifecycleChart
            traces={benchmarkResult.representativeTraces}
            lifecycleEvents={benchmarkResult.representativeLifecycleEvents}
            slaThresholdMs={benchmarkResult.metadata.slaLatencyThresholdMs}
            title="4. Discrete-Event Container Lifecycle & Concurrency Timeline (Seed Trace Parity)"
          />
        </div>
      )}
    </div>
  )
}
