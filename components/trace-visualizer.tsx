'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Cpu,
  Filter,
  Flame,
  Info,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Search,
  Server,
  Snowflake,
  XCircle,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SimulatedRequestTrace } from '@/lib/types/scheduler'

interface TraceVisualizerProps {
  traces?: SimulatedRequestTrace[]
  slaLatencyThresholdMs?: number
}

// Built-in sample trace sequence for instant interactive demonstration
const DEMO_TRACES: SimulatedRequestTrace[] = [
  {
    requestId: 1,
    arrivalTimeMs: 0,
    latencyMs: 382.4,
    costUSD: 0.000028,
    carbonG: 0.054,
    isColdStart: true,
    meetsSLA: true,
    selectedCandidateId: 'aws-us-east-1-512',
    selectedCandidateName: 'AWS Lambda (us-east-1 · 512MB)',
    executionDurationMs: 182.4,
    coldStartDelayMs: 200.0,
    queueingDelayMs: 0,
    containerId: 'c-aws-01',
    lifecycleState: 'cold_start_scale_out',
    activeConcurrency: 1,
  },
  {
    requestId: 2,
    arrivalTimeMs: 250,
    latencyMs: 145.2,
    costUSD: 0.000021,
    carbonG: 0.048,
    isColdStart: false,
    meetsSLA: true,
    selectedCandidateId: 'aws-us-east-1-512',
    selectedCandidateName: 'AWS Lambda (us-east-1 · 512MB)',
    executionDurationMs: 145.2,
    coldStartDelayMs: 0,
    queueingDelayMs: 0,
    containerId: 'c-aws-01',
    lifecycleState: 'warm_reuse',
    activeConcurrency: 1,
  },
  {
    requestId: 3,
    arrivalTimeMs: 480,
    latencyMs: 139.8,
    costUSD: 0.000019,
    carbonG: 0.038,
    isColdStart: false,
    meetsSLA: true,
    selectedCandidateId: 'gcp-us-central1-512',
    selectedCandidateName: 'Cloud Functions (us-central1 · 512MB)',
    executionDurationMs: 139.8,
    coldStartDelayMs: 0,
    queueingDelayMs: 0,
    containerId: 'c-gcp-01',
    lifecycleState: 'warm_reuse',
    activeConcurrency: 2,
  },
  {
    requestId: 4,
    arrivalTimeMs: 950,
    latencyMs: 412.1,
    costUSD: 0.000031,
    carbonG: 0.062,
    isColdStart: true,
    meetsSLA: false,
    selectedCandidateId: 'azure-eastus-prod',
    selectedCandidateName: 'Azure Functions (eastus · Dynamic)',
    executionDurationMs: 187.1,
    coldStartDelayMs: 225.0,
    queueingDelayMs: 0,
    containerId: 'c-az-01',
    lifecycleState: 'cold_start_scale_out',
    activeConcurrency: 3,
  },
  {
    requestId: 5,
    arrivalTimeMs: 1200,
    latencyMs: 132.5,
    costUSD: 0.000018,
    carbonG: 0.032,
    isColdStart: false,
    meetsSLA: true,
    selectedCandidateId: 'gcp-us-central1-512',
    selectedCandidateName: 'Cloud Functions (us-central1 · 512MB)',
    executionDurationMs: 132.5,
    coldStartDelayMs: 0,
    queueingDelayMs: 0,
    containerId: 'c-gcp-01',
    lifecycleState: 'warm_reuse',
    activeConcurrency: 2,
  },
  {
    requestId: 6,
    arrivalTimeMs: 1650,
    latencyMs: 128.4,
    costUSD: 0.000017,
    carbonG: 0.031,
    isColdStart: false,
    meetsSLA: true,
    selectedCandidateId: 'gcp-us-central1-512',
    selectedCandidateName: 'Cloud Functions (us-central1 · 512MB)',
    executionDurationMs: 128.4,
    coldStartDelayMs: 0,
    queueingDelayMs: 0,
    containerId: 'c-gcp-01',
    lifecycleState: 'warm_reuse',
    activeConcurrency: 1,
  },
]

type FilterType = 'all' | 'cold' | 'warm' | 'queue' | 'sla_violation'

const PAGE_SIZE = 12

export function TraceVisualizer({
  traces = DEMO_TRACES,
  slaLatencyThresholdMs = 400,
}: TraceVisualizerProps) {
  const activeTraces = traces.length > 0 ? traces : DEMO_TRACES

  // State
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRequestId, setSelectedRequestId] = useState<number>(activeTraces[0]?.requestId ?? 1)
  const [page, setPage] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)

  // Filter traces
  const filteredTraces = useMemo(() => {
    return activeTraces.filter((t) => {
      // Search query filter
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.trim().toLowerCase().replace(/^#/, '')
        const idMatches = t.requestId.toString().includes(query)
        const candidateMatches = t.selectedCandidateName?.toLowerCase().includes(query) || false
        if (!idMatches && !candidateMatches) return false
      }

      // Category filter
      switch (activeFilter) {
        case 'cold':
          return Boolean(t.isColdStart || (t.coldStartDelayMs && t.coldStartDelayMs > 0))
        case 'warm':
          return !t.isColdStart && (!t.coldStartDelayMs || t.coldStartDelayMs === 0)
        case 'queue':
          return Boolean(t.queueingDelayMs && t.queueingDelayMs > 0)
        case 'sla_violation':
          return !t.meetsSLA || t.latencyMs > slaLatencyThresholdMs
        case 'all':
        default:
          return true
      }
    })
  }, [activeTraces, activeFilter, searchQuery, slaLatencyThresholdMs])

  // Pagination for the filtered list
  const totalPages = Math.max(1, Math.ceil(filteredTraces.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedTraces = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredTraces.slice(start, start + PAGE_SIZE)
  }, [filteredTraces, currentPage])

  // Selected trace
  const selectedTrace = useMemo(() => {
    const found = filteredTraces.find((t) => t.requestId === selectedRequestId)
    if (found) return found
    return filteredTraces[0] ?? activeTraces[0]
  }, [filteredTraces, selectedRequestId, activeTraces])

  // Sync selected ID when filtered list changes
  useEffect(() => {
    if (filteredTraces.length > 0 && !filteredTraces.some((t) => t.requestId === selectedRequestId)) {
      setSelectedRequestId(filteredTraces[0].requestId)
      setPage(1)
    }
  }, [filteredTraces, selectedRequestId])

  // Keep page aligned with selected item
  useEffect(() => {
    const idx = filteredTraces.findIndex((t) => t.requestId === selectedRequestId)
    if (idx !== -1) {
      const targetPage = Math.floor(idx / PAGE_SIZE) + 1
      if (targetPage !== page) {
        setPage(targetPage)
      }
    }
  }, [selectedRequestId, filteredTraces, page])

  // Autoplay playback timer
  useEffect(() => {
    if (!isPlaying || filteredTraces.length === 0) return
    const interval = setInterval(() => {
      setSelectedRequestId((prevId) => {
        const curIdx = filteredTraces.findIndex((t) => t.requestId === prevId)
        const nextIdx = (curIdx + 1) % filteredTraces.length
        return filteredTraces[nextIdx].requestId
      })
    }, 1500)
    return () => clearInterval(interval)
  }, [isPlaying, filteredTraces])

  // Filter counts
  const counts = useMemo(() => {
    let cold = 0
    let warm = 0
    let queue = 0
    let slaViolation = 0
    for (const t of activeTraces) {
      if (t.isColdStart || (t.coldStartDelayMs && t.coldStartDelayMs > 0)) cold++
      else warm++
      if (t.queueingDelayMs && t.queueingDelayMs > 0) queue++
      if (!t.meetsSLA || t.latencyMs > slaLatencyThresholdMs) slaViolation++
    }
    return { all: activeTraces.length, cold, warm, queue, slaViolation }
  }, [activeTraces, slaLatencyThresholdMs])

  const handlePrev = () => {
    if (filteredTraces.length === 0) return
    const curIdx = filteredTraces.findIndex((t) => t.requestId === selectedTrace.requestId)
    const prevIdx = curIdx > 0 ? curIdx - 1 : filteredTraces.length - 1
    setSelectedRequestId(filteredTraces[prevIdx].requestId)
  }

  const handleNext = () => {
    if (filteredTraces.length === 0) return
    const curIdx = filteredTraces.findIndex((t) => t.requestId === selectedTrace.requestId)
    const nextIdx = (curIdx + 1) % filteredTraces.length
    setSelectedRequestId(filteredTraces[nextIdx].requestId)
  }

  const handleReset = () => {
    setIsPlaying(false)
    setActiveFilter('all')
    setSearchQuery('')
    setPage(1)
    if (activeTraces[0]) {
      setSelectedRequestId(activeTraces[0].requestId)
    }
  }

  const marginMs = slaLatencyThresholdMs - (selectedTrace?.latencyMs ?? 0)
  const isSatisfied = selectedTrace ? (selectedTrace.meetsSLA && marginMs >= 0) : true

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
      {/* Header & Title */}
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <Zap size={15} />
            </span>
            <div>
              <h3 className="font-semibold text-slate-900">Request Trace Visualizer</h3>
              <p className="text-xs text-slate-500">
                Explore granular request arrivals, container transitions, queue delays, and SLA margins.
              </p>
            </div>
          </div>
        </div>

        {/* Global Playback & Reset Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handlePrev}
            disabled={filteredTraces.length <= 1}
            className="size-8 p-0 rounded-lg text-slate-700"
            title="Previous request"
          >
            <ChevronLeft size={14} />
          </Button>

          <Button
            size="sm"
            variant={isPlaying ? 'default' : 'outline'}
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={filteredTraces.length === 0}
            className="h-8 px-3 rounded-lg text-xs gap-1.5 font-medium"
          >
            {isPlaying ? (
              <>
                <Pause size={12} /> Pause
              </>
            ) : (
              <>
                <Play size={12} /> Auto Play
              </>
            )}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleNext}
            disabled={filteredTraces.length <= 1}
            className="size-8 p-0 rounded-lg text-slate-700"
            title="Next request"
          >
            <ChevronRight size={14} />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleReset}
            className="size-8 p-0 rounded-lg text-slate-400 hover:text-slate-700"
            title="Reset filters and playback"
          >
            <RotateCcw size={14} />
          </Button>
        </div>
      </div>

      {/* Filter Chips & Search Bar */}
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-medium transition ${
              activeFilter === 'all'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({counts.all})
          </button>
          <button
            onClick={() => setActiveFilter('cold')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
              activeFilter === 'cold'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            <Snowflake size={12} /> Cold ({counts.cold})
          </button>
          <button
            onClick={() => setActiveFilter('warm')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
              activeFilter === 'warm'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <Flame size={12} /> Warm ({counts.warm})
          </button>
          <button
            onClick={() => setActiveFilter('queue')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
              activeFilter === 'queue'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
            }`}
          >
            <Clock size={12} /> Queued ({counts.queue})
          </button>
          <button
            onClick={() => setActiveFilter('sla_violation')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
              activeFilter === 'sla_violation'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
            }`}
          >
            <XCircle size={12} /> SLA Violations ({counts.slaViolation})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full lg:w-56">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search request # or host..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-1 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Paged Request Selection Strip (Clean 12-item pagination) */}
      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2 px-1">
          <span className="font-medium text-slate-700">
            Showing {filteredTraces.length} of {activeTraces.length} requests
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-400">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1 rounded text-slate-600 hover:bg-slate-200 disabled:opacity-40"
              title="Previous page"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1 rounded text-slate-600 hover:bg-slate-200 disabled:opacity-40"
              title="Next page"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {pagedTraces.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-400">
            No request invocations match the selected filter.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-1.5">
            {pagedTraces.map((t) => {
              const isSelected = t.requestId === selectedTrace?.requestId
              const isCold = t.isColdStart || (t.coldStartDelayMs && t.coldStartDelayMs > 0)
              const isViolated = !t.meetsSLA || t.latencyMs > slaLatencyThresholdMs

              let badgeStyle = 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              if (isViolated) {
                badgeStyle = isSelected
                  ? 'bg-rose-600 border-rose-600 text-white font-semibold'
                  : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
              } else if (isCold) {
                badgeStyle = isSelected
                  ? 'bg-amber-600 border-amber-600 text-white font-semibold'
                  : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
              } else if (isSelected) {
                badgeStyle = 'bg-emerald-600 border-emerald-600 text-white font-semibold'
              }

              return (
                <button
                  key={t.requestId}
                  onClick={() => {
                    setSelectedRequestId(t.requestId)
                    setIsPlaying(false)
                  }}
                  className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border text-xs font-mono transition shadow-2xs ${badgeStyle} ${
                    isSelected ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
                  }`}
                  title={`Request #${t.requestId} · Latency: ${t.latencyMs.toFixed(1)}ms · ${
                    isCold ? 'Cold Start' : 'Warm Hit'
                  }`}
                >
                  <span className="text-[11px]">#{t.requestId}</span>
                  <span className="text-[9px] opacity-80">{t.latencyMs.toFixed(0)}ms</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Selected Request Detail Card */}
      {selectedTrace && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 space-y-4">
          {/* Card Top: Request Identity & SLA Status */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-slate-900">
                Request #{selectedTrace.requestId}
              </span>
              <span className="text-xs text-slate-400">
                Arrival: {(selectedTrace.arrivalTimeMs / 1000).toFixed(3)}s
              </span>
              {selectedTrace.containerId && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
                  Container: {selectedTrace.containerId}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isSatisfied ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  <CheckCircle2 size={13} /> SLA Compliant (+{marginMs.toFixed(1)}ms margin)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 border border-rose-200">
                  <XCircle size={13} /> SLA Violated ({Math.abs(marginMs).toFixed(1)}ms over limit)
                </span>
              )}

              {selectedTrace.isColdStart ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
                  <Snowflake size={13} /> Cold Start
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  <Flame size={13} /> Warm Reuse
                </span>
              )}
            </div>
          </div>

          {/* Metrics 4-Column Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
              <span className="text-slate-400 block">Total Latency</span>
              <p
                className={`mt-1 font-mono text-base font-bold ${
                  selectedTrace.latencyMs > slaLatencyThresholdMs ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {selectedTrace.latencyMs.toFixed(1)} ms
              </p>
              <span className="text-[10px] text-slate-400">Target: &le; {slaLatencyThresholdMs} ms</span>
            </div>

            <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
              <span className="text-slate-400 block">Execution vs Delays</span>
              <p className="mt-1 font-mono text-base font-bold text-slate-800">
                {(selectedTrace.executionDurationMs ?? selectedTrace.latencyMs).toFixed(1)} ms
              </p>
              <span className="text-[10px] text-slate-500">
                Cold: +{(selectedTrace.coldStartDelayMs ?? 0).toFixed(0)}ms · Queue: +{(selectedTrace.queueingDelayMs ?? 0).toFixed(0)}ms
              </span>
            </div>

            <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
              <span className="text-slate-400 block">Incurred Cost</span>
              <p className="mt-1 font-mono text-base font-bold text-slate-800">
                ${selectedTrace.costUSD.toFixed(6)}
              </p>
              <span className="text-[10px] text-slate-400">AWS / GCP / Azure Tier</span>
            </div>

            <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
              <span className="text-slate-400 block">Embodied Carbon</span>
              <p className="mt-1 font-mono text-base font-bold text-slate-800">
                {selectedTrace.carbonG.toFixed(4)} g
              </p>
              <span className="text-[10px] text-slate-400">CO₂e Grid Footprint</span>
            </div>
          </div>

          {/* Assigned Host Candidate Pill */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-emerald-50/60 p-2.5 border border-emerald-100 text-xs">
            <div className="flex items-center gap-2">
              <Server size={14} className="text-emerald-700" />
              <span className="text-slate-600">Selected Host:</span>
              <span className="font-semibold text-slate-900">{selectedTrace.selectedCandidateName}</span>
            </div>
            {selectedTrace.activeConcurrency !== undefined && (
              <span className="font-mono text-slate-600 text-[11px]">
                Concurrency at arrival: <strong>{selectedTrace.activeConcurrency}</strong> container(s)
              </span>
            )}
          </div>

          {/* Expandable Technical Details */}
          <div className="border-t border-slate-100 pt-2">
            <button
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              {showTechnicalDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showTechnicalDetails ? 'Hide Technical Scheduling Details' : 'View Technical Scheduling Details & Stage Metrics'}
            </button>

            {showTechnicalDetails && (
              <div className="mt-3 rounded-lg bg-slate-900 p-3 text-white text-xs font-mono space-y-1.5">
                <div className="flex justify-between border-b border-slate-800 pb-1 text-[11px] text-slate-400">
                  <span>PARAMETER</span>
                  <span>RECORDED TELEMETRY VALUE</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Candidate Identifier:</span>
                  <span className="text-emerald-400">{selectedTrace.selectedCandidateId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Arrival Timestamp:</span>
                  <span>{selectedTrace.arrivalTimeMs} ms</span>
                </div>
                {selectedTrace.serviceStartTimeMs !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Service Start:</span>
                    <span>{selectedTrace.serviceStartTimeMs} ms</span>
                  </div>
                )}
                {selectedTrace.serviceFinishTimeMs !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Service Finish:</span>
                    <span>{selectedTrace.serviceFinishTimeMs} ms</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Stage A Feasibility Check:</span>
                  <span className={isSatisfied ? 'text-emerald-400' : 'text-rose-400'}>
                    {isSatisfied ? 'FEASIBLE (within SLA margin)' : 'INFEASIBLE (fallback minimal shortfall)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Lifecycle State:</span>
                  <span className="text-amber-400">{selectedTrace.lifecycleState ?? (selectedTrace.isColdStart ? 'cold_start_scale_out' : 'warm_reuse')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
