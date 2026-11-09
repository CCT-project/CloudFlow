'use client'

import React, { useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts'
import {
  BarChart2,
  TrendingUp,
  Sliders,
  Info,
  ShieldCheck,
  Check,
  Clock,
  Layers,
} from 'lucide-react'
import type { PolicyType } from '@/lib/types/scheduler'
import {
  buildMultiPolicyHistogram,
  buildMultiPolicyCdf,
  summarizeEmpiricalQuantiles,
  type EmpiricalQuantileSummary,
} from '@/lib/metrics/distribution'

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

export interface LatencyDistributionChartProps {
  latencyObservations?: Partial<Record<PolicyType, number[]>>
  pooledQuantiles?: Partial<Record<PolicyType, { p50: number; p90: number; p95: number; p99: number }>>
  slaThresholdMs?: number
  title?: string
  subtitle?: string
}

export function LatencyDistributionChart({
  latencyObservations = {},
  pooledQuantiles = {},
  slaThresholdMs = 250,
  title = 'Empirical Request Latency Distribution',
  subtitle = 'Histogram frequency and empirical cumulative distribution function (CDF) across pooled invocations',
}: LatencyDistributionChartProps) {
  // UI State
  const [viewMode, setViewMode] = useState<'histogram' | 'cdf'>('histogram')
  const [binWidth, setBinWidth] = useState<number>(25)
  const [selectedPolicies, setSelectedPolicies] = useState<Record<PolicyType, boolean>>({
    'CloudFlow adaptive': true,
    'Latency-first': true,
    'Cost-first': true,
    'Carbon-first': false,
    'Default': true,
  })

  // Detect which policies actually have observations
  const availablePolicies = useMemo(() => {
    return ALL_POLICIES.filter((p) => (latencyObservations[p]?.length ?? 0) > 0)
  }, [latencyObservations])

  // Filter observations to selected policies
  const activeObservations = useMemo(() => {
    const res: Partial<Record<PolicyType, number[]>> = {}
    for (const p of availablePolicies) {
      if (selectedPolicies[p] && latencyObservations[p]) {
        res[p] = latencyObservations[p]
      }
    }
    return res
  }, [availablePolicies, selectedPolicies, latencyObservations])

  // Compute Multi-Policy Histogram
  const histogramData = useMemo(() => {
    if (viewMode !== 'histogram') return []
    return buildMultiPolicyHistogram(activeObservations, binWidth).bins
  }, [viewMode, activeObservations, binWidth])

  // Compute Multi-Policy CDF
  const cdfData = useMemo(() => {
    if (viewMode !== 'cdf') return []
    return buildMultiPolicyCdf(activeObservations, 60).cdfData
  }, [viewMode, activeObservations])

  // Compute empirical summaries per policy
  const policySummaries = useMemo<Partial<Record<PolicyType, EmpiricalQuantileSummary>>>(() => {
    const map: Partial<Record<PolicyType, EmpiricalQuantileSummary>> = {}
    for (const p of availablePolicies) {
      if (latencyObservations[p]) {
        map[p] = summarizeEmpiricalQuantiles(latencyObservations[p]!, slaThresholdMs)
      }
    }
    return map
  }, [availablePolicies, latencyObservations, slaThresholdMs])

  const togglePolicy = (policy: PolicyType) => {
    setSelectedPolicies((prev) => {
      const activeCount = Object.values(prev).filter(Boolean).length
      // Don't allow deselecting the last active policy
      if (prev[policy] && activeCount <= 1) return prev
      return { ...prev, [policy]: !prev[policy] }
    })
  }

  const hasData = availablePolicies.length > 0 && Object.keys(activeObservations).length > 0

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900 text-sm sm:text-base">{title}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
              Pooled Requests
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>

        {/* View Toggle & Bins Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode switch */}
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              onClick={() => setViewMode('histogram')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
                viewMode === 'histogram'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart2 size={13} />
              Histogram
            </button>
            <button
              onClick={() => setViewMode('cdf')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
                viewMode === 'cdf'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp size={13} />
              Empirical CDF
            </button>
          </div>

          {/* Histogram bin selector */}
          {viewMode === 'histogram' && (
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
              <span className="text-[11px] text-slate-400 font-medium">Bin:</span>
              {[10, 25, 50].map((w) => (
                <button
                  key={w}
                  onClick={() => setBinWidth(w)}
                  className={`rounded px-1.5 py-0.5 text-[11px] font-mono transition ${
                    binWidth === w
                      ? 'bg-slate-900 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {w}ms
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Policy Selector Chips */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[11px] font-medium text-slate-400">Policies:</span>
        {availablePolicies.map((pol) => {
          const isSelected = !!selectedPolicies[pol]
          const color = POLICY_COLORS[pol]
          return (
            <button
              key={pol}
              onClick={() => togglePolicy(pol)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                isSelected
                  ? 'border-slate-300 bg-white shadow-xs font-semibold text-slate-800'
                  : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 opacity-60'
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span>{pol}</span>
              {isSelected && <Check size={11} className="text-slate-700" />}
            </button>
          )
        })}
      </div>

      {/* Chart Canvas */}
      {!hasData ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
          <Layers size={28} className="text-slate-300 mb-2" />
          <p className="text-xs font-medium text-slate-600">No pooled request latency observations available</p>
          <p className="mt-1 text-[11px] text-slate-400">
            Run a statistical benchmark to collect empirical request-level observations.
          </p>
        </div>
      ) : viewMode === 'histogram' ? (
        <div className="h-80 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={histogramData}
              margin={{ top: 10, right: 20, left: 0, bottom: 25 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="binLabel"
                tick={{ fontSize: 10, fill: '#64748b' }}
                interval="preserveStartEnd"
                angle={-30}
                textAnchor="end"
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748b' }}
                allowDecimals={false}
                label={{
                  value: 'Request Count',
                  angle: -90,
                  position: 'insideLeft',
                  fontSize: 10,
                  fill: '#94a3b8',
                }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null
                  return (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg text-xs">
                      <p className="font-semibold text-slate-900 border-b border-slate-100 pb-1 mb-1.5 font-mono">
                        Latency Bin: {label}
                      </p>
                      <div className="space-y-1">
                        {payload.map((item) => (
                          <div
                            key={item.dataKey as string}
                            className="flex items-center justify-between gap-4 font-mono text-[11px]"
                          >
                            <span className="flex items-center gap-1.5 font-sans" style={{ color: item.color }}>
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                              {item.name}:
                            </span>
                            <span className="font-bold text-slate-800">
                              {Number(item.value).toLocaleString()} reqs
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ paddingBottom: '10px', fontSize: '11px' }}
              />
              {/* SLA Threshold Marker */}
              {slaThresholdMs && (
                <ReferenceLine
                  x={`${Math.floor(slaThresholdMs / binWidth) * binWidth}–${Math.floor(slaThresholdMs / binWidth) * binWidth + binWidth}ms`}
                  stroke="#e11d48"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: `SLA (${slaThresholdMs}ms)`,
                    position: 'top',
                    fill: '#e11d48',
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                />
              )}
              {availablePolicies
                .filter((p) => selectedPolicies[p])
                .map((pol) => (
                  <Bar
                    key={pol}
                    dataKey={pol}
                    name={pol}
                    fill={POLICY_COLORS[pol]}
                    radius={[2, 2, 0, 0]}
                    maxBarSize={40}
                  />
                ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-80 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={cdfData}
              margin={{ top: 10, right: 20, left: 0, bottom: 15 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="latencyMs"
                unit="ms"
                tick={{ fontSize: 10, fill: '#64748b' }}
                label={{
                  value: 'Request Latency (ms)',
                  position: 'insideBottomRight',
                  offset: -5,
                  fontSize: 10,
                  fill: '#94a3b8',
                }}
              />
              <YAxis
                domain={[0, 100]}
                unit="%"
                ticks={[0, 25, 50, 75, 90, 95, 100]}
                tick={{ fontSize: 10, fill: '#64748b' }}
                label={{
                  value: 'Cumulative Prob. %',
                  angle: -90,
                  position: 'insideLeft',
                  fontSize: 10,
                  fill: '#94a3b8',
                }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null
                  return (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg text-xs">
                      <p className="font-semibold text-slate-900 border-b border-slate-100 pb-1 mb-1.5 font-mono">
                        Latency &le; {label} ms
                      </p>
                      <div className="space-y-1">
                        {payload.map((item) => (
                          <div
                            key={item.dataKey as string}
                            className="flex items-center justify-between gap-4 font-mono text-[11px]"
                          >
                            <span className="flex items-center gap-1.5 font-sans" style={{ color: item.color }}>
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                              {item.name}:
                            </span>
                            <span className="font-bold text-slate-800">{Number(item.value).toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="plainline"
                wrapperStyle={{ paddingBottom: '10px', fontSize: '11px' }}
              />
              {/* SLA Line */}
              <ReferenceLine
                x={slaThresholdMs}
                stroke="#e11d48"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `SLA (${slaThresholdMs}ms)`,
                  position: 'top',
                  fill: '#e11d48',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
              {/* P95 Horizontal Marker */}
              <ReferenceLine
                y={95}
                stroke="#64748b"
                strokeDasharray="2 2"
                strokeWidth={1}
                label={{
                  value: '95th Percentile Target',
                  position: 'insideBottomRight',
                  fill: '#64748b',
                  fontSize: 9,
                }}
              />
              {availablePolicies
                .filter((p) => selectedPolicies[p])
                .map((pol) => (
                  <Line
                    key={pol}
                    type="monotone"
                    dataKey={pol}
                    name={pol}
                    stroke={POLICY_COLORS[pol]}
                    strokeWidth={pol === 'CloudFlow adaptive' ? 2.5 : 1.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Quantiles Grid */}
      {hasData && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 pt-2">
          {availablePolicies
            .filter((p) => selectedPolicies[p])
            .map((pol) => {
              const summary = policySummaries[pol]
              if (!summary) return null
              const isAdaptive = pol === 'CloudFlow adaptive'
              return (
                <div
                  key={pol}
                  className={`rounded-xl border p-2.5 text-xs transition ${
                    isAdaptive
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : 'border-slate-200/80 bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center gap-1.5 pb-1 border-b border-slate-200/60 mb-1.5">
                    <span
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: POLICY_COLORS[pol] }}
                    />
                    <span className="font-semibold text-slate-800 truncate" title={pol}>
                      {pol}
                    </span>
                  </div>
                  <div className="space-y-0.5 font-mono text-[11px] text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400">P50:</span>
                      <span className="font-medium">{summary.p50}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">P90:</span>
                      <span className="font-medium">{summary.p90}ms</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900">
                      <span className={isAdaptive ? 'text-emerald-700' : 'text-slate-600'}>P95:</span>
                      <span className={isAdaptive ? 'text-emerald-700' : 'text-slate-800'}>{summary.p95}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">P99:</span>
                      <span className="font-medium">{summary.p99}ms</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200/50 text-[10px]">
                      <span className="text-slate-400">SLA Viol.:</span>
                      <span
                        className={`font-semibold ${
                          summary.slaViolationRatePercent > 0 ? 'text-rose-600' : 'text-emerald-600'
                        }`}
                      >
                        {summary.slaViolationRatePercent}%
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {/* Scientific Note */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200/70 bg-slate-50/80 p-3 text-[11px] text-slate-500">
        <Info size={14} className="mt-0.5 text-slate-400 flex-shrink-0" />
        <p className="leading-relaxed">
          <strong className="text-slate-700">Empirical Quantile Non-Linearity:</strong> By Jensen&apos;s Inequality, empirical percentiles (e.g. P95) evaluated across the concatenated population of pooled invocations provide the true operational distribution. Taking the arithmetic mean of individual experiment-level P95 samples underestimates tail latency in skewed serverless workloads.
        </p>
      </div>
    </div>
  )
}
