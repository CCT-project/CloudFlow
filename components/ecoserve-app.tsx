'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  BrainCircuit,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudCog,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Gauge,
  Info,
  Leaf,
  Menu,
  Play,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import {
  AdaptiveObjectiveWeights,
  ArrivalPattern,
  ExperimentRecord,
  PersistedPolicyResult,
  PolicyType,
  SimulateResponseBody,
  WorkloadType,
  DEFAULT_ADAPTIVE_WEIGHTS,
} from '@/lib/types/scheduler'
import {
  calculateAggregateMetrics,
  comparePolicies,
} from '@/lib/metrics/aggregation'
import {
  downloadExperimentCSV,
  downloadExperimentPDF,
} from '@/lib/reports/export'

const POLICY_COLORS: Record<PolicyType, string> = {
  'CloudFlow adaptive': '#0f766e',
  'Latency-first': '#0ea5e9',
  'Cost-first': '#10b981',
  'Carbon-first': '#06b6d4',
  'Default': '#94a3b8',
}

const nav = [
  { label: 'Overview', icon: Activity },
  { label: 'Workload Simulation', icon: Zap },
  { label: 'Adaptive Scheduler', icon: BrainCircuit },
  { label: 'Algorithm Comparison', icon: BarChart3 },
  { label: 'Analytics', icon: Gauge },
  { label: 'Experiment History', icon: BookOpen },
  { label: 'Settings', icon: Settings2 },
]

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`flex items-center gap-2 font-semibold tracking-tight ${dark ? 'text-white' : 'text-slate-950'}`}>
      <span className="grid size-8 place-items-center rounded-xl bg-emerald-500 text-white shadow-sm">
        <Cloud size={16} strokeWidth={2.5} />
      </span>
      <span>
        Cloud<span className="text-emerald-600">Flow</span>
      </span>
    </div>
  )
}

function Badge({
  children,
  tone = 'slate',
}: {
  children: React.ReactNode
  tone?: 'slate' | 'green' | 'blue' | 'amber' | 'rose'
}) {
  const styles = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-cyan-50 text-cyan-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${styles[tone]}`}>
      {children}
    </span>
  )
}

function Metric({
  label,
  value,
  note,
  icon: Icon,
  tone = 'green',
}: {
  label: string
  value: string
  note: string
  icon: typeof Activity
  tone?: 'green' | 'blue' | 'slate' | 'amber'
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
      <div className="flex items-start justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        <span
          className={`grid size-8 place-items-center rounded-lg ${
            tone === 'green'
              ? 'bg-emerald-50 text-emerald-700'
              : tone === 'blue'
              ? 'bg-cyan-50 text-cyan-700'
              : tone === 'amber'
              ? 'bg-amber-50 text-amber-700'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          <Icon size={15} />
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-[11px] text-slate-400">{note}</p>
    </div>
  )
}

function ProductPreview() {
  const previewTraffic = [
    { t: '00:00', v: 38 },
    { t: '04:00', v: 42 },
    { t: '08:00', v: 78 },
    { t: '12:00', v: 65 },
    { t: '16:00', v: 92 },
    { t: '20:00', v: 74 },
    { t: '24:00', v: 88 },
  ]
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/70">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-400" />
          <span className="text-xs font-medium text-slate-700">Live environment</span>
        </div>
        <Badge tone="green">Healthy</Badge>
      </div>
      <div className="grid grid-cols-[1.2fr_.8fr] gap-5 p-5">
        <div>
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-xs text-slate-400">Request volume</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                8,492 <span className="text-xs font-normal text-slate-400">req/min</span>
              </p>
            </div>
            <span className="text-xs font-medium text-emerald-600">+12.8%</span>
          </div>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={previewTraffic}>
                <defs>
                  <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eef2f4" />
                <XAxis dataKey="t" hide />
                <YAxis hide />
                <Tooltip />
                <Area type="monotone" dataKey="v" stroke="#0f766e" fill="url(#heroFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl bg-slate-950 p-4 text-white">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">SLA compliance</span>
              <ShieldCheck size={15} className="text-emerald-400" />
            </div>
            <p className="mt-3 text-2xl font-semibold">98.7%</p>
            <div className="mt-3 h-1.5 rounded-full bg-white/10">
              <div className="h-full w-[98.7%] rounded-full bg-emerald-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-slate-100 p-3">
              <p className="text-[10px] text-slate-400">Cost / 1k</p>
              <p className="mt-1 font-semibold text-slate-800">$0.084</p>
            </div>
            <div className="rounded-2xl border border-slate-100 p-3">
              <p className="text-[10px] text-slate-400">Carbon</p>
              <p className="mt-1 font-semibold text-slate-800">2.8 g</p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-cyan-500" /> Validate SLA
        </span>
        <ArrowRight size={12} />
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-500" /> Evaluate candidates
        </span>
        <ArrowRight size={12} />
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-lime-500" /> Select option
        </span>
      </div>
    </div>
  )
}

function Landing({ onExplore }: { onExplore: () => void }) {
  return (
    <div className="min-h-screen bg-[#f8faf9] text-slate-950">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm text-slate-500 md:flex">
          <a href="#product" className="transition hover:text-slate-950">
            Product
          </a>
          <a href="#features" className="transition hover:text-slate-950">
            Features
          </a>
          <a href="#methodology" className="transition hover:text-slate-950">
            Methodology
          </a>
          <a href="#research" className="transition hover:text-slate-950">
            Research
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <button className="hidden text-sm font-medium text-slate-600 sm:block">Sign in</button>
          <Button onClick={onExplore} className="rounded-xl bg-slate-950 px-4 text-sm text-white hover:bg-slate-800">
            Get started <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </header>
      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-16 px-6 pb-24 pt-16 lg:grid-cols-[.88fr_1.12fr] lg:px-10 lg:pb-32 lg:pt-24">
          <div>
            <Badge tone="green">
              <Sparkles size={12} /> ADAPTIVE SERVERLESS CLOUD SCHEDULING
            </Badge>
            <h1 className="mt-7 max-w-2xl text-5xl font-semibold leading-[1.02] tracking-[-.055em] text-slate-950 sm:text-6xl lg:text-[76px]">
              Make every cloud execution <span className="text-emerald-600">smarter.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-500">
              CloudFlow evaluates serverless scheduling decisions using latency, execution cost, estimated carbon impact,
              cold-start risk, and SLA requirements.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button onClick={onExplore} size="lg" className="rounded-xl bg-emerald-600 px-5 text-white hover:bg-emerald-700">
                Explore dashboard <ArrowRight data-icon="inline-end" />
              </Button>
              <Button size="lg" variant="outline" className="rounded-xl border-slate-200 bg-white px-5">
                Explore methodology
              </Button>
            </div>
            <div className="mt-10 flex items-center gap-6 text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <Check className="text-emerald-600" size={15} /> SLA-aware decisions
              </span>
              <span className="flex items-center gap-2">
                <Check className="text-emerald-600" size={15} /> Research-ready data
              </span>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-6 rounded-[40px] bg-emerald-100/50 blur-3xl" />
            <div className="relative">
              <ProductPreview />
            </div>
          </div>
        </section>
        <section id="methodology" className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
            <div className="mb-12 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-600">The decision loop</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                  Five steps to a better execution.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-slate-500">
                SLA feasibility comes first. Only eligible options are ranked against the scheduling objectives you configure.
              </p>
            </div>
            <div className="grid gap-0 md:grid-cols-5">
              {[
                'Receive workload',
                'Validate SLA',
                'Evaluate candidates',
                'Select execution option',
                'Measure performance',
              ].map((item, i) => (
                <div key={item} className="relative border-l border-slate-200 px-5 py-2 first:border-l-0">
                  <span className="font-mono text-xs text-emerald-600">0{i + 1}</span>
                  <h3 className="mt-5 text-sm font-semibold capitalize text-slate-900">{item}</h3>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {[
                      'Capture request shape and current workload context.',
                      'Check latency threshold and required guarantees.',
                      'Score cost, carbon, latency, and cold-start risk.',
                      'Choose the best eligible option for this request.',
                      'Collect metrics for repeatable analysis.',
                    ][i]}
                  </p>
                  {i < 4 && (
                    <ArrowRight
                      className="absolute right-[-9px] top-2 hidden bg-white text-slate-300 md:block"
                      size={16}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
        <section id="features" className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-600">Built for credible research</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight">A clearer view of every trade-off.</h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Adaptive scheduling', CloudCog, 'Evaluate execution options according to current workload conditions.'],
              ['SLA-aware decisions', ShieldCheck, 'Filter candidates by configured performance constraints first.'],
              ['Cost estimation', BarChart3, 'Model execution cost with configurable pricing assumptions.'],
              ['Carbon impact', Leaf, 'Estimate impact using documented energy assumptions.'],
              ['Cold-start awareness', Zap, 'Include startup risk in each scheduling evaluation.'],
              ['Workload simulation', Activity, 'Test policies with repeatable workload scenarios.'],
              ['Algorithm comparison', SlidersHorizontal, 'Compare adaptive decisions against clear baselines.'],
              ['Research analytics', BookOpen, 'Visualize, filter, and export experiment metrics.'],
            ].map(([title, Icon, body]) => (
              <div
                key={title as string}
                className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-950/5"
              >
                <div className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Icon size={18} />
                </div>
                <h3 className="mt-5 text-sm font-semibold">{title as string}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{body as string}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="bg-slate-950 text-white">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-6 py-16 md:flex-row md:items-center lg:px-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-400">
                CloudFlow research platform
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
                Make your next cloud experiment more explainable.
              </h2>
            </div>
            <Button onClick={onExplore} className="rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400">
              Open the dashboard <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-7xl items-center justify-between px-6 py-7 text-xs text-slate-400 lg:px-10">
        <Logo />
        <span>Smarter Scheduling. Efficient Execution. Sustainable Cloud.</span>
      </footer>
    </div>
  )
}

function simulationResultToExperiment(
  sim: SimulateResponseBody,
  weights: AdaptiveObjectiveWeights = DEFAULT_ADAPTIVE_WEIGHTS
): ExperimentRecord {
  const policies: PolicyType[] = [
    'CloudFlow adaptive',
    'Latency-first',
    'Cost-first',
    'Carbon-first',
    'Default',
  ]
  const policyResults: PersistedPolicyResult[] = policies.map((p) => {
    const s = sim.policySummaries?.[p] || sim.summary
    return {
      policy: p,
      totalRequests: s.totalRequests,
      averageLatencyMs: s.averageLatencyMs,
      p95LatencyMs: s.p95LatencyMs,
      totalCostUSD: s.totalCostUSD,
      totalCarbonG: s.totalCarbonG,
      coldStartRatePercent: s.coldStartRatePercent,
      slaViolationRatePercent: s.slaViolationRatePercent,
      averageOverheadMs: s.averageOverheadMs,
    }
  })

  return {
    id: sim.savedExperimentId || sim.simulationId || `sim-${Date.now()}`,
    name: `Simulation-${sim.workload.workloadType}-${new Date().toISOString().slice(0, 10)}`,
    createdAt: sim.timestamp || new Date().toISOString(),
    workloadType: sim.workload.workloadType,
    requestCount: sim.workload.requestCount,
    durationMinutes: sim.workload.durationMinutes,
    slaLatencyThresholdMs: sim.workload.slaLatencyThresholdMs,
    arrivalPattern: sim.workload.arrivalPattern,
    seed: 4242,
    weights,
    assumptions: sim.simulationAssumptions,
    policyResults,
  }
}

// ==========================================
// EXPERIMENT DETAILS MODAL
// ==========================================
function ExperimentDetailsModal({
  experiment,
  onClose,
}: {
  experiment: ExperimentRecord | null
  onClose: () => void
}) {
  if (!experiment) return null

  const comparisons = comparePolicies(experiment.policyResults)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone="blue">{experiment.workloadType} Workload</Badge>
              <span className="font-mono text-xs text-slate-400">{experiment.id}</span>
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{experiment.name}</h2>
            <p className="mt-1 text-xs text-slate-500">
              Created on {new Date(experiment.createdAt).toLocaleString()} · Random Seed: {experiment.seed}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Workload & Objective Configuration */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Total Requests</span>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {Number(experiment.requestCount).toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">SLA Threshold</span>
            <p className="mt-1 text-lg font-semibold text-slate-900">{experiment.slaLatencyThresholdMs} ms</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Arrival Pattern</span>
            <p className="mt-1 text-lg font-semibold text-slate-900 capitalize">{experiment.arrivalPattern}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Duration</span>
            <p className="mt-1 text-lg font-semibold text-slate-900">{experiment.durationMinutes} min</p>
          </div>
        </div>

        {/* Adaptive Weights */}
        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/40 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            CloudFlow Adaptive Weights
          </h4>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
            <div className="rounded-lg bg-white p-2.5 border border-slate-200">
              <span className="text-slate-400">Cost (α):</span>{' '}
              <b className="text-slate-800">{experiment.weights.alpha}</b>
            </div>
            <div className="rounded-lg bg-white p-2.5 border border-slate-200">
              <span className="text-slate-400">Carbon (β):</span>{' '}
              <b className="text-slate-800">{experiment.weights.beta}</b>
            </div>
            <div className="rounded-lg bg-white p-2.5 border border-slate-200">
              <span className="text-slate-400">Latency (γ):</span>{' '}
              <b className="text-slate-800">{experiment.weights.gamma}</b>
            </div>
            <div className="rounded-lg bg-white p-2.5 border border-slate-200">
              <span className="text-slate-400">Cold-start (δ):</span>{' '}
              <b className="text-slate-800">{experiment.weights.delta}</b>
            </div>
          </div>
        </div>

        {/* 5-Policy Comparative Results */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">5-Policy Fair Benchmark Results</h3>
            <span className="text-xs text-slate-400">Evaluated on identical request trace</span>
          </div>

          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Policy</th>
                  <th className="px-4 py-3 font-medium">Avg Latency</th>
                  <th className="px-4 py-3 font-medium">P95 Latency</th>
                  <th className="px-4 py-3 font-medium">Total Cost</th>
                  <th className="px-4 py-3 font-medium">Total Carbon</th>
                  <th className="px-4 py-3 font-medium">Cold Starts</th>
                  <th className="px-4 py-3 font-medium">SLA Violations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {comparisons.map((pr) => {
                  const isAdaptive = pr.policy === 'CloudFlow adaptive'

                  return (
                    <tr key={pr.policy} className={isAdaptive ? 'bg-emerald-50/40 font-medium' : ''}>
                      <td className="px-4 py-3.5 flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: POLICY_COLORS[pr.policy] || '#94a3b8' }}
                        />
                        <span className={isAdaptive ? 'text-emerald-950 font-semibold' : 'text-slate-800'}>
                          {pr.policy}
                        </span>
                        {isAdaptive && <Badge tone="green">Target</Badge>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-slate-700">{pr.averageLatencyMs} ms</span>
                        {pr.isBestLatency && (
                          <span className="ml-1.5 rounded bg-sky-100 px-1 py-0.5 text-[9px] font-semibold text-sky-800">
                            Fastest
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{pr.p95LatencyMs} ms</td>
                      <td className="px-4 py-3.5">
                        <span className="text-slate-700">${pr.totalCostUSD.toFixed(4)}</span>
                        {pr.isBestCost && (
                          <span className="ml-1.5 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-semibold text-emerald-800">
                            Lowest
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-slate-700">
                          {pr.totalCarbonG >= 1000
                            ? `${(pr.totalCarbonG / 1000).toFixed(3)} kg`
                            : `${pr.totalCarbonG.toFixed(2)} g`}
                        </span>
                        {pr.isBestCarbon && (
                          <span className="ml-1.5 rounded bg-cyan-100 px-1 py-0.5 text-[9px] font-semibold text-cyan-800">
                            Cleanest
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{pr.coldStartRatePercent}%</td>
                      <td className="px-4 py-3.5">
                        <span
                          className={
                            pr.slaViolationRatePercent > 5
                              ? 'text-rose-600 font-semibold'
                              : 'text-slate-700'
                          }
                        >
                          {pr.slaViolationRatePercent}%
                        </span>
                        {pr.isBestSla && (
                          <span className="ml-1.5 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-semibold text-emerald-800">
                            Best SLA
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

        {/* Methodology Assumptions */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">Documented Simulation Assumptions</p>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="font-medium text-slate-700">PRNG Engine:</span> {experiment.assumptions.prng}
            </div>
            <div>
              <span className="font-medium text-slate-700">Latency Model:</span> {experiment.assumptions.latencyModel}
            </div>
            <div>
              <span className="font-medium text-slate-700">Cost Model:</span> {experiment.assumptions.costModel}
            </div>
            <div>
              <span className="font-medium text-slate-700">Carbon Model:</span> {experiment.assumptions.carbonModel}
            </div>
          </div>
        </div>

        {/* Export & Actions footer */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadExperimentCSV(experiment)}
              className="rounded-xl"
            >
              <FileSpreadsheet size={15} data-icon="inline-start" className="text-emerald-700" /> Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadExperimentPDF(experiment)}
              className="rounded-xl"
            >
              <FileText size={15} data-icon="inline-start" className="text-rose-600" /> Export PDF
            </Button>
          </div>
          <Button onClick={onClose} className="rounded-xl bg-slate-900 text-white">
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

// ==========================================
// OVERVIEW TAB
// ==========================================
function Overview({
  experiments,
  error,
  onViewHistory,
  onRunSimulation,
  onSelectExperiment,
}: {
  experiments: ExperimentRecord[]
  loading: boolean
  error: string | null
  onViewHistory: () => void
  onRunSimulation: () => void
  onSelectExperiment: (exp: ExperimentRecord) => void
}) {
  const aggregate = useMemo(() => {
    return calculateAggregateMetrics(experiments, 'CloudFlow adaptive')
  }, [experiments])

  const latestExp = experiments[0] || null

  const policyComparisonData = useMemo(() => {
    if (!latestExp) {
      return [
        { name: 'Adaptive', cost: 0.084, carbon: 2.8, latency: 142, slaViol: 1.3 },
        { name: 'Latency-first', cost: 0.124, carbon: 4.2, latency: 118, slaViol: 0.4 },
        { name: 'Cost-first', cost: 0.052, carbon: 3.4, latency: 184, slaViol: 2.8 },
        { name: 'Carbon-first', cost: 0.076, carbon: 1.6, latency: 202, slaViol: 3.6 },
        { name: 'Default', cost: 0.098, carbon: 3.1, latency: 168, slaViol: 2.1 },
      ]
    }
    return latestExp.policyResults.map((pr) => ({
      name: pr.policy.replace('CloudFlow ', ''),
      cost: Number(pr.totalCostUSD.toFixed(3)),
      carbon: Number(pr.totalCarbonG.toFixed(1)),
      latency: pr.averageLatencyMs,
      slaViol: pr.slaViolationRatePercent,
    }))
  }, [latestExp])

  const trafficData = useMemo(() => {
    if (!latestExp) {
      return [
        { t: '00:00', v: 38 },
        { t: '04:00', v: 42 },
        { t: '08:00', v: 78 },
        { t: '12:00', v: 65 },
        { t: '16:00', v: 92 },
        { t: '20:00', v: 74 },
        { t: '24:00', v: 88 },
      ]
    }
    const base = Math.round(latestExp.requestCount / 100)
    return [
      { t: 'T-6', v: Math.round(base * 0.7) },
      { t: 'T-5', v: Math.round(base * 0.85) },
      { t: 'T-4', v: Math.round(base * 1.3) },
      { t: 'T-3', v: Math.round(base * 1.1) },
      { t: 'T-2', v: Math.round(base * 1.45) },
      { t: 'T-1', v: Math.round(base * 1.15) },
      { t: 'Now', v: Math.round(base * 1.25) },
    ]
  }, [latestExp])

  const slaCompliantPercent = useMemo(() => {
    if (experiments.length === 0) return 98.7
    return Number((100 - aggregate.weightedSlaViolationRatePercent).toFixed(1))
  }, [experiments, aggregate])

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-600">Overview</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Cloud Scheduling Overview</h1>
          <p className="mt-2 text-sm text-slate-500">
            Monitor workload behavior, adaptive scheduling decisions, and experimental benchmarks.
          </p>
        </div>
        <div className="flex gap-2">
          {latestExp && (
            <Button
              variant="outline"
              onClick={() => downloadExperimentPDF(latestExp)}
              className="rounded-xl bg-white shadow-sm"
            >
              <Download data-icon="inline-start" /> Export Report (PDF)
            </Button>
          )}
          <Button onClick={onRunSimulation} className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
            <Play data-icon="inline-start" /> Run Workload Simulation
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-600" />
            <span>{error}</span>
          </div>
          <span className="text-[11px] text-amber-700">Using live session benchmarks.</span>
        </div>
      )}

      {/* Aggregate Metric Cards */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Total requests"
          value={
            experiments.length > 0
              ? aggregate.totalRequestsEvaluated.toLocaleString()
              : '0'
          }
          note={
            experiments.length > 0
              ? `Across ${experiments.length} recorded benchmark runs`
              : 'Run simulation to populate metrics'
          }
          icon={Activity}
          tone="green"
        />
        <Metric
          label="Average latency"
          value={
            experiments.length > 0
              ? `${aggregate.weightedAverageLatencyMs} ms`
              : '—'
          }
          note={
            experiments.length > 0
              ? 'Request-weighted mean (CloudFlow adaptive)'
              : 'No latency measurements yet'
          }
          icon={Gauge}
          tone="slate"
        />
        <Metric
          label="P95 latency"
          value={
            experiments.length > 0
              ? `${aggregate.maxP95LatencyMs} ms`
              : '—'
          }
          note={
            experiments.length > 0
              ? 'Peak 95th percentile observed'
              : 'Configured SLA threshold: 400 ms'
          }
          icon={Zap}
          tone="slate"
        />
        <Metric
          label="Execution cost"
          value={
            experiments.length > 0
              ? `$${aggregate.totalCostUSD.toFixed(3)}`
              : '$0.00'
          }
          note="Estimated · empirical serverless pricing"
          icon={BarChart3}
          tone="slate"
        />
        <Metric
          label="Carbon impact"
          value={
            experiments.length > 0
              ? aggregate.totalCarbonG >= 1000
                ? `${(aggregate.totalCarbonG / 1000).toFixed(2)} kg CO₂e`
                : `${aggregate.totalCarbonG.toFixed(1)} g CO₂e`
              : '0.0 g'
          }
          note="Estimated · regional grid intensity model"
          icon={Leaf}
          tone="blue"
        />
        <Metric
          label="Cold-start rate"
          value={
            experiments.length > 0
              ? `${aggregate.weightedColdStartRatePercent}%`
              : '—'
          }
          note="Active container reuse optimization"
          icon={CloudCog}
          tone="slate"
        />
        <Metric
          label="SLA compliance"
          value={`${slaCompliantPercent}%`}
          note={
            experiments.length > 0
              ? `${aggregate.weightedSlaViolationRatePercent}% flagged out-of-SLA`
              : 'Target: >= 98.0%'
          }
          icon={ShieldCheck}
          tone="green"
        />
        <Metric
          label="Scheduling overhead"
          value={
            experiments.length > 0
              ? `${aggregate.weightedAverageOverheadMs} ms`
              : '—'
          }
          note="Algorithm decision latency"
          icon={BrainCircuit}
          tone="slate"
        />
      </div>

      {/* Main Charts */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Workload Traffic Trend</h2>
              <p className="mt-1 text-xs text-slate-400">
                {latestExp
                  ? `Observed profile: ${latestExp.workloadType} (${latestExp.arrivalPattern})`
                  : 'Representative request arrival profile'}
              </p>
            </div>
            <Badge tone="blue">
              {latestExp ? `${latestExp.requestCount.toLocaleString()} reqs` : 'Reference profile'}
            </Badge>
          </div>
          <div className="mt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficData}>
                <defs>
                  <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f766e" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#0f766e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eef2f4" />
                <XAxis dataKey="t" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip />
                <Area type="monotone" dataKey="v" stroke="#0f766e" fill="url(#trafficFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">SLA Compliance Distribution</h2>
          <p className="mt-1 text-xs text-slate-400">
            {latestExp ? `Target: ${latestExp.slaLatencyThresholdMs} ms` : 'Configured threshold: 400 ms'}
          </p>
          <div className="relative mx-auto mt-8 size-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { value: slaCompliantPercent },
                    { value: Number((100 - slaCompliantPercent).toFixed(1)) },
                  ]}
                  innerRadius={58}
                  outerRadius={76}
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  strokeWidth={0}
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#e2e8f0" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-3xl font-semibold text-slate-900">{slaCompliantPercent}%</p>
                <p className="text-[11px] text-slate-400">compliant</p>
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-between text-xs">
            <span className="flex items-center gap-2 text-slate-500">
              <span className="size-2 rounded-full bg-emerald-500" /> Meets SLA constraint
            </span>
            <span className="text-slate-400 font-mono">
              {aggregate.weightedSlaViolationRatePercent}% violations
            </span>
          </div>
        </div>
      </div>

      {/* Multi-Policy Comparison Bar & Distribution */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="font-semibold text-slate-900">Cost vs Carbon Across Policies</h2>
              <p className="mt-1 text-xs text-slate-400">
                {latestExp ? `Latest: ${latestExp.name}` : 'Multi-policy baseline model'}
              </p>
            </div>
            <div className="flex gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <i className="size-2 rounded-full bg-emerald-600" /> Cost ($)
              </span>
              <span className="flex items-center gap-1">
                <i className="size-2 rounded-full bg-cyan-500" /> Carbon (g)
              </span>
            </div>
          </div>
          <div className="mt-5 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={policyComparisonData} barGap={4}>
                <CartesianGrid vertical={false} stroke="#eef2f4" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip />
                <Bar dataKey="cost" fill="#0f766e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="carbon" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Average Latency by Policy (ms)</h2>
          <p className="mt-1 text-xs text-slate-400">Comparing execution response times under identical load</p>
          <div className="mt-5 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={policyComparisonData}>
                <CartesianGrid vertical={false} stroke="#eef2f4" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip />
                <Bar dataKey="latency" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Experiments Table */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="font-semibold text-slate-900">Recent Experiments</h2>
            <p className="mt-1 text-xs text-slate-400">
              {experiments.length} recorded benchmark runs in this workspace
            </p>
          </div>
          <Button variant="ghost" onClick={onViewHistory} className="text-emerald-700">
            View all <ArrowRight data-icon="inline-end" />
          </Button>
        </div>

        {experiments.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-500">No recorded experiment benchmarks found.</p>
            <p className="mt-1 text-xs text-slate-400">
              Run a workload simulation to record your first multi-policy benchmark.
            </p>
            <Button
              onClick={onRunSimulation}
              size="sm"
              className="mt-4 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Play size={14} data-icon="inline-start" /> Run First Simulation
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400">
                <tr>
                  {['Experiment ID / Name', 'Workload', 'Requests', 'SLA Target', 'Adaptive Latency', 'Adaptive Cost', 'Created', ''].map(
                    (h) => (
                      <th key={h} className="whitespace-nowrap px-5 py-3 font-medium">
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {experiments.slice(0, 5).map((exp) => {
                  const adaptiveResult = exp.policyResults.find((p) => p.policy === 'CloudFlow adaptive')
                  return (
                    <tr
                      key={exp.id}
                      onClick={() => onSelectExperiment(exp)}
                      className="border-t border-slate-100 hover:bg-slate-50/60 cursor-pointer transition"
                    >
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-800">{exp.name}</div>
                        <div className="font-mono text-[10px] text-slate-400">{exp.id.slice(0, 12)}...</div>
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone="blue">{exp.workloadType}</Badge>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{Number(exp.requestCount).toLocaleString()}</td>
                      <td className="px-5 py-4 text-slate-600">{exp.slaLatencyThresholdMs} ms</td>
                      <td className="px-5 py-4 text-slate-700 font-mono">
                        {adaptiveResult ? `${adaptiveResult.averageLatencyMs} ms` : '—'}
                      </td>
                      <td className="px-5 py-4 text-slate-700 font-mono">
                        {adaptiveResult ? `$${adaptiveResult.totalCostUSD.toFixed(4)}` : '—'}
                      </td>
                      <td className="px-5 py-4 text-slate-400 whitespace-nowrap">
                        {new Date(exp.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="text-emerald-600 hover:text-emerald-700 text-xs font-medium flex items-center justify-end gap-1">
                          Inspect <Eye size={13} />
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ==========================================
// WORKLOAD SIMULATION TAB
// ==========================================
function Simulation({
  onSimulationComplete,
  onNavigateComparison,
}: {
  onSimulationComplete: (exp: ExperimentRecord) => void
  onNavigateComparison: () => void
}) {
  const [workloadType, setWorkloadType] = useState<WorkloadType>('Medium')
  const [requestCount, setRequestCount] = useState<number>(50000)
  const [durationMinutes, setDurationMinutes] = useState<number>(30)
  const [slaLatencyThresholdMs, setSlaLatencyThresholdMs] = useState<number>(400)
  const [arrivalPattern, setArrivalPattern] = useState<ArrivalPattern>('Poisson')
  const [saveExperiment, setSaveExperiment] = useState<boolean>(true)

  // Objective weights (alpha=cost, beta=carbon, gamma=latency, delta=coldStart)
  const [alphaCost, setAlphaCost] = useState<number>(0.35)
  const [betaCarbon, setBetaCarbon] = useState<number>(0.25)
  const [gammaLatency, setGammaLatency] = useState<number>(0.25)
  const [deltaColdStart, setDeltaColdStart] = useState<number>(0.15)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latestResult, setLatestResult] = useState<SimulateResponseBody | null>(null)
  const [latestExperiment, setLatestExperiment] = useState<ExperimentRecord | null>(null)

  const handleNormalizeWeights = () => {
    const sum = alphaCost + betaCarbon + gammaLatency + deltaColdStart
    if (sum === 0) return
    setAlphaCost(Number((alphaCost / sum).toFixed(2)))
    setBetaCarbon(Number((betaCarbon / sum).toFixed(2)))
    setGammaLatency(Number((gammaLatency / sum).toFixed(2)))
    setDeltaColdStart(Number((deltaColdStart / sum).toFixed(2)))
  }

  const handleReset = () => {
    setWorkloadType('Medium')
    setRequestCount(50000)
    setDurationMinutes(30)
    setSlaLatencyThresholdMs(400)
    setArrivalPattern('Poisson')
    setAlphaCost(0.35)
    setBetaCarbon(0.25)
    setGammaLatency(0.25)
    setDeltaColdStart(0.15)
    setLatestResult(null)
    setLatestExperiment(null)
    setError(null)
  }

  const handleRunSimulation = async () => {
    setLoading(true)
    setError(null)
    const currentWeights: AdaptiveObjectiveWeights = {
      alpha: alphaCost,
      beta: betaCarbon,
      gamma: gammaLatency,
      delta: deltaColdStart,
    }

    try {
      let payload = {
        workloadType,
        requestCount,
        durationMinutes,
        slaLatencyThresholdMs,
        arrivalPattern,
        compareAllPolicies: true,
        saveExperiment,
        adaptiveWeights: currentWeights,
      }

      let res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      // If database is unavailable (503) and user tried to save, automatically fall back to transient simulation
      if (res.status === 503 && saveExperiment) {
        payload.saveExperiment = false
        res = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      const json = await res.json()
      if (res.ok && json.status === 'success') {
        const simRes = json as SimulateResponseBody
        setLatestResult(simRes)
        const exp = simulationResultToExperiment(simRes, currentWeights)
        setLatestExperiment(exp)
        onSimulationComplete(exp)
      } else {
        setError(json.error?.message || 'Simulation execution failed.')
      }
    } catch {
      setError('Network error connecting to /api/simulate.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-600">Workload Simulation</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Model a New Workload</h1>
        <p className="mt-2 text-sm text-slate-500">
          Configure a deterministic serverless scenario and benchmark all 5 scheduling policies simultaneously.
        </p>
      </div>

      {error && (
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs text-rose-900">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setError(null)} className="rounded-lg bg-white text-xs">
            Dismiss
          </Button>
        </div>
      )}

      <div className="mt-8 grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
        {/* Form Controls */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Configuration</h2>
            <Badge tone="green">Deterministic PRNG</Badge>
          </div>

          <label className="mt-6 block text-xs font-medium text-slate-600">Workload Profile</label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(['Low', 'Medium', 'High', 'Bursty', 'Cold-Start-Heavy'] as WorkloadType[]).map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setWorkloadType(x)}
                className={`rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition ${
                  workloadType === x
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {x}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">
              Number of requests
              <input
                type="number"
                min={100}
                max={500000}
                value={requestCount}
                onChange={(e) => setRequestCount(Number(e.target.value))}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 font-mono"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Duration (minutes)
              <input
                type="number"
                min={1}
                max={1440}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 font-mono"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              SLA latency threshold (ms)
              <input
                type="number"
                min={50}
                max={5000}
                value={slaLatencyThresholdMs}
                onChange={(e) => setSlaLatencyThresholdMs(Number(e.target.value))}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 font-mono"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Arrival pattern
              <select
                value={arrivalPattern}
                onChange={(e) => setArrivalPattern(e.target.value as ArrivalPattern)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
              >
                <option value="Poisson">Poisson Process</option>
                <option value="Steady">Steady / Uniform</option>
                <option value="Bursty">Bursty Traffic</option>
              </select>
            </label>
          </div>

          {/* Adaptive Objective Weights */}
          <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">CloudFlow Objective Weights</span>
              <button
                type="button"
                onClick={handleNormalizeWeights}
                className="text-[10px] text-emerald-700 hover:underline"
              >
                Normalize sum to 1.0
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div>
                <span className="text-slate-500">Cost (α): {alphaCost}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={alphaCost}
                  onChange={(e) => setAlphaCost(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 mt-1"
                />
              </div>
              <div>
                <span className="text-slate-500">Carbon (β): {betaCarbon}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={betaCarbon}
                  onChange={(e) => setBetaCarbon(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 mt-1"
                />
              </div>
              <div>
                <span className="text-slate-500">Latency (γ): {gammaLatency}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={gammaLatency}
                  onChange={(e) => setGammaLatency(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 mt-1"
                />
              </div>
              <div>
                <span className="text-slate-500">Cold-start (δ): {deltaColdStart}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={deltaColdStart}
                  onChange={(e) => setDeltaColdStart(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 mt-1"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="saveExperiment"
              checked={saveExperiment}
              onChange={(e) => setSaveExperiment(e.target.checked)}
              className="rounded text-emerald-600 accent-emerald-600"
            />
            <label htmlFor="saveExperiment" className="text-xs text-slate-600 cursor-pointer">
              Persist experiment record to database history
            </label>
          </div>

          <div className="mt-6 flex gap-2">
            <Button
              onClick={handleRunSimulation}
              disabled={loading}
              className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
            >
              <Play data-icon="inline-start" className={loading ? 'animate-spin' : ''} />
              {loading ? 'Simulating Workload...' : 'Run Simulation'}
            </Button>
            <Button onClick={handleReset} variant="outline" className="rounded-xl">
              <RotateCcw data-icon="inline-start" /> Reset
            </Button>
          </div>
        </div>

        {/* Results Panel */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">
                {latestResult ? 'Simulation Results' : 'Results Preview'}
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {latestResult
                  ? `Simulated ${latestResult.workload.requestCount.toLocaleString()} requests across 5 policies.`
                  : 'Run a simulation to populate multi-policy metrics.'}
              </p>
            </div>
            {latestExperiment && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadExperimentCSV(latestExperiment)}
                  className="rounded-xl text-xs"
                >
                  <FileSpreadsheet size={13} data-icon="inline-start" /> CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadExperimentPDF(latestExperiment)}
                  className="rounded-xl text-xs"
                >
                  <FileText size={13} data-icon="inline-start" /> PDF
                </Button>
              </div>
            )}
          </div>

          {latestResult ? (
            <div className="mt-6 space-y-6">
              {/* CloudFlow Adaptive Summary Card */}
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-950 flex items-center gap-1.5">
                    <BrainCircuit size={15} className="text-emerald-700" /> CloudFlow Adaptive Performance
                  </span>
                  <Badge tone="green">Balanced Optimization</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500">Avg Latency</span>
                    <p className="mt-1 text-lg font-bold text-slate-900 font-mono">
                      {latestResult.summary.averageLatencyMs} ms
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">P95 Latency</span>
                    <p className="mt-1 text-lg font-bold text-slate-900 font-mono">
                      {latestResult.summary.p95LatencyMs} ms
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Cost</span>
                    <p className="mt-1 text-lg font-bold text-slate-900 font-mono">
                      ${latestResult.summary.totalCostUSD.toFixed(4)}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">SLA Violations</span>
                    <p className="mt-1 text-lg font-bold text-slate-900 font-mono">
                      {latestResult.summary.slaViolationRatePercent}%
                    </p>
                  </div>
                </div>
              </div>

              {/* 5-Policy Comparison Mini-Grid */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Fair Policy Comparison
                </h4>
                <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">Policy</th>
                        <th className="px-3 py-2 font-medium">Avg Latency</th>
                        <th className="px-3 py-2 font-medium">Cost</th>
                        <th className="px-3 py-2 font-medium">Carbon</th>
                        <th className="px-3 py-2 font-medium">SLA Viol.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {latestExperiment?.policyResults.map((pr) => (
                        <tr
                          key={pr.policy}
                          className={pr.policy === 'CloudFlow adaptive' ? 'bg-emerald-50/40 font-semibold' : ''}
                        >
                          <td className="px-3 py-2 text-slate-800 font-sans">{pr.policy}</td>
                          <td className="px-3 py-2 text-slate-600">{pr.averageLatencyMs} ms</td>
                          <td className="px-3 py-2 text-slate-600">${pr.totalCostUSD.toFixed(4)}</td>
                          <td className="px-3 py-2 text-slate-600">{pr.totalCarbonG.toFixed(1)} g</td>
                          <td className="px-3 py-2 text-slate-600">{pr.slaViolationRatePercent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={onNavigateComparison}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-emerald-700"
                >
                  View in Policy Comparison <ArrowRight size={13} data-icon="inline-end" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid min-h-72 place-items-center text-center p-8">
              <div>
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <Activity size={22} />
                </div>
                <p className="mt-4 text-sm font-medium text-slate-800">No simulation results yet</p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-slate-400">
                  Configure the workload parameters and click &quot;Run Simulation&quot; to benchmark all five scheduling policies.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ==========================================
// ADAPTIVE SCHEDULER TAB
// ==========================================
function Scheduler() {
  const [slaThreshold, setSlaThreshold] = useState<number>(400)
  const [alphaCost, setAlphaCost] = useState<number>(0.35)
  const [betaCarbon, setBetaCarbon] = useState<number>(0.25)
  const [gammaLatency, setGammaLatency] = useState<number>(0.25)
  const [deltaColdStart, setDeltaColdStart] = useState<number>(0.15)

  // Interactive sample candidates
  const candidatesData = [
    {
      id: 'lambda-useast1',
      name: 'Lambda · us-east-1',
      latency: 182,
      cost: 0.000021,
      carbon: 1.8,
      coldStart: false,
    },
    {
      id: 'lambda-euwest1',
      name: 'Lambda · eu-west-1',
      latency: 244,
      cost: 0.000018,
      carbon: 1.2,
      coldStart: false,
    },
    {
      id: 'cloudrun-uscentral1',
      name: 'Cloud Run · us-central1',
      latency: 420,
      cost: 0.000014,
      carbon: 0.9,
      coldStart: true,
    },
    {
      id: 'lambda-apnortheast1',
      name: 'Lambda · ap-northeast-1',
      latency: 310,
      cost: 0.000025,
      carbon: 2.4,
      coldStart: false,
    },
  ]

  // Min-max normalization for live interactive demonstration
  const evaluatedCandidates = useMemo(() => {
    const latencies = candidatesData.map((c) => c.latency)
    const costs = candidatesData.map((c) => c.cost)
    const carbons = candidatesData.map((c) => c.carbon)

    const minLat = Math.min(...latencies)
    const maxLat = Math.max(...latencies)
    const minCost = Math.min(...costs)
    const maxCost = Math.max(...costs)
    const minCarb = Math.min(...carbons)
    const maxCarb = Math.max(...carbons)

    const evaluated = candidatesData.map((c) => {
      const meetsSLA = c.latency <= slaThreshold
      const normLat = maxLat === minLat ? 0.5 : (c.latency - minLat) / (maxLat - minLat)
      const normCost = maxCost === minCost ? 0.5 : (c.cost - minCost) / (maxCost - minCost)
      const normCarb = maxCarb === minCarb ? 0.5 : (c.carbon - minCarb) / (maxCarb - minCarb)
      const coldPenalty = c.coldStart ? 1.0 : 0.0

      const score = meetsSLA
        ? gammaLatency * normLat + alphaCost * normCost + betaCarbon * normCarb + deltaColdStart * coldPenalty
        : Infinity

      return {
        ...c,
        meetsSLA,
        score,
        normLat,
        normCost,
        normCarb,
      }
    })

    const feasible = evaluated.filter((e) => e.meetsSLA)
    const winnerId = feasible.length > 0
      ? feasible.reduce((min, curr) => (curr.score < min.score ? curr : min), feasible[0]).id
      : null

    return evaluated.map((e) => ({
      ...e,
      isSelected: e.id === winnerId,
    }))
  }, [candidatesData, slaThreshold, alphaCost, betaCarbon, gammaLatency, deltaColdStart])

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-600">Adaptive Scheduler</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Explainable Multi-Objective Scheduling</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">
        SLA feasibility strictly dominates: candidates exceeding the SLA threshold are disqualified before objective ranking.
      </p>

      {/* Decision Pipeline Flow */}
      <div className="mt-8 grid gap-3 md:grid-cols-4 lg:grid-cols-7">
        {[
          'Incoming request',
          'Validate workload & SLA',
          'Candidate options',
          'Evaluate objectives',
          'SLA feasibility check',
          'Optimal selection',
          'Metric collection',
        ].map((x, i) => (
          <div key={x} className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="font-mono text-xs text-emerald-600">0{i + 1}</span>
            <p className="mt-4 text-xs font-medium leading-5 text-slate-800">{x}</p>
            {i < 6 && (
              <ArrowRight
                className="absolute -right-3 top-1/2 hidden bg-[#f6f8f7] text-slate-300 md:block"
                size={16}
              />
            )}
          </div>
        ))}
      </div>

      {/* Interactive Controls */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">Interactive Policy Weight Playground</h3>
        <p className="mt-1 text-xs text-slate-400">
          Adjust the objective weights and SLA threshold to observe live candidate filtering and scoring.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5 text-xs">
          <div>
            <label className="text-slate-600 font-medium">SLA Threshold: {slaThreshold} ms</label>
            <input
              type="range"
              min="150"
              max="500"
              step="10"
              value={slaThreshold}
              onChange={(e) => setSlaThreshold(parseInt(e.target.value))}
              className="w-full accent-emerald-600 mt-2"
            />
          </div>
          <div>
            <label className="text-slate-600 font-medium">Cost Weight (α): {alphaCost}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={alphaCost}
              onChange={(e) => setAlphaCost(parseFloat(e.target.value))}
              className="w-full accent-emerald-600 mt-2"
            />
          </div>
          <div>
            <label className="text-slate-600 font-medium">Carbon Weight (β): {betaCarbon}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={betaCarbon}
              onChange={(e) => setBetaCarbon(parseFloat(e.target.value))}
              className="w-full accent-emerald-600 mt-2"
            />
          </div>
          <div>
            <label className="text-slate-600 font-medium">Latency Weight (γ): {gammaLatency}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={gammaLatency}
              onChange={(e) => setGammaLatency(parseFloat(e.target.value))}
              className="w-full accent-emerald-600 mt-2"
            />
          </div>
          <div>
            <label className="text-slate-600 font-medium">Cold-Start (δ): {deltaColdStart}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={deltaColdStart}
              onChange={(e) => setDeltaColdStart(parseFloat(e.target.value))}
              className="w-full accent-emerald-600 mt-2"
            />
          </div>
        </div>
      </div>

      {/* Candidate Evaluation Table */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-semibold text-slate-900">Live Candidate Evaluation</h2>
          <p className="mt-1 text-xs text-slate-400">
            Rule: Minimize O = {alphaCost}·Ĉ + {betaCarbon}·Ĝ + {gammaLatency}·L̂ + {deltaColdStart}·S subject to Latency ≤ {slaThreshold} ms.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-400">
              <tr>
                {['Candidate', 'Latency', 'Cost', 'Carbon', 'Cold-Start', 'SLA Feasibility', 'Objective Score', 'Decision'].map(
                  (h) => (
                    <th key={h} className="whitespace-nowrap px-5 py-3 font-medium">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {evaluatedCandidates.map((c) => (
                <tr
                  key={c.id}
                  className={`border-t border-slate-100 transition ${
                    c.isSelected ? 'bg-emerald-50/50 font-medium' : ''
                  }`}
                >
                  <td className="px-5 py-4 font-semibold text-slate-800">{c.name}</td>
                  <td className="px-5 py-4 text-slate-600 font-mono">{c.latency} ms</td>
                  <td className="px-5 py-4 text-slate-600 font-mono">${c.cost.toFixed(6)}</td>
                  <td className="px-5 py-4 text-slate-600 font-mono">{c.carbon} g</td>
                  <td className="px-5 py-4 text-slate-600">{c.coldStart ? 'Yes (Cold)' : 'No (Warm)'}</td>
                  <td className="px-5 py-4">
                    {c.meetsSLA ? (
                      <Badge tone="green">Feasible</Badge>
                    ) : (
                      <Badge tone="rose">Rejected: SLA Constraint</Badge>
                    )}
                  </td>
                  <td className="px-5 py-4 font-mono">
                    {c.meetsSLA ? c.score.toFixed(4) : <span className="text-slate-400">Disqualified</span>}
                  </td>
                  <td className="px-5 py-4">
                    {c.isSelected ? (
                      <Badge tone="green">
                        <Check size={12} /> Selected
                      </Badge>
                    ) : c.meetsSLA ? (
                      <Badge tone="slate">Eligible</Badge>
                    ) : (
                      <Badge tone="amber">Infeasible</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Explanation Banner */}
      <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
        <div className="flex gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
            <BrainCircuit size={17} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-emerald-950">Deterministic Selection Explanation</h3>
            <p className="mt-1 text-sm leading-6 text-emerald-900/80">
              {evaluatedCandidates.find((c) => c.isSelected)?.name || 'No feasible candidate'} is selected because
              it satisfies the strict SLA threshold of {slaThreshold} ms and achieves the minimum normalized composite objective score.
              If no candidate satisfied the SLA constraint, CloudFlow would fall back to the lowest-latency execution candidate to minimize SLA violation magnitude.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ==========================================
// ALGORITHM COMPARISON TAB
// ==========================================
function Comparison({
  experiments,
  selectedExp,
  onSelectExp,
}: {
  experiments: ExperimentRecord[]
  selectedExp: ExperimentRecord | null
  onSelectExp: (exp: ExperimentRecord) => void
}) {
  const currentExp = selectedExp || experiments[0] || null

  const comparisons = useMemo(() => {
    if (!currentExp) return []
    return comparePolicies(currentExp.policyResults)
  }, [currentExp])

  const chartData = useMemo(() => {
    if (!currentExp) return []
    return currentExp.policyResults.map((pr) => ({
      name: pr.policy.replace('CloudFlow ', ''),
      avgLatency: pr.averageLatencyMs,
      p95Latency: pr.p95LatencyMs,
      costUsd: Number(pr.totalCostUSD.toFixed(3)),
      carbonG: Number(pr.totalCarbonG.toFixed(1)),
      slaViolPercent: pr.slaViolationRatePercent,
    }))
  }, [currentExp])

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-600">Algorithm Comparison</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Compare Scheduling Policies</h1>
          <p className="mt-2 text-sm text-slate-500">
            Fair benchmark under identical workload traces across 5 distinct scheduling policies.
          </p>
        </div>
        {currentExp && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadExperimentCSV(currentExp)}
              className="rounded-xl"
            >
              <FileSpreadsheet size={14} data-icon="inline-start" className="text-emerald-700" /> Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadExperimentPDF(currentExp)}
              className="rounded-xl"
            >
              <FileText size={14} data-icon="inline-start" className="text-rose-600" /> Export PDF
            </Button>
          </div>
        )}
      </div>

      {experiments.length > 1 && (
        <div className="mt-6 flex items-center gap-3">
          <span className="text-xs font-medium text-slate-600">Select Experiment:</span>
          <select
            value={currentExp?.id || ''}
            onChange={(e) => {
              const exp = experiments.find((x) => x.id === e.target.value)
              if (exp) onSelectExp(exp)
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none"
          >
            {experiments.map((exp) => (
              <option key={exp.id} value={exp.id}>
                {exp.name} ({exp.workloadType} · {exp.requestCount.toLocaleString()} reqs)
              </option>
            ))}
          </select>
        </div>
      )}

      {!currentExp ? (
        <div className="mt-8 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <div>
            <BarChart3 size={28} className="mx-auto text-slate-400" />
            <h3 className="mt-3 text-base font-semibold text-slate-800">No Experiment Benchmark Available</h3>
            <p className="mt-1 text-xs text-slate-400">
              Run a workload simulation to compare CloudFlow adaptive against baseline policies.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Header Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">Workload: {currentExp.workloadType}</Badge>
            <Badge tone="slate">Requests: {currentExp.requestCount.toLocaleString()}</Badge>
            <Badge tone="green">SLA: {currentExp.slaLatencyThresholdMs} ms</Badge>
            <span className="ml-auto font-mono text-xs text-slate-400">{currentExp.id}</span>
          </div>

          {/* Bar Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900">Average & P95 Latency (ms)</h3>
              <p className="mt-1 text-xs text-slate-400">Lower is better · SLA feasibility constraint</p>
              <div className="mt-5 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={4}>
                    <CartesianGrid vertical={false} stroke="#eef2f4" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip />
                    <Bar dataKey="avgLatency" name="Average Latency" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="p95Latency" name="P95 Latency" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900">Cost ($) and Carbon Impact (g)</h3>
              <p className="mt-1 text-xs text-slate-400">Multi-objective trade-off comparison</p>
              <div className="mt-5 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={4}>
                    <CartesianGrid vertical={false} stroke="#eef2f4" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip />
                    <Bar dataKey="costUsd" name="Cost (USD)" fill="#0f766e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="carbonG" name="Carbon (g CO₂e)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* 5-Policy Comparative Table */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h3 className="font-semibold text-slate-900">5-Policy Fair Comparison Table</h3>
              <p className="mt-1 text-xs text-slate-400">
                All 5 policies evaluated against the exact same deterministic request sequence.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">Policy</th>
                    <th className="px-5 py-3 font-medium">Avg Latency</th>
                    <th className="px-5 py-3 font-medium">P95 Latency</th>
                    <th className="px-5 py-3 font-medium">Total Cost</th>
                    <th className="px-5 py-3 font-medium">Total Carbon</th>
                    <th className="px-5 py-3 font-medium">Cold-Start Rate</th>
                    <th className="px-5 py-3 font-medium">SLA Violation Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {comparisons.map((pr) => {
                    const isAdaptive = pr.policy === 'CloudFlow adaptive'

                    return (
                      <tr key={pr.policy} className={isAdaptive ? 'bg-emerald-50/40 font-semibold' : ''}>
                        <td className="px-5 py-4 font-sans flex items-center gap-2">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: POLICY_COLORS[pr.policy] || '#94a3b8' }}
                          />
                          <span className={isAdaptive ? 'text-emerald-950' : 'text-slate-800'}>
                            {pr.policy}
                          </span>
                          {isAdaptive && <Badge tone="green">Target</Badge>}
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-slate-700">{pr.averageLatencyMs} ms</span>
                          {pr.isBestLatency && (
                            <span className="ml-1.5 rounded bg-sky-100 px-1 py-0.5 text-[9px] font-sans font-semibold text-sky-800">
                              Fastest
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-slate-600">{pr.p95LatencyMs} ms</td>
                        <td className="px-5 py-4">
                          <span className="text-slate-700">${pr.totalCostUSD.toFixed(4)}</span>
                          {pr.isBestCost && (
                            <span className="ml-1.5 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-sans font-semibold text-emerald-800">
                              Lowest
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-slate-700">
                            {pr.totalCarbonG >= 1000
                              ? `${(pr.totalCarbonG / 1000).toFixed(2)} kg`
                              : `${pr.totalCarbonG.toFixed(1)} g`}
                          </span>
                          {pr.isBestCarbon && (
                            <span className="ml-1.5 rounded bg-cyan-100 px-1 py-0.5 text-[9px] font-sans font-semibold text-cyan-800">
                              Cleanest
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-slate-600">{pr.coldStartRatePercent}%</td>
                        <td className="px-5 py-4">
                          <span
                            className={
                              pr.slaViolationRatePercent > 5
                                ? 'text-rose-600 font-semibold'
                                : 'text-slate-700'
                            }
                          >
                            {pr.slaViolationRatePercent}%
                          </span>
                          {pr.isBestSla && (
                            <span className="ml-1.5 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-sans font-semibold text-emerald-800">
                              Best SLA
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

          {/* Trade-Off Analysis Narrative */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-xs text-slate-600 space-y-2">
            <h4 className="font-semibold text-slate-800 text-sm">Policy Trade-Off Analysis</h4>
            <p>
              • <b>CloudFlow Adaptive:</b> Achieves balanced multi-objective optimization while guaranteeing SLA feasibility. Candidates exceeding the SLA constraint ({currentExp.slaLatencyThresholdMs} ms) are strictly excluded from selection.
            </p>
            <p>
              • <b>Latency-First:</b> Minimizes latency by always picking the fastest available candidate, at the cost of higher carbon emissions and monetary expenditure.
            </p>
            <p>
              • <b>Cost-First:</b> Minimizes total execution cost, but may select slower or geographically distant functions that risk SLA violations during burst periods.
            </p>
            <p>
              • <b>Carbon-First:</b> Dispatches executions to regions and architectures with the lowest marginal grid carbon intensity, accepting slightly higher network latencies.
            </p>
            <p>
              • <b>Default Round-Robin:</b> Alternates blindly without awareness of SLA constraints, pricing differences, or environmental impact.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ==========================================
// DEDICATED ANALYTICS TAB
// ==========================================
function Analytics({ experiments }: { experiments: ExperimentRecord[] }) {
  const aggregate = useMemo(() => {
    return calculateAggregateMetrics(experiments, 'CloudFlow adaptive')
  }, [experiments])

  const workloadTrends = useMemo(() => {
    if (experiments.length < 2) return []
    return experiments
      .slice()
      .reverse()
      .map((exp, idx) => {
        const adp = exp.policyResults.find((p) => p.policy === 'CloudFlow adaptive')
        return {
          idx: idx + 1,
          name: `${exp.workloadType.slice(0, 4)}-${exp.id.slice(0, 4)}`,
          workload: exp.workloadType,
          latency: adp ? adp.averageLatencyMs : 0,
          cost: adp ? Number(adp.totalCostUSD.toFixed(3)) : 0,
          carbon: adp ? Number(adp.totalCarbonG.toFixed(1)) : 0,
          slaViol: adp ? adp.slaViolationRatePercent : 0,
        }
      })
  }, [experiments])

  return (
    <div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-600">Research Analytics</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Performance & Environmental Analytics</h1>
        <p className="mt-2 text-sm text-slate-500">
          In-depth mathematical aggregations, cross-experiment trends, and empirical cloud models.
        </p>
      </div>

      {/* Aggregate Metrics Grid */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Total requests analyzed"
          value={aggregate.totalRequestsEvaluated.toLocaleString()}
          note={`Aggregated across ${experiments.length} experiments`}
          icon={Activity}
          tone="green"
        />
        <Metric
          label="Request-weighted latency"
          value={`${aggregate.weightedAverageLatencyMs} ms`}
          note="Normalized by request volume per run"
          icon={Gauge}
          tone="slate"
        />
        <Metric
          label="Total benchmark cost"
          value={`$${aggregate.totalCostUSD.toFixed(3)}`}
          note="Summed across all evaluated runs"
          icon={BarChart3}
          tone="slate"
        />
        <Metric
          label="Total carbon footprint"
          value={
            aggregate.totalCarbonG >= 1000
              ? `${(aggregate.totalCarbonG / 1000).toFixed(2)} kg CO₂e`
              : `${aggregate.totalCarbonG.toFixed(1)} g CO₂e`
          }
          note="Model-based grid emissions"
          icon={Leaf}
          tone="blue"
        />
      </div>

      {/* Cross-Experiment Trend Charts (if >= 2 experiments exist) */}
      {workloadTrends.length >= 2 ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">Metric Evolution Across Benchmark Experiments</h3>
          <p className="mt-1 text-xs text-slate-400">
            Average Latency (ms) and Total Cost ($) trends over sequential recorded runs
          </p>
          <div className="mt-6 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={workloadTrends}>
                <CartesianGrid vertical={false} stroke="#eef2f4" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#0ea5e9' }} />
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#0f766e' }} />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="latency" name="Avg Latency (ms)" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 4 }} />
                <Line yAxisId="right" type="monotone" dataKey="cost" name="Cost ($)" stroke="#0f766e" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <Info size={24} className="mx-auto text-emerald-600" />
          <h4 className="mt-3 text-sm font-semibold text-slate-800">Multi-Run Trend Analysis</h4>
          <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
            Execute 2 or more workload simulations to unlock longitudinal comparative charts of latency, cost, and carbon metrics across different workload types.
          </p>
        </div>
      )}

      {/* Research Methodology & Assumptions Card */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">Mathematical Formulation</h3>
          <div className="mt-4 space-y-4 text-xs text-slate-600">
            <div className="rounded-xl bg-slate-50 p-3 font-mono text-[11px] text-slate-800 border border-slate-100">
              O = α · Ĉ + β · Ĝ + γ · L̂ + δ · S
            </div>
            <p>
              • <b>Min-Max Normalization:</b> Latency (L̂), Cost (Ĉ), and Carbon (Ĝ) are normalized to [0, 1] relative to candidate ranges.
            </p>
            <p>
              • <b>SLA Feasibility Filter:</b> Candidates with predicted latency exceeding the SLA threshold (L &gt; τ_sla) are disqualified before ranking.
            </p>
            <p>
              • <b>Request-Weighted Means:</b> Aggregate latency across diverse runs is calculated as ∑(R_i · L_i) / ∑(R_i) to avoid unweighted distortion.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">Model Assumptions & Disclaimers</h3>
          <div className="mt-4 space-y-3 text-xs text-slate-600">
            <p>
              • <b>Serverless Pricing Model:</b> Execution cost models AWS Lambda pricing ($0.0000166667 per GB-second) plus invocations ($0.20 per 1M).
            </p>
            <p>
              • <b>Carbon Emissions Model:</b> Estimated using 0.00000021 kWh per MB-second and regional average grid carbon intensity (415 g CO₂e/kWh).
            </p>
            <p>
              • <b>Cold-Start Latency:</b> Modeled with log-normal distribution (μ=200ms, σ=50ms) for cold container initializations.
            </p>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
              <b>Research Disclaimer:</b> All figures are computed via deterministic algorithmic simulation. Real-world cloud provider performance varies by geography, virtualization jitter, and dynamic load.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ==========================================
// EXPERIMENT HISTORY TAB
// ==========================================
function ExperimentHistory({
  onSelectExperiment,
}: {
  onSelectExperiment: (exp: ExperimentRecord) => void
}) {
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [persistence, setPersistence] = useState<{ enabled: boolean; storageType: string; verified?: boolean } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadData = async (pageNum = 1) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/experiments?page=${pageNum}&limit=10&sortBy=createdAt&order=desc`)
      const json = await res.json()
      if (res.ok && json.status === 'success') {
        setExperiments(json.data.experiments || [])
        setTotal(json.data.total || 0)
        setTotalPages(json.data.totalPages || 1)
        setPage(json.data.page || 1)
        setPersistence(json.data.persistence || null)
      } else {
        setError(json.error?.message || 'Failed to load experiments from persistence layer.')
      }
    } catch {
      setError('Unable to reach CloudFlow experiment storage API.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(page)
  }, [page])

  const handleDelete = async (id: string, name: string) => {
    if (deletingId) return
    if (!window.confirm(`Are you sure you want to delete experiment "${name}"? This action cannot be undone.`)) {
      return
    }

    setDeletingId(id)
    try {
      const res = await fetch(`/api/experiments/${id}`, { method: 'DELETE' })
      if (res.ok) {
        await loadData(page)
      } else {
        const json = await res.json()
        alert(json.error?.message || 'Failed to delete experiment.')
      }
    } catch {
      alert('Network error while deleting experiment.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-600">Storage & Metrics</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Experiment History</h1>
          <p className="mt-2 text-sm text-slate-500">
            Persisted serverless scheduling benchmarks across multi-policy workload evaluations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {persistence && (
            <Badge tone={persistence.verified ? 'green' : 'amber'}>
              {persistence.storageType}: {persistence.verified ? 'Connected' : 'Unverified / Standby'}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => loadData(page)} className="rounded-xl">
            <RefreshCw size={14} data-icon="inline-start" className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-600" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadData(page)} className="rounded-lg bg-white text-xs">
            Retry
          </Button>
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="font-semibold text-slate-900">Recorded Experiments</h2>
            <p className="mt-1 text-xs text-slate-400">
              Showing {experiments.length} of {total} total saved runs
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <RefreshCw size={18} className="animate-spin text-emerald-600" />
              Loading experiment records...
            </div>
          </div>
        ) : experiments.length === 0 ? (
          <div className="grid min-h-72 place-items-center text-center p-8">
            <div>
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                <BookOpen size={22} />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-800">No saved experiments found</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
                Simulations run with persistence enabled or API benchmark records will appear here for comparison.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400">
                <tr>
                  {['Name / ID', 'Workload', 'Requests', 'SLA', 'Policy Summaries (Cost / Carbon / SLA)', 'Created', 'Actions'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-5 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {experiments.map((exp) => (
                  <tr key={exp.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition">
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-900">{exp.name}</div>
                      <div className="font-mono text-[10px] text-slate-400">{exp.id.slice(0, 10)}...</div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone="blue">{exp.workloadType}</Badge>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {Number(exp.requestCount).toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{exp.slaLatencyThresholdMs} ms</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(exp.policyResults || []).map((pr) => (
                          <span
                            key={pr.policy}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${
                              pr.policy === 'CloudFlow adaptive'
                                ? 'bg-emerald-100 text-emerald-800 font-semibold'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {pr.policy.replace('CloudFlow ', '')}: {pr.averageLatencyMs}ms · ${pr.totalCostUSD.toFixed(3)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-400 whitespace-nowrap">
                      {new Date(exp.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onSelectExperiment(exp)}
                          className="h-8 px-2 text-slate-600 hover:text-emerald-700"
                          title="Inspect Experiment"
                        >
                          <Eye size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadExperimentCSV(exp)}
                          className="h-8 px-2 text-slate-600 hover:text-emerald-700"
                          title="Download CSV"
                        >
                          <FileSpreadsheet size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadExperimentPDF(exp)}
                          className="h-8 px-2 text-slate-600 hover:text-rose-600"
                          title="Download PDF"
                        >
                          <FileText size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deletingId === exp.id}
                          onClick={() => handleDelete(exp.id, exp.name)}
                          className="h-8 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          title="Delete Experiment"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg px-2.5 py-1 text-xs"
              >
                <ChevronLeft size={14} data-icon="inline-start" /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg px-2.5 py-1 text-xs"
              >
                Next <ChevronRight size={14} data-icon="inline-end" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SettingsView() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-600">Preferences</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">System Settings</h1>
      <p className="mt-2 text-sm text-slate-500">Configure global simulation defaults and cloud provider parameters.</p>

      <div className="mt-8 max-w-2xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Empirical Cloud Parameters</h2>
          <div className="mt-4 space-y-3 text-xs text-slate-600">
            <div>
              <span className="font-medium text-slate-700">AWS Lambda Pricing:</span> $0.0000166667 / GB-sec
            </div>
            <div>
              <span className="font-medium text-slate-700">Marginal Grid Emissions:</span> 415 g CO₂e / kWh
            </div>
            <div>
              <span className="font-medium text-slate-700">Cold-Start Log-Normal μ:</span> 200 ms
            </div>
            <div>
              <span className="font-medium text-slate-700">PRNG Implementation:</span> Mulberry32 Deterministic Seeded PRNG
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Dashboard({ onBack }: { onBack: () => void }) {
  const [active, setActive] = useState('Overview')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedExperiment, setSelectedExperiment] = useState<ExperimentRecord | null>(null)
  const [detailsModalExp, setDetailsModalExp] = useState<ExperimentRecord | null>(null)

  const fetchExperiments = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/experiments?limit=50&sortBy=createdAt&order=desc')
      const json = await res.json()
      if (res.ok && json.status === 'success') {
        const list = json.data.experiments || []
        setExperiments(list)
        if (list.length > 0 && !selectedExperiment) {
          setSelectedExperiment(list[0])
        }
      } else {
        setError(json.error?.message || 'Database unavailable. Using active session simulations.')
      }
    } catch {
      setError('Unable to reach experiment database. Running in session mode.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExperiments()
  }, [])

  const handleSimulationComplete = (newExp: ExperimentRecord) => {
    setExperiments((prev) => [newExp, ...prev])
    setSelectedExperiment(newExp)
  }

  const content = useMemo(() => {
    switch (active) {
      case 'Overview':
        return (
          <Overview
            experiments={experiments}
            loading={loading}
            error={error}
            onViewHistory={() => setActive('Experiment History')}
            onRunSimulation={() => setActive('Workload Simulation')}
            onSelectExperiment={(exp) => setDetailsModalExp(exp)}
          />
        )
      case 'Workload Simulation':
        return (
          <Simulation
            onSimulationComplete={handleSimulationComplete}
            onNavigateComparison={() => setActive('Algorithm Comparison')}
          />
        )
      case 'Adaptive Scheduler':
        return <Scheduler />
      case 'Algorithm Comparison':
        return (
          <Comparison
            experiments={experiments}
            selectedExp={selectedExperiment}
            onSelectExp={(exp) => setSelectedExperiment(exp)}
          />
        )
      case 'Analytics':
        return <Analytics experiments={experiments} />
      case 'Experiment History':
        return (
          <ExperimentHistory
            onSelectExperiment={(exp) => setDetailsModalExp(exp)}
          />
        )
      case 'Settings':
        return <SettingsView />
      default:
        return null
    }
  }, [active, experiments, loading, error, selectedExperiment])

  return (
    <div className="flex min-h-screen bg-[#f6f8f7] text-slate-950">
      <aside
        className={`fixed inset-y-0 left-0 z-20 w-64 border-r border-slate-200 bg-white p-5 transition-transform lg:relative lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between">
          <button onClick={onBack}>
            <Logo />
          </button>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden">
            <Menu size={18} />
          </button>
        </div>
        <div className="mt-10 rounded-2xl bg-slate-950 p-4 text-white">
          <p className="text-[10px] uppercase tracking-[.18em] text-emerald-400">Workspace</p>
          <p className="mt-2 text-sm font-medium">CloudFlow Research</p>
          <p className="mt-1 text-xs text-slate-400">Serverless Benchmarking</p>
        </div>
        <nav className="mt-8 flex flex-col gap-1">
          {nav.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => {
                setActive(label)
                setMobileOpen(false)
              }}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                active === label
                  ? 'bg-emerald-50 font-medium text-emerald-700 shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <div className="absolute bottom-5 left-5 right-5 border-t border-slate-100 pt-4">
          <button
            onClick={() => setActive('Settings')}
            className="flex items-center gap-3 text-sm text-slate-500 hover:text-slate-900"
          >
            <Settings2 size={16} /> Preferences
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-5 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden">
              <Menu size={20} />
            </button>
            <div className="hidden text-xs text-slate-400 sm:block">
              CloudFlow / <span className="text-slate-700 font-medium">{active}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone="green">
              <span className="size-1.5 rounded-full bg-emerald-500" /> Research Mode
            </Badge>
            <button className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
              <Bell size={16} />
            </button>
            <div className="grid size-9 place-items-center rounded-full bg-slate-950 text-xs font-medium text-white">
              CF
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] p-5 lg:p-8">{content}</main>
      </div>

      {detailsModalExp && (
        <ExperimentDetailsModal
          experiment={detailsModalExp}
          onClose={() => setDetailsModalExp(null)}
        />
      )}
    </div>
  )
}

export function EcoServeApp() {
  const [dashboard, setDashboard] = useState(false)
  return dashboard ? (
    <Dashboard onBack={() => setDashboard(false)} />
  ) : (
    <Landing onExplore={() => setDashboard(true)} />
  )
}

export const CloudFlowApp = EcoServeApp
