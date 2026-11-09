'use client'

import React, { useState, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Filter,
  Info,
  Layers,
  RotateCcw,
  Server,
  Zap,
} from 'lucide-react'
import type { ContainerLifecycleEvent, SimulatedRequestTrace } from '@/lib/types/scheduler'

export interface ContainerLifecycleChartProps {
  traces?: SimulatedRequestTrace[]
  lifecycleEvents?: ContainerLifecycleEvent[]
  slaThresholdMs?: number
  title?: string
}

export function ContainerLifecycleChart({
  traces = [],
  lifecycleEvents = [],
  slaThresholdMs = 250,
  title = 'Container Lifecycle & Concurrency Dynamics',
}: ContainerLifecycleChartProps) {
  // State
  const [filterState, setFilterState] = useState<'all' | 'cold' | 'warm' | 'queue' | 'sla_violation'>('all')
  const [displayLimit, setDisplayLimit] = useState<number>(30)

  // Derived metrics
  const stats = useMemo(() => {
    let coldCount = 0
    let warmCount = 0
    let queueCount = 0
    let slaViolationCount = 0
    let maxConcurrency = 0
    let totalQueueDelay = 0
    let totalColdDelay = 0

    for (const t of traces) {
      if (t.coldStartDelayMs && t.coldStartDelayMs > 0) {
        coldCount++
        totalColdDelay += t.coldStartDelayMs
      } else {
        warmCount++
      }

      if (t.queueingDelayMs && t.queueingDelayMs > 0) {
        queueCount++
        totalQueueDelay += t.queueingDelayMs
      }

      if (t.latencyMs > (slaThresholdMs || 250)) {
        slaViolationCount++
      }

      if (t.activeConcurrency && t.activeConcurrency > maxConcurrency) {
        maxConcurrency = t.activeConcurrency
      }
    }

    const expiredEvents = lifecycleEvents.filter((e) => e.eventType === 'expired')

    return {
      total: traces.length,
      coldCount,
      coldRatePercent: traces.length > 0 ? Number(((coldCount / traces.length) * 100).toFixed(1)) : 0,
      warmCount,
      warmRatePercent: traces.length > 0 ? Number(((warmCount / traces.length) * 100).toFixed(1)) : 0,
      queueCount,
      queueRatePercent: traces.length > 0 ? Number(((queueCount / traces.length) * 100).toFixed(1)) : 0,
      slaViolationCount,
      slaViolationPercent: traces.length > 0 ? Number(((slaViolationCount / traces.length) * 100).toFixed(1)) : 0,
      maxConcurrency,
      avgColdDelayMs: coldCount > 0 ? Number((totalColdDelay / coldCount).toFixed(1)) : 0,
      avgQueueDelayMs: queueCount > 0 ? Number((totalQueueDelay / traces.length).toFixed(1)) : 0,
      expiredCount: expiredEvents.length,
    }
  }, [traces, lifecycleEvents, slaThresholdMs])

  // Concurrency time-series data
  const concurrencySeries = useMemo(() => {
    if (!traces || traces.length === 0) return []

    // Sort by arrival time
    const sorted = [...traces].sort((a, b) => a.arrivalTimeMs - b.arrivalTimeMs)
    return sorted.map((t, idx) => ({
      index: idx + 1,
      timeSeconds: Number((t.arrivalTimeMs / 1000).toFixed(1)),
      concurrency: t.activeConcurrency ?? 1,
      containerId: t.containerId ?? 'inst-1',
      candidateId: t.selectedCandidateId,
      state: t.lifecycleState ?? (t.coldStartDelayMs && t.coldStartDelayMs > 0 ? 'cold_start_scale_out' : 'warm_reuse'),
    }))
  }, [traces])

  // Filtered traces for timeline inspection
  const filteredTraces = useMemo(() => {
    return traces.filter((t) => {
      if (filterState === 'cold') return (t.coldStartDelayMs ?? 0) > 0
      if (filterState === 'warm') return (t.coldStartDelayMs ?? 0) === 0 && (t.queueingDelayMs ?? 0) === 0
      if (filterState === 'queue') return (t.queueingDelayMs ?? 0) > 0
      if (filterState === 'sla_violation') return t.latencyMs > slaThresholdMs
      return true
    })
  }, [traces, filterState, slaThresholdMs])

  const hasData = traces.length > 0

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900 text-sm sm:text-base">{title}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
              Discrete-Event Trace Parity
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Container provisioning, warm instance reuse, concurrency scale-out, and idle timeouts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
            Pool Capacity: <strong>M=10 inst/region</strong>
          </span>
          <span className="text-[11px] font-mono text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
            Idle Timeout: <strong>10 mins</strong>
          </span>
        </div>
      </div>

      {!hasData ? (
        <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
          <Server size={28} className="text-slate-300 mb-2" />
          <p className="text-xs font-medium text-slate-600">No trace lifecycle data available</p>
          <p className="mt-1 text-[11px] text-slate-400">
            Run a simulation to generate discrete-event container lifecycle traces.
          </p>
        </div>
      ) : (
        <>
          {/* Key Lifecycle Metric Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
              <span className="text-[10px] font-medium text-amber-800 uppercase tracking-wider block">
                Cold Starts
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-lg font-bold font-mono text-amber-900">{stats.coldCount}</span>
                <span className="text-xs font-semibold text-amber-700">({stats.coldRatePercent}%)</span>
              </div>
              <span className="mt-1 text-[10px] text-amber-600 block">
                Avg delay: {stats.avgColdDelayMs}ms
              </span>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
              <span className="text-[10px] font-medium text-emerald-800 uppercase tracking-wider block">
                Warm Reuses
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-lg font-bold font-mono text-emerald-900">{stats.warmCount}</span>
                <span className="text-xs font-semibold text-emerald-700">({stats.warmRatePercent}%)</span>
              </div>
              <span className="mt-1 text-[10px] text-emerald-600 block">
                Zero cold-start delay
              </span>
            </div>

            <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-3">
              <span className="text-[10px] font-medium text-purple-800 uppercase tracking-wider block">
                Queue Waits
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-lg font-bold font-mono text-purple-900">{stats.queueCount}</span>
                <span className="text-xs font-semibold text-purple-700">({stats.queueRatePercent}%)</span>
              </div>
              <span className="mt-1 text-[10px] text-purple-600 block">
                Avg wait: {stats.avgQueueDelayMs}ms
              </span>
            </div>

            <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-3">
              <span className="text-[10px] font-medium text-cyan-800 uppercase tracking-wider block">
                Peak Concurrency
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-lg font-bold font-mono text-cyan-900">{stats.maxConcurrency}</span>
                <span className="text-xs text-cyan-700">instances</span>
              </div>
              <span className="mt-1 text-[10px] text-cyan-600 block">
                Max concurrent pool
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <span className="text-[10px] font-medium text-slate-600 uppercase tracking-wider block">
                Expirations
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-lg font-bold font-mono text-slate-800">{stats.expiredCount}</span>
                <span className="text-xs text-slate-500">instances</span>
              </div>
              <span className="mt-1 text-[10px] text-slate-500 block">
                Idle timeout (&gt; 10m)
              </span>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3">
              <span className="text-[10px] font-medium text-rose-800 uppercase tracking-wider block">
                SLA Violations
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-lg font-bold font-mono text-rose-900">{stats.slaViolationCount}</span>
                <span className="text-xs font-semibold text-rose-700">({stats.slaViolationPercent}%)</span>
              </div>
              <span className="mt-1 text-[10px] text-rose-600 block">
                &gt; {slaThresholdMs}ms
              </span>
            </div>
          </div>

          {/* Active Concurrency Area Chart */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <Activity size={13} className="text-teal-600" />
                Active Container Concurrency Profile
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">
                {traces.length} requests sampled
              </span>
            </div>

            <div className="h-60 w-full rounded-xl border border-slate-100 bg-slate-50/30 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={concurrencySeries}
                  margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                >
                  <defs>
                    <linearGradient id="concurrencyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0f766e" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0f766e" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="timeSeconds"
                    unit="s"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    label={{
                      value: 'Simulation Timeline (seconds)',
                      position: 'insideBottomRight',
                      offset: -5,
                      fontSize: 10,
                      fill: '#94a3b8',
                    }}
                  />
                  <YAxis
                    domain={[0, Math.max(10, stats.maxConcurrency + 2)]}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    allowDecimals={false}
                    label={{
                      value: 'Active Containers',
                      angle: -90,
                      position: 'insideLeft',
                      fontSize: 10,
                      fill: '#94a3b8',
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null
                      const d = payload[0].payload
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-md text-xs font-mono">
                          <p className="font-semibold text-slate-900 font-sans">
                            Request #{d.index} at {d.timeSeconds}s
                          </p>
                          <div className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                            <div>
                              Active Containers:{' '}
                              <strong className="text-teal-700">{d.concurrency}</strong>
                            </div>
                            <div>Candidate: {d.candidateId}</div>
                            <div>Container: {d.containerId}</div>
                            <div className="capitalize font-sans font-medium text-slate-700">
                              State: {d.state.replace(/_/g, ' ')}
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <ReferenceLine
                    y={10}
                    stroke="#94a3b8"
                    strokeDasharray="3 3"
                    label={{
                      value: 'Max Capacity Threshold (M=10)',
                      position: 'top',
                      fill: '#64748b',
                      fontSize: 9,
                    }}
                  />
                  <Area
                    type="stepAfter"
                    dataKey="concurrency"
                    stroke="#0f766e"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#concurrencyGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Trace Event Waterfall Table */}
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 pt-3">
              <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <Clock size={13} className="text-slate-500" />
                Discrete-Event Request Execution Timeline
              </h4>

              {/* Filter Pills */}
              <div className="flex flex-wrap items-center gap-1">
                {[
                  { id: 'all', label: `All (${traces.length})` },
                  { id: 'cold', label: `Cold Starts (${stats.coldCount})` },
                  { id: 'warm', label: `Warm (${stats.warmCount})` },
                  { id: 'queue', label: `Queue (${stats.queueCount})` },
                  { id: 'sla_violation', label: `SLA Fail (${stats.slaViolationCount})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilterState(f.id as any)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                      filterState === f.id
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] text-slate-600 font-sans font-semibold">
                    <th className="py-2 px-3">Req ID</th>
                    <th className="py-2 px-3">Arrival</th>
                    <th className="py-2 px-3">Selected Candidate</th>
                    <th className="py-2 px-3">Lifecycle State</th>
                    <th className="py-2 px-3">Container ID</th>
                    <th className="py-2 px-3">Cold Delay</th>
                    <th className="py-2 px-3">Queue Wait</th>
                    <th className="py-2 px-3">Exec Time</th>
                    <th className="py-2 px-3">Total Latency</th>
                    <th className="py-2 px-3">SLA Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTraces.slice(0, displayLimit).map((t, idx) => {
                    const isCold = (t.coldStartDelayMs ?? 0) > 0
                    const isQueued = (t.queueingDelayMs ?? 0) > 0
                    const isViolation = t.latencyMs > slaThresholdMs

                    let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    let label = 'Warm Reuse'
                    if (isCold) {
                      badgeColor = 'bg-amber-50 text-amber-700 border-amber-200'
                      label = 'Cold Start'
                    } else if (isQueued) {
                      badgeColor = 'bg-purple-50 text-purple-700 border-purple-200'
                      label = 'Queue Wait'
                    }

                    return (
                      <tr key={t.requestId || idx} className="hover:bg-slate-50/50">
                        <td className="py-1.5 px-3 text-slate-500">{t.requestId || `#${idx + 1}`}</td>
                        <td className="py-1.5 px-3 text-slate-700">{(t.arrivalTimeMs / 1000).toFixed(2)}s</td>
                        <td className="py-1.5 px-3 font-sans font-medium text-slate-800">{t.selectedCandidateId}</td>
                        <td className="py-1.5 px-3">
                          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-sans font-medium ${badgeColor}`}>
                            {label}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 text-slate-600 text-[11px]">{t.containerId || 'inst-1'}</td>
                        <td className="py-1.5 px-3 text-slate-600">
                          {t.coldStartDelayMs ? `${t.coldStartDelayMs}ms` : '—'}
                        </td>
                        <td className="py-1.5 px-3 text-slate-600">
                          {t.queueingDelayMs ? `${t.queueingDelayMs}ms` : '—'}
                        </td>
                        <td className="py-1.5 px-3 text-slate-600">
                          {t.executionDurationMs ? `${t.executionDurationMs}ms` : '—'}
                        </td>
                        <td className="py-1.5 px-3 font-semibold text-slate-900">{t.latencyMs}ms</td>
                        <td className="py-1.5 px-3 font-sans">
                          {isViolation ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600">
                              <AlertTriangle size={11} /> Violated
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                              <CheckCircle2 size={11} /> Met
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination / Expand row */}
            {filteredTraces.length > displayLimit && (
              <div className="flex justify-center pt-1">
                <button
                  onClick={() => setDisplayLimit((prev) => prev + 50)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  Show More Traces ({filteredTraces.length - displayLimit} remaining)
                </button>
              </div>
            )}
          </div>

          {/* Model Disclaimer */}
          <div className="flex items-start gap-2 rounded-xl border border-slate-200/70 bg-slate-50/80 p-3 text-[11px] text-slate-500">
            <Info size={14} className="mt-0.5 text-slate-400 flex-shrink-0" />
            <p className="leading-relaxed">
              <strong className="text-slate-700">Discrete-Event Simulation Fidelity:</strong> Container lifecycle states, cold-start latency delays, and queue durations are calculated via a finite-capacity discrete-event queueing model (M=10 instances per region, 10-minute idle container expiration timeout, FIFO serialization on saturation). These metrics reflect algorithmic performance under reproducible conditions rather than physical cloud provider measurements.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
