'use client'

import React, { useState, useMemo } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  FileSpreadsheet,
  Filter,
  HelpCircle,
  Info,
  Layers,
  Leaf,
  Scale,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import type {
  BatchComparisonItem,
  BatchResearchResponseBody,
  PolicyType,
} from '@/lib/types/scheduler'
import {
  calculateCohenDzConfidenceInterval,
  computeHolmBonferroniMatrix,
  type CohenDzConfidenceInterval,
  type HolmBonferroniStepItem,
} from '@/lib/research/statistics'

export interface StatisticalForestPlotProps {
  benchmarkResult: BatchResearchResponseBody
  referencePolicy?: string
  title?: string
}

const METRIC_LABELS: Record<string, string> = {
  costUSD: 'Cost (USD)',
  carbonG: 'Carbon (g CO₂e)',
  averageLatencyMs: 'Avg Latency (ms)',
  p95LatencyMs: 'P95 Latency (ms)',
  coldStartRatePercent: 'Cold Start Rate (%)',
  slaViolationRatePercent: 'SLA Violation (%)',
  averageOverheadMs: 'Overhead (ms)',
}

export function StatisticalForestPlot({
  benchmarkResult,
  referencePolicy = 'CloudFlow adaptive',
  title = 'Paired Statistical Effect Sizes & Holm-Bonferroni Significance',
}: StatisticalForestPlotProps) {
  // Filters & UI State
  const [metricFilter, setMetricFilter] = useState<'all' | 'cost' | 'carbon' | 'latency' | 'cold' | 'sla' | 'significant'>('all')
  const [activeTab, setActiveTab] = useState<'forest' | 'matrix'>('forest')
  const [sortBy, setSortBy] = useState<'rank' | 'effect' | 'metric'>('rank')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const comparisons = benchmarkResult.comparisons || []
  const mTotal = comparisons.length
  const adaptiveStats = benchmarkResult.policyStatistics['CloudFlow adaptive']

  // Compute 95% Confidence Intervals for Cohen's dz
  const enrichedComparisons = useMemo(() => {
    return comparisons.map((comp) => {
      const ci = calculateCohenDzConfidenceInterval(comp.cohensDz, comp.degreesOfFreedom, 0.05)
      return {
        ...comp,
        ci,
      }
    })
  }, [comparisons])

  // Compute Dynamic Holm-Bonferroni Step-Down Matrix (derives m dynamically from comparisons.length)
  const holmMatrix = useMemo(() => {
    return computeHolmBonferroniMatrix(comparisons, 0.05)
  }, [comparisons])

  // Filtered comparisons for Forest Plot
  const filteredData = useMemo(() => {
    let list = enrichedComparisons.filter((c) => {
      if (metricFilter === 'significant') return c.isStatisticallySignificant
      if (metricFilter === 'cost') return c.metric === 'costUSD'
      if (metricFilter === 'carbon') return c.metric === 'carbonG'
      if (metricFilter === 'latency') return c.metric === 'averageLatencyMs' || c.metric === 'p95LatencyMs'
      if (metricFilter === 'cold') return c.metric === 'coldStartRatePercent'
      if (metricFilter === 'sla') return c.metric === 'slaViolationRatePercent'
      return true
    })

    list.sort((a, b) => {
      if (sortBy === 'effect') {
        return sortOrder === 'asc' ? a.cohensDz - b.cohensDz : b.cohensDz - a.cohensDz
      }
      if (sortBy === 'metric') {
        return sortOrder === 'asc' ? a.metric.localeCompare(b.metric) : b.metric.localeCompare(a.metric)
      }
      // default: rank by ascending raw p-value
      return sortOrder === 'asc' ? a.pValue - b.pValue : b.pValue - a.pValue
    })

    return list
  }, [enrichedComparisons, metricFilter, sortBy, sortOrder])

  // Summary Metrics
  const summaryKpis = useMemo(() => {
    const totalComparisons = comparisons.length
    const sigComparisons = comparisons.filter((c) => c.isStatisticallySignificant).length
    const costStat = adaptiveStats?.metrics?.costUSD
    const carbonStat = adaptiveStats?.metrics?.carbonG
    const latStat = adaptiveStats?.metrics?.averageLatencyMs
    const slaStat = adaptiveStats?.metrics?.slaViolationRatePercent
    const q = adaptiveStats?.pooledQuantiles

    return {
      seeds: benchmarkResult.metadata.totalSeeds,
      seedRange: `[${benchmarkResult.metadata.seeds[0]}..${benchmarkResult.metadata.seeds[benchmarkResult.metadata.seeds.length - 1]}]`,
      totalEvaluations: benchmarkResult.metadata.totalEvaluations,
      costMean: costStat?.mean ?? 0,
      costCi: costStat?.confidenceInterval95 ?? [0, 0],
      carbonMean: carbonStat?.mean ?? 0,
      carbonCi: carbonStat?.confidenceInterval95 ?? [0, 0],
      latMean: latStat?.mean ?? 0,
      latCi: latStat?.confidenceInterval95 ?? [0, 0],
      slaMean: slaStat?.mean ?? 0,
      pooledP50: q?.p50 ?? 0,
      pooledP90: q?.p90 ?? 0,
      pooledP95: adaptiveStats?.pooledP95LatencyMs ?? (q?.p95 ?? 0),
      pooledP99: q?.p99 ?? 0,
      sigCount: sigComparisons,
      totalCount: totalComparisons,
      sigPercent: totalComparisons > 0 ? Number(((sigComparisons / totalComparisons) * 100).toFixed(1)) : 0,
    }
  }, [benchmarkResult, comparisons, adaptiveStats])

  // Forest Plot Coordinate Mapping
  // Domain: Cohen's dz typically ranges from -3.0 to +3.0
  const xMin = -3.0
  const xMax = 3.0
  const svgWidth = 560
  const scaleX = (val: number) => {
    const clamped = Math.max(xMin, Math.min(xMax, val))
    return ((clamped - xMin) / (xMax - xMin)) * svgWidth
  }

  return (
    <div className="space-y-6">
      {/* 1. Statistical Summary KPI Dashboard Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Seeds & Evaluations */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] font-medium uppercase tracking-wider">Independent Seeds</span>
            <ShieldCheck size={14} className="text-emerald-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-slate-900">{summaryKpis.seeds}</span>
            <span className="text-[10px] font-mono text-slate-400">seeds</span>
          </div>
          <span className="mt-1 text-[10px] font-mono text-slate-500 block">
            Range: {summaryKpis.seedRange}
          </span>
        </div>

        {/* Total Invocations */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] font-medium uppercase tracking-wider">Evaluations</span>
            <Layers size={14} className="text-teal-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-slate-900">
              {summaryKpis.totalEvaluations.toLocaleString()}
            </span>
          </div>
          <span className="mt-1 text-[10px] text-slate-500 block">
            Fair trace parity
          </span>
        </div>

        {/* Cost USD Mean +/- CI */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] font-medium uppercase tracking-wider">Adaptive Cost</span>
            <Scale size={14} className="text-emerald-600" />
          </div>
          <div className="mt-1">
            <span className="text-base font-bold font-mono text-slate-900">
              ${summaryKpis.costMean.toFixed(5)}
            </span>
          </div>
          <span className="mt-0.5 text-[9.5px] font-mono text-slate-400 block truncate">
            95% CI: [{summaryKpis.costCi[0].toFixed(5)}, {summaryKpis.costCi[1].toFixed(5)}]
          </span>
        </div>

        {/* Carbon Emissions Mean +/- CI */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] font-medium uppercase tracking-wider">Adaptive Carbon</span>
            <Leaf size={14} className="text-cyan-600" />
          </div>
          <div className="mt-1">
            <span className="text-base font-bold font-mono text-slate-900">
              {summaryKpis.carbonMean.toFixed(2)} g
            </span>
          </div>
          <span className="mt-0.5 text-[9.5px] font-mono text-slate-400 block truncate">
            95% CI: [{summaryKpis.carbonCi[0].toFixed(2)}, {summaryKpis.carbonCi[1].toFixed(2)}]
          </span>
        </div>

        {/* Pooled Quantiles (True Population) */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-emerald-800">
            <span className="text-[10px] font-medium uppercase tracking-wider">Pooled P95 Latency</span>
            <Zap size={14} className="text-emerald-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-emerald-900">
              {summaryKpis.pooledP95.toFixed(1)}ms
            </span>
          </div>
          <span className="mt-0.5 text-[9.5px] font-mono text-emerald-700 block truncate">
            P50: {summaryKpis.pooledP50.toFixed(0)} | P90: {summaryKpis.pooledP90.toFixed(0)} | P99: {summaryKpis.pooledP99.toFixed(0)}ms
          </span>
        </div>

        {/* Holm-Bonferroni Significance */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] font-medium uppercase tracking-wider">Holm Significance</span>
            <Sparkles size={14} className="text-purple-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-slate-900">
              {summaryKpis.sigCount} / {summaryKpis.totalCount}
            </span>
            <span className="text-xs font-semibold text-purple-700">({summaryKpis.sigPercent}%)</span>
          </div>
          <span className="mt-1 text-[10px] text-slate-500 block">
            FWER controlled at α = 0.05
          </span>
        </div>
      </div>

      {/* 2. Main Statistical Analysis Workspace */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
        {/* Header & Controls */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 text-sm sm:text-base">{title}</h3>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                Ref: {referencePolicy}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Paired Student&apos;s t-tests, standardized Cohen&apos;s d<sub>z</sub> effect sizes, and Holm-Bonferroni FWER step-down ({mTotal} hypotheses evaluated)
            </p>
          </div>

          {/* Navigation & Mode Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                onClick={() => setActiveTab('forest')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
                  activeTab === 'forest'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart2 size={13} />
                Forest Plot
              </button>
              <button
                onClick={() => setActiveTab('matrix')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
                  activeTab === 'matrix'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet size={13} />
                Holm-Bonferroni Matrix ({mTotal})
              </button>
            </div>
          </div>
        </div>

        {/* Filters & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-[11px] font-medium text-slate-400 mr-1 flex items-center gap-1">
              <Filter size={11} /> Filter:
            </span>
            {[
              { id: 'all', label: `All (${enrichedComparisons.length})` },
              { id: 'significant', label: `Significant Only (${summaryKpis.sigCount})` },
              { id: 'latency', label: 'Latency' },
              { id: 'cost', label: 'Cost' },
              { id: 'carbon', label: 'Carbon' },
              { id: 'cold', label: 'Cold Start' },
              { id: 'sla', label: 'SLA' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setMetricFilter(f.id as any)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                  metricFilter === f.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-[11px] text-slate-400">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:outline-none"
            >
              <option value="rank">p-Value Rank</option>
              <option value="effect">Effect Size (Cohen&apos;s dz)</option>
              <option value="metric">Metric Name</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="rounded-lg border border-slate-200 p-1 text-slate-600 hover:bg-slate-100"
              title="Toggle sort direction"
            >
              {sortOrder === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>

        {/* TAB 1: Forest Plot Visual */}
        {activeTab === 'forest' && (
          <div className="space-y-4">
            {/* Effect Size Legend & Region Markers */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50/70 p-3 text-[11px] text-slate-600 border border-slate-100">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-800">Standardized Benchmarks:</span>
                <span className="inline-flex items-center gap-1 font-mono text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> |dz| &lt; 0.2: Negligible
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-blue-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> 0.2–0.5: Small
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-indigo-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" /> 0.5–0.8: Medium
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-purple-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-600" /> &ge; 0.8: Large
                </span>
              </div>

              <div className="flex items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                  <ArrowDownRight size={12} /> Favors Adaptive (dz &lt; 0)
                </span>
                <span className="text-slate-300">|</span>
                <span className="inline-flex items-center gap-1 text-slate-600">
                  Favors Baseline (dz &gt; 0) <ArrowUpRight size={12} />
                </span>
              </div>
            </div>

            {/* Forest Plot Rows */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <div className="min-w-[840px] divide-y divide-slate-100">
                {/* Header Row */}
                <div className="grid grid-cols-12 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold text-slate-600">
                  <div className="col-span-4">Hypothesis Comparison (Adaptive vs. Baseline)</div>
                  <div className="col-span-5 text-center">
                    Cohen&apos;s d<sub>z</sub> Effect Size (95% Confidence Interval)
                  </div>
                  <div className="col-span-3 text-right">Raw p / Holm p (adj)</div>
                </div>

                {/* Plot Axis Guide */}
                <div className="grid grid-cols-12 px-4 py-1.5 bg-slate-50/40 text-[10px] font-mono text-slate-400 border-b border-slate-100">
                  <div className="col-span-4 font-sans text-slate-400">Metric &amp; Target Policy</div>
                  <div className="col-span-5 relative h-4">
                    <span className="absolute left-0">−3.0</span>
                    <span className="absolute" style={{ left: `${scaleX(-0.8)}px` }}>−0.8</span>
                    <span className="absolute" style={{ left: `${scaleX(0)}px`, transform: 'translateX(-50%)' }}>
                      0.0 (Null)
                    </span>
                    <span className="absolute" style={{ left: `${scaleX(0.8)}px` }}>+0.8</span>
                    <span className="absolute right-0">+3.0</span>
                  </div>
                  <div className="col-span-3 text-right">Significance Decision</div>
                </div>

                {/* Comparison Items */}
                {filteredData.map((comp, idx) => {
                  const ci = comp.ci
                  const isSig = comp.isStatisticallySignificant
                  const xCenter = scaleX(comp.cohensDz)
                  const xLeft = scaleX(ci.ciLower)
                  const xRight = scaleX(ci.ciUpper)
                  const width = Math.max(3, xRight - xLeft)

                  return (
                    <div
                      key={`${comp.metric}-${comp.baselinePolicy}-${idx}`}
                      className="grid grid-cols-12 items-center px-4 py-3 hover:bg-slate-50/60 transition text-xs"
                    >
                      {/* Left: Comparison details */}
                      <div className="col-span-4 pr-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-800 font-sans">
                            {METRIC_LABELS[comp.metric] || comp.metric}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            vs {comp.baselinePolicy}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                          <span>
                            Diff: {comp.percentDifference > 0 ? '+' : ''}
                            {comp.percentDifference.toFixed(1)}%
                          </span>
                          <span className="text-slate-300">|</span>
                          <span>t = {comp.tStatistic.toFixed(2)}</span>
                          <span className="text-slate-300">|</span>
                          <span
                            className={`rounded px-1 py-0.2 font-sans font-medium ${
                              comp.effectSizeMagnitude === 'Large'
                                ? 'bg-purple-100 text-purple-800'
                                : comp.effectSizeMagnitude === 'Medium'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {comp.effectSizeMagnitude}
                          </span>
                        </div>
                      </div>

                      {/* Middle: Forest Plot SVG Whisker */}
                      <div className="col-span-5 px-1">
                        <div className="relative h-9 w-full flex items-center">
                          <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${svgWidth} 36`}>
                            {/* Zero Effect Reference Line (dz = 0) */}
                            <line
                              x1={scaleX(0)}
                              y1={0}
                              x2={scaleX(0)}
                              y2={36}
                              stroke="#cbd5e1"
                              strokeWidth={1.5}
                              strokeDasharray="3 3"
                            />

                            {/* Small, Medium, Large Effect Zones */}
                            <line
                              x1={scaleX(-0.8)}
                              y1={4}
                              x2={scaleX(-0.8)}
                              y2={32}
                              stroke="#e2e8f0"
                              strokeWidth={1}
                              strokeDasharray="2 2"
                            />
                            <line
                              x1={scaleX(0.8)}
                              y1={4}
                              x2={scaleX(0.8)}
                              y2={32}
                              stroke="#e2e8f0"
                              strokeWidth={1}
                              strokeDasharray="2 2"
                            />

                            {/* 95% Confidence Interval Whisker */}
                            <line
                              x1={xLeft}
                              y1={18}
                              x2={xRight}
                              y2={18}
                              stroke={isSig ? '#0f766e' : '#94a3b8'}
                              strokeWidth={2}
                            />

                            {/* CI End Caps */}
                            <line
                              x1={xLeft}
                              y1={13}
                              x2={xLeft}
                              y2={23}
                              stroke={isSig ? '#0f766e' : '#94a3b8'}
                              strokeWidth={1.5}
                            />
                            <line
                              x1={xRight}
                              y1={13}
                              x2={xRight}
                              y2={23}
                              stroke={isSig ? '#0f766e' : '#94a3b8'}
                              strokeWidth={1.5}
                            />

                            {/* Point Estimate Diamond/Marker */}
                            <circle
                              cx={xCenter}
                              cy={18}
                              r={4.5}
                              fill={isSig ? '#0f766e' : '#64748b'}
                              stroke="#ffffff"
                              strokeWidth={1.5}
                            />
                          </svg>
                        </div>

                        {/* Exact Values Legend */}
                        <div className="flex justify-between text-[9.5px] font-mono text-slate-400 pt-0.5">
                          <span>CI Lower: {ci.ciLower}</span>
                          <span className="font-bold text-slate-700">dz = {comp.cohensDz}</span>
                          <span>CI Upper: {ci.ciUpper}</span>
                        </div>
                      </div>

                      {/* Right: p-values & Holm Decision */}
                      <div className="col-span-3 text-right space-y-1 font-mono">
                        <div className="text-[11px] text-slate-700">
                          <span className="text-slate-400 font-sans text-[10px] mr-1">p(raw):</span>
                          {comp.pValue < 0.0001 ? '< 0.0001' : comp.pValue.toFixed(4)}
                        </div>
                        <div className="text-[11px] font-bold text-slate-900">
                          <span className="text-slate-400 font-sans text-[10px] mr-1">p(adj):</span>
                          {comp.adjustedPValue < 0.0001 ? '< 0.0001' : comp.adjustedPValue.toFixed(4)}
                        </div>
                        <div>
                          {isSig ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-sans font-semibold text-emerald-800">
                              <CheckCircle2 size={11} /> p &lt; 0.05 (Sig)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-sans font-medium text-slate-500">
                              Not Sig.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {filteredData.length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No comparisons match the selected filter.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Dynamic Holm-Bonferroni Step-Down Significance Matrix */}
        {activeTab === 'matrix' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-purple-200/60 bg-purple-50/30 p-3.5 text-xs text-purple-900 flex items-start gap-2.5">
              <Sparkles size={16} className="mt-0.5 text-purple-600 flex-shrink-0" />
              <div className="space-y-1 text-[11px] leading-relaxed">
                <p>
                  <strong>Dynamic Holm-Bonferroni Step-Down Procedure (m = {mTotal} Hypotheses):</strong> Hypotheses are sorted by ascending raw p-value. For each rank <em>k = 1 … m</em>, the uncorrected p-value is evaluated against the sequential step-down threshold &alpha;<sub>k</sub> = &alpha; / (m − k + 1). Adjusted p-values strictly control the Family-Wise Error Rate (FWER) at &alpha; = 0.05.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] text-slate-600 font-sans font-semibold">
                    <th className="py-2.5 px-3">Rank (k)</th>
                    <th className="py-2.5 px-3">Hypothesis Label</th>
                    <th className="py-2.5 px-3">Evaluated Metric</th>
                    <th className="py-2.5 px-3">Baseline Policy</th>
                    <th className="py-2.5 px-3">Raw p-Value</th>
                    <th className="py-2.5 px-3">Step-Down Threshold α<sub>k</sub></th>
                    <th className="py-2.5 px-3">Holm-Adjusted p</th>
                    <th className="py-2.5 px-3">Uncorrected (p &lt; 0.05)</th>
                    <th className="py-2.5 px-3">Holm Decision (FWER &le; 0.05)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {holmMatrix.map((step) => {
                    return (
                      <tr key={step.rank} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-bold text-slate-800">#{step.rank}</td>
                        <td className="py-2 px-3 text-slate-600 font-sans text-[11px]">
                          {step.hypothesisLabel}
                        </td>
                        <td className="py-2 px-3 font-sans font-medium text-slate-800">
                          {METRIC_LABELS[step.metric] || step.metric}
                        </td>
                        <td className="py-2 px-3 font-sans text-slate-600">{step.baselinePolicy}</td>
                        <td className="py-2 px-3 text-slate-700">
                          {step.rawPValue < 0.0001 ? '< 0.0001' : step.rawPValue.toFixed(4)}
                        </td>
                        <td className="py-2 px-3 text-slate-500 font-semibold">
                          {step.criticalAlpha.toFixed(5)}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">
                          {step.adjustedPValue < 0.0001 ? '< 0.0001' : step.adjustedPValue.toFixed(4)}
                        </td>
                        <td className="py-2 px-3 font-sans">
                          {step.uncorrectedSignificant ? (
                            <span className="text-emerald-700 font-medium">Significant</span>
                          ) : (
                            <span className="text-slate-400">Not Sig.</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-sans">
                          {step.holmSignificant ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                              <CheckCircle2 size={11} /> Reject H₀ (Significant)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                              Fail to Reject
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Scientific Methodology & Disclaimer Banner */}
        <div className="flex items-start gap-2 rounded-xl border border-slate-200/70 bg-slate-50/80 p-3 text-[11px] text-slate-500">
          <Info size={14} className="mt-0.5 text-slate-400 flex-shrink-0" />
          <p className="leading-relaxed">
            <strong className="text-slate-700">Inferential Validity Note:</strong> Statistical significance indicates evidence against the null hypothesis of equal population means under identical stochastic seeds. It does not replace engineering domain judgment regarding practical operational benefit. Cohen&apos;s d<sub>z</sub> quantifies the standardized within-subject effect size independent of sample size.
          </p>
        </div>
      </div>
    </div>
  )
}
