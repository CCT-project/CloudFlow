'use client'

import React, { useState, useEffect } from 'react'
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Pause,
  Play,
  RotateCcw,
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
  },
]

export function TraceVisualizer({
  traces = DEMO_TRACES,
  slaLatencyThresholdMs = 400,
}: TraceVisualizerProps) {
  const activeTraces = traces.length > 0 ? traces : DEMO_TRACES
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  // Clamp index if traces length changes
  useEffect(() => {
    if (currentIndex >= activeTraces.length) {
      setCurrentIndex(0)
    }
  }, [activeTraces.length, currentIndex])

  // Playback timer
  useEffect(() => {
    if (!isPlaying) return
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeTraces.length)
    }, 1200)
    return () => clearInterval(interval)
  }, [isPlaying, activeTraces.length])

  const trace = activeTraces[currentIndex] ?? activeTraces[0]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-lg bg-emerald-500 text-white shadow-sm">
              <Zap size={14} />
            </span>
            <h3 className="font-semibold text-slate-900">Interactive Request Trace Visualizer</h3>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Step through invocation arrivals to inspect container warm/cold transitions and 2-stage adaptive decisions.
          </p>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : activeTraces.length - 1))}
            className="size-8 p-0 rounded-lg text-slate-600"
            title="Previous request"
          >
            <ChevronLeft size={14} />
          </Button>

          <Button
            size="sm"
            variant={isPlaying ? 'default' : 'outline'}
            onClick={() => setIsPlaying(!isPlaying)}
            className="h-8 px-3 rounded-lg text-xs gap-1.5"
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
            onClick={() => setCurrentIndex((prev) => (prev + 1) % activeTraces.length)}
            className="size-8 p-0 rounded-lg text-slate-600"
            title="Next request"
          >
            <ChevronRight size={14} />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCurrentIndex(0)
              setIsPlaying(false)
            }}
            className="size-8 p-0 rounded-lg text-slate-400 hover:text-slate-700"
            title="Reset to first"
          >
            <RotateCcw size={14} />
          </Button>
        </div>
      </div>

      {/* Arrival Sequence Stream Bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
          <span>Request Arrivals Stream ({activeTraces.length} sampled requests)</span>
          <span className="font-mono text-emerald-700 font-medium">
            Request #{trace.requestId} ({currentIndex + 1} of {activeTraces.length})
          </span>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-none">
          {activeTraces.map((t, idx) => {
            const isSelected = idx === currentIndex
            const isCold = t.isColdStart
            const violated = !t.meetsSLA

            let badgeBg = 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            if (violated) {
              badgeBg = isSelected ? 'bg-rose-600 text-white' : 'bg-rose-100 text-rose-700'
            } else if (isCold) {
              badgeBg = isSelected ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'
            } else if (isSelected) {
              badgeBg = 'bg-emerald-600 text-white'
            }

            return (
              <button
                key={t.requestId}
                onClick={() => {
                  setCurrentIndex(idx)
                  setIsPlaying(false)
                }}
                className={`flex-shrink-0 px-2 py-1 rounded-md text-[11px] font-mono transition font-medium ${badgeBg} ${
                  isSelected ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
                }`}
                title={`Req #${t.requestId} (${t.latencyMs}ms, ${t.isColdStart ? 'Cold' : 'Warm'})`}
              >
                #{t.requestId}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active Request Breakdown Grid */}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {/* Card 1: Arrival & Invocation Latency */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Arrival &amp; Performance
            </span>
            {trace.meetsSLA ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={11} /> SLA Satisfied
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 border border-rose-200">
                <XCircle size={11} /> SLA Violated
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-slate-400">Arrival Time</p>
              <p className="font-mono font-medium text-slate-800">
                {(trace.arrivalTimeMs / 1000).toFixed(2)}s
              </p>
            </div>
            <div>
              <p className="text-slate-400">Total Latency</p>
              <p
                className={`font-mono font-bold ${
                  trace.latencyMs > slaLatencyThresholdMs ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {trace.latencyMs.toFixed(1)} ms
              </p>
            </div>
            <div>
              <p className="text-slate-400">SLA Threshold</p>
              <p className="font-mono text-slate-600">{slaLatencyThresholdMs} ms</p>
            </div>
            <div>
              <p className="text-slate-400">Margin</p>
              <p
                className={`font-mono font-medium ${
                  slaLatencyThresholdMs - trace.latencyMs >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {(slaLatencyThresholdMs - trace.latencyMs).toFixed(1)} ms
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Container Warm/Cold State Transition */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Container State
            </span>
            {trace.isColdStart ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                <Snowflake size={11} /> Cold Start
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                <Flame size={11} /> Warm Pool Hit
              </span>
            )}
          </div>

          <div className="text-xs space-y-2">
            <div>
              <p className="text-slate-400">Instance Status</p>
              <p className="font-medium text-slate-800">
                {trace.isColdStart
                  ? 'Cold container initialized from image cache'
                  : 'Reused warm running container (TTL < 10m)'}
              </p>
            </div>
            <div className="rounded-lg bg-white p-2 border border-slate-100 flex items-center justify-between">
              <span className="text-slate-500">Selected Host:</span>
              <span className="font-medium text-slate-900 truncate max-w-[150px]">
                {trace.selectedCandidateName}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Multi-Objective Trade-Off Decision */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Two-Stage Decision
            </span>
            <span className="text-[10px] font-mono text-emerald-700 font-semibold">Stage A &amp; B</span>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Stage A (SLA Feasibility):</span>
              <span className="font-semibold text-emerald-600">Passed</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Stage B Incurred Cost:</span>
              <span className="font-mono text-slate-800">${trace.costUSD.toFixed(6)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Grid Carbon Footprint:</span>
              <span className="font-mono text-slate-800">{trace.carbonG.toFixed(4)} g CO₂e</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
