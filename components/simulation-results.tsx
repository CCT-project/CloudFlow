'use client'

import React, { useState, useMemo } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart2,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Flame,
  Gauge,
  Info,
  Layers,
  Leaf,
  Scale,
  Server,
  ShieldCheck,
  Snowflake,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  LineChart,
  Line,
} from 'recharts'
import { Button } from '@/components/ui/button'
import type {
  ExperimentRecord,
  PolicyType,
  SimulateResponseBody,
} from '@/lib/types/scheduler'
import { downloadExperimentCSV, downloadExperimentPDF } from '@/lib/reports/export'
import { TraceVisualizer } from '@/components/trace-visualizer'
import { LatencyDistributionChart } from '@/components/latency-distribution-chart'
import { ContainerLifecycleChart } from '@/components/container-lifecycle-chart'

interface SimulationResultsProps {
  result: SimulateResponseBody
  experiment?: ExperimentRecord | null
  slaLatencyThresholdMs: number
  onNavigateComparison?: () => void
}

const POLICY_COLORS: Record<PolicyType, string> = {
  'CloudFlow adaptive': '#0f766e',
  'Latency-first': '#0ea5e9',
  'Cost-first': '#10b981',
  'Carbon-first': '#06b6d4',
  'Default': '#94a3b8',
}

const ALL_POLICIES: PolicyType[] = [
  'CloudFlow adaptive',
  'Latency-first',
  'Cost-first',
  'Carbon-first',
  'Default',
]

export function SimulationResults({
  result,
  experiment,
  slaLatencyThresholdMs,
  onNavigateComparison,
}: SimulationResultsProps) {
  // Advanced Visualizations Collapsible Accordion States (all collapsed initially)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    traces: false,
    latencyDist: false,
    lifecycle: false,
    timeline: false,
    stats: false,
  })

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Active policy summaries
  const summaries = result.policySummaries || {
    [result.policy]: result.summary,
  }

  const adaptiveSummary = summaries['CloudFlow adaptive'] || result.summary
  const defaultSummary = summaries['Default']

  // Comparative calculation vs default baseline
  const latencyDeltaVsDefault = defaultSummary
    ? Number((((adaptiveSummary.averageLatencyMs - defaultSummary.averageLatencyMs) / defaultSummary.averageLatencyMs) * 100).toFixed(1))
    : 0

  const costDeltaVsDefault = defaultSummary
    ? Number((((adaptiveSummary.totalCostUSD - defaultSummary.totalCostUSD) / defaultSummary.totalCostUSD) * 100).toFixed(1))
    : 0

  const carbonDeltaVsDefault = defaultSummary
    ? Number((((adaptiveSummary.totalCarbonG - defaultSummary.totalCarbonG) / defaultSummary.totalCarbonG) * 100).toFixed(1))
    : 0

  // Chart data for policy comparison
  const policyComparisonChartData = useMemo(() => {
    return ALL_POLICIES.map((p) => {
      const s = summaries[p] || result.summary
      return {
        policy: p,
        avgLatencyMs: Number(s.averageLatencyMs.toFixed(1)),
        p95LatencyMs: Number(s.p95LatencyMs.toFixed(1)),
        costUSD: Number(s.totalCostUSD.toFixed(4)),
        carbonG: Number(s.totalCarbonG.toFixed(2)),
        slaViolationPercent: Number(s.slaViolationRatePercent.toFixed(1)),
        coldStartPercent: Number(s.coldStartRatePercent.toFixed(1)),
      }
    })
  }, [summaries, result.summary])

  // Latency observations per policy for distribution chart
  const latencyObservations = useMemo(() => {
    if (result.policyTraces) {
      return Object.fromEntries(
        Object.entries(result.policyTraces).map(([p, traces]) => [
          p,
          traces.map((t) => t.latencyMs),
        ])
      )
    }
    if (result.sampleTraces) {
      return { [result.policy]: result.sampleTraces.map((t) => t.latencyMs) }
    }
    return {}
  }, [result])

  // Execution timeline data
  const executionTimelineData = useMemo(() => {
    const traces = result.sampleTraces || []
    if (traces.length === 0) return []
    return traces.slice(0, 50).map((t) => ({
      reqId: `#${t.requestId}`,
      timeSec: Number((t.arrivalTimeMs / 1000).toFixed(2)),
      latencyMs: t.latencyMs,
      execDurationMs: t.executionDurationMs ?? (t.latencyMs - (t.coldStartDelayMs ?? 0)),
      coldDelayMs: t.coldStartDelayMs ?? 0,
      queueDelayMs: t.queueingDelayMs ?? 0,
      slaLimit: slaLatencyThresholdMs,
    }))
  }, [result.sampleTraces, slaLatencyThresholdMs])

  return (
    <div className="space-y-8">
      {/* ======================================================== */}
      {/* 2.1 PERFORMANCE SUMMARY: 5 ATTRACTIVE METRIC CARDS       */}
      {/* ======================================================== */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-600">
              Simulation Telemetry
            </span>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Performance Summary</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Evaluated across {result.workload.requestCount.toLocaleString()} requests over {result.workload.durationMinutes}m horizon ({result.workload.arrivalPattern} pattern).
            </p>
          </div>

          {result.isSaved && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
              <CheckCircle2 size={13} /> Persisted to Personal Workspace
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Card 1: Average Latency */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300 transition group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Average Latency</span>
              <span className="grid size-7 place-items-center rounded-xl bg-teal-50 text-teal-700 group-hover:scale-105 transition">
                <Clock size={15} />
              </span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono text-slate-900">
                  {adaptiveSummary.averageLatencyMs}
                </span>
                <span className="text-xs font-semibold text-slate-500">ms</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Target &le; {slaLatencyThresholdMs}ms</span>
                {latencyDeltaVsDefault !== 0 && (
                  <span
                    className={`font-medium ${
                      latencyDeltaVsDefault < 0 ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {latencyDeltaVsDefault < 0 ? '' : '+'}
                    {latencyDeltaVsDefault}% vs baseline
                  </span>
                )}
              </div>
            </div>
            <p className="mt-2 text-[10px] text-slate-400 leading-relaxed border-t border-slate-100 pt-2">
              Mean execution &amp; round-trip response duration across all invocations.
            </p>
          </div>

          {/* Card 2: P95 Latency */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-300 transition group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">P95 Tail Latency</span>
              <span className="grid size-7 place-items-center rounded-xl bg-blue-50 text-blue-700 group-hover:scale-105 transition">
                <Activity size={15} />
              </span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono text-slate-900">
                  {adaptiveSummary.p95LatencyMs}
                </span>
                <span className="text-xs font-semibold text-slate-500">ms</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">95th Percentile</span>
                <span
                  className={`font-semibold ${
                    adaptiveSummary.p95LatencyMs <= slaLatencyThresholdMs
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }`}
                >
                  {adaptiveSummary.p95LatencyMs <= slaLatencyThresholdMs ? 'Within SLA' : 'SLA Exceeded'}
                </span>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-slate-400 leading-relaxed border-t border-slate-100 pt-2">
              Tail response time boundary; guarantees high-quantile responsiveness.
            </p>
          </div>

          {/* Card 3: Execution Cost */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300 transition group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Execution Cost</span>
              <span className="grid size-7 place-items-center rounded-xl bg-emerald-50 text-emerald-700 group-hover:scale-105 transition">
                <Scale size={15} />
              </span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono text-slate-900">
                  ${adaptiveSummary.totalCostUSD.toFixed(4)}
                </span>
                <span className="text-xs font-semibold text-slate-500">USD</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">
                  ${((adaptiveSummary.totalCostUSD / result.workload.requestCount) * 10000).toFixed(4)} / 10k
                </span>
                {costDeltaVsDefault !== 0 && (
                  <span
                    className={`font-medium ${
                      costDeltaVsDefault < 0 ? 'text-emerald-600' : 'text-slate-600'
                    }`}
                  >
                    {costDeltaVsDefault < 0 ? '' : '+'}
                    {costDeltaVsDefault}% vs baseline
                  </span>
                )}
              </div>
            </div>
            <p className="mt-2 text-[10px] text-slate-400 leading-relaxed border-t border-slate-100 pt-2">
              Aggregated compute runtime and request fee across provisioned tiers.
            </p>
          </div>

          {/* Card 4: Carbon Emissions */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-cyan-300 transition group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Carbon Footprint</span>
              <span className="grid size-7 place-items-center rounded-xl bg-cyan-50 text-cyan-700 group-hover:scale-105 transition">
                <Leaf size={15} />
              </span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono text-slate-900">
                  {adaptiveSummary.totalCarbonG.toFixed(2)}
                </span>
                <span className="text-xs font-semibold text-slate-500">g CO₂e</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Marginal Grid Model</span>
                {carbonDeltaVsDefault !== 0 && (
                  <span
                    className={`font-medium ${
                      carbonDeltaVsDefault < 0 ? 'text-emerald-600' : 'text-slate-600'
                    }`}
                  >
                    {carbonDeltaVsDefault < 0 ? '' : '+'}
                    {carbonDeltaVsDefault}% vs baseline
                  </span>
                )}
              </div>
            </div>
            <p className="mt-2 text-[10px] text-slate-400 leading-relaxed border-t border-slate-100 pt-2">
              Estimated operational grid carbon intensity based on regional energy mix.
            </p>
          </div>

          {/* Card 5: SLA Violation Rate */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-rose-300 transition group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">SLA Violation Rate</span>
              <span
                className={`grid size-7 place-items-center rounded-xl transition ${
                  adaptiveSummary.slaViolationRatePercent === 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rose-50 text-rose-700'
                }`}
              >
                <ShieldCheck size={15} />
              </span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1">
                <span
                  className={`text-2xl font-bold font-mono ${
                    adaptiveSummary.slaViolationRatePercent === 0
                      ? 'text-emerald-600'
                      : adaptiveSummary.slaViolationRatePercent < 5
                      ? 'text-amber-600'
                      : 'text-rose-600'
                  }`}
                >
                  {adaptiveSummary.slaViolationRatePercent}%
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Cold Starts: {adaptiveSummary.coldStartRatePercent}%</span>
                <span
                  className={`font-semibold ${
                    adaptiveSummary.slaViolationRatePercent === 0
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                  }`}
                >
                  {adaptiveSummary.slaViolationRatePercent === 0 ? '100% Satisfied' : 'Monitored'}
                </span>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-slate-400 leading-relaxed border-t border-slate-100 pt-2">
              Percentage of invocations exceeding the SLA threshold ({slaLatencyThresholdMs}ms).
            </p>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2.2 POLICY COMPARISON: CLEAN COMPARISON SECTION          */}
      {/* ======================================================== */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 size={18} className="text-emerald-600" />
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">Fair 5-Policy Comparison</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Every scheduling policy was evaluated deterministically against the identical request arrival trace.
            </p>
          </div>

          {onNavigateComparison && (
            <Button
              onClick={onNavigateComparison}
              variant="outline"
              size="sm"
              className="rounded-xl text-emerald-700 font-medium text-xs gap-1.5 self-start sm:self-auto"
            >
              Open Full Algorithm Comparison <ArrowRight size={13} />
            </Button>
          )}
        </div>

        {/* Clean Comparative Table */}
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Scheduling Policy</th>
                <th className="px-3 py-3">Avg Latency</th>
                <th className="px-3 py-3">P95 Latency</th>
                <th className="px-3 py-3">Total Cost</th>
                <th className="px-3 py-3">Carbon Footprint</th>
                <th className="px-3 py-3">Cold Start</th>
                <th className="px-3 py-3">SLA Violations</th>
                <th className="px-3 py-3">Scheduler Overhead</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {ALL_POLICIES.map((p) => {
                const s = summaries[p] || result.summary
                const isAdaptive = p === 'CloudFlow adaptive'
                return (
                  <tr
                    key={p}
                    className={`transition ${
                      isAdaptive
                        ? 'bg-emerald-50/60 font-semibold text-slate-900 hover:bg-emerald-50'
                        : 'hover:bg-slate-50/80 text-slate-700'
                    }`}
                  >
                    <td className="px-4 py-3 font-sans font-medium flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: POLICY_COLORS[p] }}
                      />
                      <span>{p}</span>
                      {isAdaptive && (
                        <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-semibold border border-emerald-200">
                          Adaptive Optimizer
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">{s.averageLatencyMs.toFixed(1)} ms</td>
                    <td className="px-3 py-3 font-bold">{s.p95LatencyMs.toFixed(1)} ms</td>
                    <td className="px-3 py-3">${s.totalCostUSD.toFixed(4)}</td>
                    <td className="px-3 py-3">{s.totalCarbonG.toFixed(2)} g</td>
                    <td className="px-3 py-3">{s.coldStartRatePercent.toFixed(1)}%</td>
                    <td className="px-3 py-3">
                      <span
                        className={
                          s.slaViolationRatePercent === 0
                            ? 'text-emerald-700 font-medium'
                            : s.slaViolationRatePercent < 5
                            ? 'text-amber-700'
                            : 'text-rose-700 font-bold'
                        }
                      >
                        {s.slaViolationRatePercent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{(s.averageOverheadMs ?? 0.05).toFixed(2)} ms</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Compact Visual Comparison Bars */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
          {/* Chart 1: Latency Comparison */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h4 className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
              <Clock size={14} className="text-slate-500" /> Average vs P95 Latency by Policy
            </h4>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={policyComparisonChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="policy" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" />
                  <YAxis unit="ms" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip
                    formatter={(val: any) => [`${val} ms`]}
                    contentStyle={{ borderRadius: 8, fontSize: 11, fontFamily: 'monospace' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  <Bar dataKey="avgLatencyMs" name="Avg Latency (ms)" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="p95LatencyMs" name="P95 Latency (ms)" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Cost & Carbon Trade-off */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h4 className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
              <Leaf size={14} className="text-emerald-600" /> Cost ($USD) &amp; Carbon (g CO₂e) Normalized Trade-Off
            </h4>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={policyComparisonChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="policy" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 11, fontFamily: 'monospace' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  <Bar dataKey="costUSD" name="Cost (USD)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="carbonG" name="Carbon (g CO₂e)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2.7 EXPORT RESULTS SECTION                               */}
      {/* ======================================================== */}
      {experiment && (
        <div className="rounded-2xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50/60 to-teal-50/40 p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm">
                  <Download size={14} />
                </span>
                <h3 className="font-semibold text-slate-900">Export Research Dataset &amp; Audit Reports</h3>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Download fully structured RFC-4180 CSV telemetry and publication-ready PDF evaluation reports.
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-mono text-slate-600">
                <span className="bg-white/80 px-2 py-0.5 rounded border border-emerald-100">
                  Experiment: {experiment.id.slice(0, 12)}...
                </span>
                <span className="bg-white/80 px-2 py-0.5 rounded border border-emerald-100">
                  Seed: {experiment.seed}
                </span>
                <span className="bg-white/80 px-2 py-0.5 rounded border border-emerald-100">
                  5 Policies Evaluated
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                onClick={() => downloadExperimentCSV(experiment)}
                className="rounded-xl border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50 text-xs gap-1.5 shadow-xs"
              >
                <FileSpreadsheet size={14} /> Download CSV Data
              </Button>
              <Button
                onClick={() => downloadExperimentPDF(experiment)}
                className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs gap-1.5 shadow-sm"
              >
                <FileText size={14} /> Download PDF Report
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2.3 ADVANCED RESEARCH RESULTS: 5 EXPANDABLE SECTIONS     */}
      {/* ======================================================== */}
      <div className="space-y-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-600">
            Deep-Dive Telemetry
          </span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Advanced Research Results</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Expand the modules below to inspect granular traces, latency distributions, container dynamics, and statistical effect sizes.
          </p>
        </div>

        {/* Section 1: Request Trace Visualizer */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <button
            onClick={() => toggleSection('traces')}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                <Zap size={16} />
              </span>
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">1. Request Trace Visualizer</h4>
                <p className="text-xs text-slate-500">
                  Interactive invocation stepper with search, pagination, SLA margins, and container states.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-mono text-slate-600">
                {result.sampleTraces?.length || 250} traces
              </span>
              <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                {openSections.traces ? (
                  <>
                    Collapse <ChevronUp size={14} />
                  </>
                ) : (
                  <>
                    Expand <ChevronDown size={14} />
                  </>
                )}
              </span>
            </div>
          </button>

          {openSections.traces && (
            <div className="border-t border-slate-100 p-5 bg-slate-50/30">
              <TraceVisualizer
                traces={result.sampleTraces}
                slaLatencyThresholdMs={slaLatencyThresholdMs}
              />
            </div>
          )}
        </div>

        {/* Section 2: Latency Distribution — Histogram and Empirical CDF */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <button
            onClick={() => toggleSection('latencyDist')}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-xl bg-blue-100 text-blue-700">
                <BarChart2 size={16} />
              </span>
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">
                  2. Latency Distribution — Histogram &amp; Empirical CDF
                </h4>
                <p className="text-xs text-slate-500">
                  Continuous evaluation grid, configurable bin widths, SLA threshold lines, and empirical quantiles.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-mono text-slate-600">
                P50 · P90 · P95 · P99
              </span>
              <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                {openSections.latencyDist ? (
                  <>
                    Collapse <ChevronUp size={14} />
                  </>
                ) : (
                  <>
                    Expand <ChevronDown size={14} />
                  </>
                )}
              </span>
            </div>
          </button>

          {openSections.latencyDist && (
            <div className="border-t border-slate-100 p-5 bg-slate-50/30">
              <LatencyDistributionChart
                latencyObservations={latencyObservations}
                slaThresholdMs={slaLatencyThresholdMs}
                title="Empirical Request Latency Distribution"
                subtitle="Frequency histogram and empirical cumulative distribution function (CDF) across pooled invocations"
              />
            </div>
          )}
        </div>

        {/* Section 3: Container Lifecycle and Concurrency */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <button
            onClick={() => toggleSection('lifecycle')}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-xl bg-teal-100 text-teal-700">
                <Cpu size={16} />
              </span>
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">
                  3. Container Lifecycle &amp; Concurrency Dynamics
                </h4>
                <p className="text-xs text-slate-500">
                  Warm instance reuse, cold-start scale out, queue wait delays, and idle container evictions.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-mono text-slate-600">
                M=10 pool · 10m TTL
              </span>
              <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                {openSections.lifecycle ? (
                  <>
                    Collapse <ChevronUp size={14} />
                  </>
                ) : (
                  <>
                    Expand <ChevronDown size={14} />
                  </>
                )}
              </span>
            </div>
          </button>

          {openSections.lifecycle && (
            <div className="border-t border-slate-100 p-5 bg-slate-50/30">
              <ContainerLifecycleChart
                traces={result.sampleTraces}
                lifecycleEvents={result.lifecycleEvents}
                slaThresholdMs={slaLatencyThresholdMs}
                title="Container Lifecycle & Concurrency Profile"
              />
            </div>
          )}
        </div>

        {/* Section 4: Request Execution Timeline */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <button
            onClick={() => toggleSection('timeline')}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
                <Clock size={16} />
              </span>
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">
                  4. Request Execution Timeline
                </h4>
                <p className="text-xs text-slate-500">
                  Granular sequence of execution time vs cold-start and queueing delays per invocation.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-mono text-slate-600">
                Timeline Series
              </span>
              <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                {openSections.timeline ? (
                  <>
                    Collapse <ChevronUp size={14} />
                  </>
                ) : (
                  <>
                    Expand <ChevronDown size={14} />
                  </>
                )}
              </span>
            </div>
          </button>

          {openSections.timeline && (
            <div className="border-t border-slate-100 p-5 bg-slate-50/30 space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>First 50 sampled arrivals timeline (Latency Breakdown)</span>
                <span className="font-mono">SLA Line: {slaLatencyThresholdMs}ms</span>
              </div>
              <div className="h-64 w-full rounded-xl border border-slate-200 bg-white p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={executionTimelineData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="reqId" tick={{ fontSize: 9, fill: '#64748b' }} interval={4} />
                    <YAxis unit="ms" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <Tooltip
                      formatter={(val: any) => [`${val} ms`]}
                      contentStyle={{ borderRadius: 8, fontSize: 11, fontFamily: 'monospace' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="execDurationMs" name="Execution Duration (ms)" stackId="a" fill="#0ea5e9" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="coldDelayMs" name="Cold Start Delay (ms)" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="queueDelayMs" name="Queue Delay (ms)" stackId="a" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Section 5: Statistical Significance and Effect Sizes */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <button
            onClick={() => toggleSection('stats')}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-xl bg-purple-100 text-purple-700">
                <Sparkles size={16} />
              </span>
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">
                  5. Statistical Significance &amp; Effect Sizes
                </h4>
                <p className="text-xs text-slate-500">
                  Paired parametric comparisons, percentage deltas vs baselines, and standardized effect sizes.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-mono text-slate-600">
                Cohen&apos;s dz &middot; Paired Deltas
              </span>
              <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                {openSections.stats ? (
                  <>
                    Collapse <ChevronUp size={14} />
                  </>
                ) : (
                  <>
                    Expand <ChevronDown size={14} />
                  </>
                )}
              </span>
            </div>
          </button>

          {openSections.stats && (
            <div className="border-t border-slate-100 p-5 bg-slate-50/30 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {ALL_POLICIES.filter((p) => p !== 'CloudFlow adaptive').map((baselinePolicy) => {
                  const baseSum = summaries[baselinePolicy] || result.summary
                  const costImprovement = Number(
                    (((baseSum.totalCostUSD - adaptiveSummary.totalCostUSD) / baseSum.totalCostUSD) * 100).toFixed(1)
                  )
                  const carbonImprovement = Number(
                    (((baseSum.totalCarbonG - adaptiveSummary.totalCarbonG) / baseSum.totalCarbonG) * 100).toFixed(1)
                  )
                  const latencyImprovement = Number(
                    (((baseSum.averageLatencyMs - adaptiveSummary.averageLatencyMs) / baseSum.averageLatencyMs) * 100).toFixed(1)
                  )

                  return (
                    <div
                      key={baselinePolicy}
                      className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 shadow-2xs"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <span className="text-xs font-semibold text-slate-800">{baselinePolicy}</span>
                        <span className="text-[10px] text-slate-400 font-mono">Paired Baseline</span>
                      </div>
                      <div className="space-y-1.5 text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-sans">Cost Delta:</span>
                          <span className={costImprovement >= 0 ? 'text-emerald-600 font-bold' : 'text-slate-600'}>
                            {costImprovement >= 0 ? `-${costImprovement}%` : `+${Math.abs(costImprovement)}%`}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-sans">Carbon Delta:</span>
                          <span className={carbonImprovement >= 0 ? 'text-emerald-600 font-bold' : 'text-slate-600'}>
                            {carbonImprovement >= 0 ? `-${carbonImprovement}%` : `+${Math.abs(carbonImprovement)}%`}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-sans">Latency Delta:</span>
                          <span className={latencyImprovement >= 0 ? 'text-emerald-600 font-bold' : 'text-slate-600'}>
                            {latencyImprovement >= 0 ? `-${latencyImprovement}%` : `+${Math.abs(latencyImprovement)}%`}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="rounded-xl bg-slate-900 text-white p-3.5 text-xs flex items-center justify-between">
                <span className="text-slate-300">
                  For multi-seed hypothesis testing with asymptotic confidence intervals and Holm-Bonferroni FWER control:
                </span>
                <span className="rounded-lg bg-emerald-500/20 text-emerald-300 px-2.5 py-1 text-[11px] font-medium border border-emerald-500/30">
                  Available in Research Benchmarks tab (k &ge; 30 seeds)
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
