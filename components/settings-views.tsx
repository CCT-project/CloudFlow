'use client'

import React, { useState, useEffect } from 'react'
import {
  Activity,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Cpu,
  Database,
  Flame,
  Globe,
  HelpCircle,
  Info,
  Layers,
  Leaf,
  Lock,
  RotateCcw,
  Scale,
  Server,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AdaptiveObjectiveWeights } from '@/lib/types/scheduler'

// ========================================================
// PHASE 3.1 & 3.2: SYSTEM SETTINGS & CLOUD PARAMETERS
// ========================================================
export function SettingsView() {
  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-600">
          Infrastructure Configuration
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          System Settings &amp; Empirical Cloud Parameters
        </h1>
        <p className="mt-2 text-sm text-slate-500 max-w-3xl leading-relaxed">
          Calibrated operational constants, cloud provider topology, pricing models, and mathematical PRNG parameters powering the discrete-event simulation engine.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Simulation Defaults */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-xl bg-teal-50 text-teal-700">
                <Zap size={16} />
              </span>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">1. Simulation Engine Defaults</h3>
                <span className="text-[11px] text-slate-400">Standard Workload Topology</span>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
              Read-Only Standard
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Default Workload Profile:</span>
              <span className="font-mono font-semibold text-slate-800">Medium (Synthetic Bursts)</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Default Request Count:</span>
              <span className="font-mono font-semibold text-slate-800">50,000 invocations</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Compound Boundary Limit:</span>
              <span className="font-mono font-semibold text-slate-800">N &times; k &le; 50,000</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Default SLA Latency Target:</span>
              <span className="font-mono font-semibold text-slate-800">400 ms</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Standard Arrival Pattern:</span>
              <span className="font-mono font-semibold text-slate-800">Poisson Process (&lambda; distribution)</span>
            </div>
          </div>
        </div>

        {/* Card 2: Cloud Provider Parameters */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <Server size={16} />
              </span>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">2. Cloud Provider Parameters</h3>
                <span className="text-[11px] text-slate-400">Multi-Region Topology</span>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
              Read-Only Baseline
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">AWS Lambda (us-east-1):</span>
              <span className="font-mono font-semibold text-slate-800">128MB · 256MB · 512MB · 1024MB</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">GCP Cloud Functions (us-central1):</span>
              <span className="font-mono font-semibold text-slate-800">256MB · 512MB</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Azure Functions (eastus):</span>
              <span className="font-mono font-semibold text-slate-800">Dynamic Consumption Tier</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Concurrent Pool Capacity:</span>
              <span className="font-mono font-semibold text-slate-800">M = 10 instances / region</span>
            </div>
          </div>
        </div>

        {/* Card 3: Pricing & Carbon Parameters */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <Scale size={16} />
              </span>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">3. Pricing &amp; Carbon Parameters</h3>
                <span className="text-[11px] text-slate-400">Standard Empirical Co-efficients</span>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
              Read-Only Coefficients
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Compute Execution Pricing:</span>
              <span className="font-mono font-semibold text-slate-800">$0.0000166667 / GB-sec</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Request Invocation Pricing:</span>
              <span className="font-mono font-semibold text-slate-800">$0.20 per 1,000,000 calls</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Marginal Grid Intensity:</span>
              <span className="font-mono font-semibold text-slate-800">415.0 g CO₂e / kWh</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Hardware Embodied Factor:</span>
              <span className="font-mono font-semibold text-slate-800">0.15 g CO₂e / invocation</span>
            </div>
          </div>
        </div>

        {/* Card 4: Cold-Start Configuration */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <Snowflake size={16} />
              </span>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">4. Cold-Start Dynamics</h3>
                <span className="text-[11px] text-slate-400">Log-Normal Latency Calibration</span>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
              Read-Only Model
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Log-Normal Location (&mu;):</span>
              <span className="font-mono font-semibold text-slate-800">200 ms (image decompression)</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Log-Normal Scale (&sigma;):</span>
              <span className="font-mono font-semibold text-slate-800">0.45 (variance &amp; cold tails)</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Container Warm Keep-Alive TTL:</span>
              <span className="font-mono font-semibold text-slate-800">10 minutes (600 seconds)</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Scale-Out Policy:</span>
              <span className="font-mono font-semibold text-slate-800">Cold spin-up when pool saturated</span>
            </div>
          </div>
        </div>

        {/* Card 5: Research & Mathematical Preferences */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4 md:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-xl bg-purple-50 text-purple-700">
                <Sparkles size={16} />
              </span>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">5. Research &amp; Mathematical Specifications</h3>
                <span className="text-[11px] text-slate-400">Scientific Reproducibility Standards</span>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
              IEEE / ACM Research Standard
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
              <span className="text-slate-500 font-medium block">PRNG Implementation</span>
              <p className="mt-1 font-mono font-bold text-slate-900">Mulberry32</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Deterministic 32-bit PRNG generating byte-for-byte reproducible stochastic workload sequences.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
              <span className="text-slate-500 font-medium block">Statistical Effect Size</span>
              <p className="mt-1 font-mono font-bold text-slate-900">Cohen&apos;s dz</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Paired standardized mean difference with asymptotic 95% confidence intervals across repeated seeds.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
              <span className="text-slate-500 font-medium block">Multi-Hypothesis Control</span>
              <p className="mt-1 font-mono font-bold text-slate-900">Holm-Bonferroni</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Step-down family-wise error rate (FWER) control at &alpha; = 0.05 against paired baselines.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ========================================================
// PHASE 3.3: USER PREFERENCES & WORKFLOW CUSTOMIZATION
// ========================================================
const WEIGHT_PRESETS: Record<string, { label: string; desc: string; weights: AdaptiveObjectiveWeights }> = {
  balanced: {
    label: 'Balanced Optimization (Default)',
    desc: 'Equally balances cost savings, carbon footprint, and latency SLA compliance.',
    weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
  },
  costAggressive: {
    label: 'Cost-Aggressive Allocation',
    desc: 'Heavily prioritizes minimum dollar cost while pruning candidates exceeding SLA.',
    weights: { alpha: 0.60, beta: 0.15, gamma: 0.15, delta: 0.10 },
  },
  greenCloud: {
    label: 'Green Cloud Awareness',
    desc: 'Routes invocations toward low-carbon grid regions and energy-efficient profiles.',
    weights: { alpha: 0.25, beta: 0.50, gamma: 0.15, delta: 0.10 },
  },
  performanceStrict: {
    label: 'Performance-Critical / Low Jitter',
    desc: 'Minimizes latency variance and heavily penalizes cold-start initialization risks.',
    weights: { alpha: 0.10, beta: 0.10, gamma: 0.50, delta: 0.30 },
  },
}

export function PreferencesView() {
  const [selectedPreset, setSelectedPreset] = useState<string>('balanced')
  const [autoSaveSimulations, setAutoSaveSimulations] = useState<boolean>(true)
  const [traceSampleSize, setTraceSampleSize] = useState<number>(250)
  const [defaultBinWidth, setDefaultBinWidth] = useState<number>(25)
  const [savedFeedback, setSavedFeedback] = useState(false)

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('cloudflow_preferences')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.preset) setSelectedPreset(parsed.preset)
        if (typeof parsed.autoSave === 'boolean') setAutoSaveSimulations(parsed.autoSave)
        if (parsed.traceSampleSize) setTraceSampleSize(parsed.traceSampleSize)
        if (parsed.binWidth) setDefaultBinWidth(parsed.binWidth)
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [])

  const handleSave = () => {
    try {
      localStorage.setItem(
        'cloudflow_preferences',
        JSON.stringify({
          preset: selectedPreset,
          autoSave: autoSaveSimulations,
          traceSampleSize,
          binWidth: defaultBinWidth,
        })
      )
    } catch {
      // Ignore
    }
    setSavedFeedback(true)
    setTimeout(() => setSavedFeedback(false), 3000)
  }

  const handleReset = () => {
    setSelectedPreset('balanced')
    setAutoSaveSimulations(true)
    setTraceSampleSize(250)
    setDefaultBinWidth(25)
    try {
      localStorage.removeItem('cloudflow_preferences')
    } catch {
      // Ignore
    }
    setSavedFeedback(true)
    setTimeout(() => setSavedFeedback(false), 3000)
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-600">
          Personal Workspace
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Research Preferences &amp; Workspace Customization
        </h1>
        <p className="mt-2 text-sm text-slate-500 max-w-2xl leading-relaxed">
          Configure default scheduler weight presets, telemetry sampling depth, and UI behavior for your account.
        </p>
      </div>

      <div className="space-y-6">
        {/* Section 1: Multi-Objective Weight Presets */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Default Objective Weight Preset</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select which multi-objective profile is pre-selected when running workload simulations.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {Object.entries(WEIGHT_PRESETS).map(([key, item]) => {
              const isSelected = selectedPreset === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedPreset(key)}
                  className={`text-left p-4 rounded-xl border transition ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-slate-900">{item.label}</span>
                    {isSelected && <CheckCircle2 size={15} className="text-emerald-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">{item.desc}</p>
                  <div className="mt-3 flex gap-2 text-[10px] font-mono text-slate-600">
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      Cost: {item.weights.alpha}
                    </span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      Carbon: {item.weights.beta}
                    </span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      Latency: {item.weights.gamma}
                    </span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      Cold: {item.weights.delta}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Section 2: Telemetry Sampling & Chart Granularity */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Telemetry Sampling &amp; Granularity</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Fine-tune chart resolutions, binning intervals, and automated workspace persistence.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            {/* Auto-save toggle */}
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <div>
                <label htmlFor="prefAutoSave" className="font-medium text-slate-900 block cursor-pointer">
                  Auto-Save Experiment Runs
                </label>
                <span className="text-[11px] text-slate-500">
                  Automatically persist simulation benchmarks to your personal account history.
                </span>
              </div>
              <input
                id="prefAutoSave"
                type="checkbox"
                checked={autoSaveSimulations}
                onChange={(e) => setAutoSaveSimulations(e.target.checked)}
                className="size-4 rounded text-emerald-600 accent-emerald-600 cursor-pointer"
              />
            </div>

            {/* Trace sample size */}
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <div>
                <span className="font-medium text-slate-900 block">Trace Visualizer Sample Size</span>
                <span className="text-[11px] text-slate-500">
                  Number of request invocations captured in granular discrete-event visualizer traces.
                </span>
              </div>
              <div className="flex gap-2">
                {[100, 250].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setTraceSampleSize(size)}
                    className={`px-3 py-1 rounded-lg font-mono text-xs font-semibold transition ${
                      traceSampleSize === size
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {size} reqs
                  </button>
                ))}
              </div>
            </div>

            {/* Default bin width */}
            <div className="flex items-center justify-between py-2">
              <div>
                <span className="font-medium text-slate-900 block">Default Latency Histogram Bin Width</span>
                <span className="text-[11px] text-slate-500">
                  Preferred empirical evaluation binning interval across latency distributions.
                </span>
              </div>
              <div className="flex gap-2">
                {[10, 25, 50].map((width) => (
                  <button
                    key={width}
                    type="button"
                    onClick={() => setDefaultBinWidth(width)}
                    className={`px-3 py-1 rounded-lg font-mono text-xs font-semibold transition ${
                      defaultBinWidth === width
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {width} ms
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs px-5 shadow-sm"
            >
              Save Preferences
            </Button>
            <Button
              onClick={handleReset}
              variant="outline"
              className="rounded-xl text-xs text-slate-600 hover:bg-slate-100"
            >
              <RotateCcw size={13} className="mr-1.5" /> Reset to Defaults
            </Button>
          </div>

          {savedFeedback && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 animate-in fade-in">
              <CheckCircle2 size={14} /> Preferences Saved
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
