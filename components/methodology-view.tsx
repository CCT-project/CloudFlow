'use client'

import React from 'react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  BrainCircuit,
  Check,
  ChevronLeft,
  Cloud,
  CloudCog,
  Cpu,
  Database,
  Gauge,
  Layers,
  Leaf,
  Lock,
  LogOut,
  Scale,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  User,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UserSession } from '@/components/auth-modal'

interface MethodologyViewProps {
  onBack: () => void
  onOpenDashboard: () => void
  onOpenResearch?: () => void
  user: UserSession | null
  onOpenAuth: (mode: 'signin' | 'register') => void
  onLogout: () => void
}

export function MethodologyView({
  onBack,
  onOpenDashboard,
  onOpenResearch,
  user,
  onOpenAuth,
  onLogout,
}: MethodologyViewProps) {
  return (
    <div className="min-h-screen bg-[#f8faf9] text-slate-950">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="group flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <ChevronLeft size={15} className="transition group-hover:-translate-x-0.5" />
              <span>Back to Home</span>
            </button>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-emerald-500 text-white shadow-sm">
                <Cloud size={14} strokeWidth={2.5} />
              </span>
              <span className="text-sm font-semibold tracking-tight text-slate-900">
                Cloud<span className="text-emerald-600">Flow</span>
                <span className="ml-1.5 text-xs font-normal text-slate-400">/ Methodology</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onOpenResearch && (
              <button
                onClick={onOpenResearch}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <BookOpen size={13} className="text-emerald-600" />
                <span>Research Paper</span>
              </button>
            )}
            {user ? (
              <div className="flex items-center gap-2 pl-2">
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 border border-emerald-200">
                  <User size={12} /> {user.name}
                </span>
                <button
                  onClick={onLogout}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition"
                  title="Sign out"
                >
                  <LogOut size={15} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => onOpenAuth('signin')}
                className="hidden text-xs font-medium text-slate-600 hover:text-slate-950 sm:block"
              >
                Sign in
              </button>
            )}
            <Button
              onClick={onOpenDashboard}
              className="rounded-xl bg-emerald-600 px-4 text-xs font-medium text-white shadow-sm hover:bg-emerald-700"
            >
              Open Dashboard <ArrowRight size={14} className="ml-1" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16 space-y-20">
        {/* Hero Section */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-700 border border-emerald-200">
            <Sparkles size={12} /> Scientific Methodology & Research Framework
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            CloudFlow Architecture & Multi-Objective Scheduling Formulation
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-600">
            A peer-reviewable framework evaluating serverless execution candidates across latency, cost,
            marginal carbon emissions, and startup risk under strict SLA feasibility constraints.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              onClick={onOpenDashboard}
              size="lg"
              className="rounded-xl bg-slate-950 px-5 text-white hover:bg-slate-800"
            >
              Launch Simulation Experiment <ArrowRight size={15} className="ml-2" />
            </Button>
            <a
              href="#architecture"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Explore Architecture
            </a>
          </div>
        </div>

        {/* Section 1: System Architecture */}
        <section id="architecture" className="scroll-mt-24 space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-600">
              System Architecture
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Five Core Architectural Subsystems
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              CloudFlow bridges real-time serverless workload dispatch with multi-cloud empirical constraints.
              Every incoming invocation passes through a five-stage pipelined pipeline before execution dispatch.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <Activity size={20} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                1. Workload Ingestion Gateway
              </h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Ingests arrival patterns modeled after empirical traces (Azure Functions dataset & ServerlessBench).
                Supports uniform, bursty, diurnal, Poisson, and spike arrival distributions with configurable payload sizes.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid size-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
                <ShieldCheck size={20} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                2. SLA Feasibility Filter
              </h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Enforces strict hard performance bounds: any execution candidate with predicted total latency
                exceeding the SLA threshold (e.g., 200 ms) is immediately pruned from candidate space before scoring.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700">
                <BrainCircuit size={20} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                3. Multi-Objective Scoring Engine
              </h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Evaluates surviving candidates using min-max normalization across latency, financial cost,
                grid marginal carbon intensity, and cold-start risk, parametrized by user objective weights.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <Server size={20} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                4. Candidate Execution Space
              </h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Maintains multi-provider candidate profiles (AWS Lambda, Google Cloud Functions, Azure Functions)
                spanning memory tiers from 128 MB to 3008 MB and container lifecycle states (warm container reuse vs. cold initializations).
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-2 lg:col-span-2">
              <div className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <Database size={20} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                5. Telemetry & Experiment Persistence
              </h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Captures granular per-request metrics (execution latency, memory cost in USD, marginal emissions in g CO₂e, cold-start flags)
                and persists aggregate records in Neon PostgreSQL via Prisma with ACID guarantees, supporting reproducible CSV and PDF export.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Mathematical Formulation */}
        <section id="mathematical-formulation" className="scroll-mt-24 space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-600">
              Formulation
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              The 5-Step Decision Loop & Multi-Objective Objective Function
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              CloudFlow models serverless scheduling as a constrained multi-criteria optimization problem over a discrete candidate set.
            </p>
          </div>

          {/* Mathematical Equation Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
              <Scale size={15} /> Objective Function
            </div>
            <div className="mt-4 rounded-xl bg-slate-900 p-6 text-white font-mono text-sm sm:text-base overflow-x-auto">
              <div className="text-emerald-400 mb-2"># Composite Score for Candidate i:</div>
              <div className="text-lg sm:text-xl font-bold tracking-wide">
                S<sub>i</sub> = &alpha; &middot; L&#770;<sub>i</sub> + &beta; &middot; C&#770;<sub>i</sub> + &gamma; &middot; E&#770;<sub>i</sub> + &delta; &middot; R&#770;<sub>i</sub>
              </div>
              <div className="mt-3 text-xs text-slate-400">
                Subject to: &alpha; + &beta; + &gamma; + &delta; = 1, &nbsp; and &nbsp; L<sub>i</sub> &le; L<sub>SLA</sub>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-sky-500" /> Normalized Latency (L&#770;)
                </div>
                <div className="mt-2 font-mono text-[11px] text-slate-600">
                  (L<sub>i</sub> - L<sub>min</sub>) / (L<sub>max</sub> - L<sub>min</sub>)
                </div>
                <p className="mt-1.5 text-slate-500">Execution + queue + cold-start latency scaled between 0 and 1.</p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500" /> Normalized Cost (C&#770;)
                </div>
                <div className="mt-2 font-mono text-[11px] text-slate-600">
                  (C<sub>i</sub> - C<sub>min</sub>) / (C<sub>max</sub> - C<sub>min</sub>)
                </div>
                <p className="mt-1.5 text-slate-500">Provider billing model based on memory allocated and run duration.</p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-cyan-500" /> Normalized Carbon (E&#770;)
                </div>
                <div className="mt-2 font-mono text-[11px] text-slate-600">
                  (E<sub>i</sub> - E<sub>min</sub>) / (E<sub>max</sub> - E<sub>min</sub>)
                </div>
                <p className="mt-1.5 text-slate-500">Regional grid marginal carbon intensity (g CO₂e / kWh).</p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-amber-500" /> Cold-Start Risk (R&#770;)
                </div>
                <div className="mt-2 font-mono text-[11px] text-slate-600">
                  R&#770;<sub>i</sub> &isin; &#123;0.0, 1.0&#125;
                </div>
                <p className="mt-1.5 text-slate-500">Binary or probabilistic penalty indicator for uninitialized runtime sandboxes.</p>
              </div>
            </div>
          </div>

          {/* 5-Step Sequence */}
          <div className="grid gap-4 md:grid-cols-5">
            {[
              {
                step: '01',
                title: 'Receive & Profile',
                desc: 'Workload request is inspected for memory requirements, payload scale, and arrival timestamp.',
              },
              {
                step: '02',
                title: 'Validate Feasibility',
                desc: 'Strict hard filtering: candidates with predicted total latency > SLA threshold are discarded.',
              },
              {
                step: '03',
                title: 'Normalize Metrics',
                desc: 'Raw latency, cost, and carbon metrics are min-max normalized across surviving candidate bounds.',
              },
              {
                step: '04',
                title: 'Score & Select',
                desc: 'Objective weights α, β, γ, δ combine terms into scalar score; candidate minimizing score is selected.',
              },
              {
                step: '05',
                title: 'Measure & Persist',
                desc: 'Execution outcome is measured, cache state updated, and metrics recorded for empirical reproducibility.',
              },
            ].map((s) => (
              <div key={s.step} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="font-mono text-xs font-bold text-emerald-600">{s.step}</span>
                <h3 className="mt-3 text-sm font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">{s.desc}</p>
              </div>
            ))}
          </div>

          {/* Detailed Feasibility & Fallback Decisions */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck size={17} className="text-emerald-700" />
              SLA Feasibility Checks & Deterministic Fallback Decisions
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 text-xs text-slate-600">
              <div className="rounded-xl bg-white p-4 border border-emerald-100">
                <strong className="text-slate-900">Strict Feasibility Filtering:</strong>
                <p className="mt-1 leading-relaxed text-slate-500">
                  Unlike heuristic penalty schedulers that trade off SLA compliance for cost savings, CloudFlow strictly enforces:
                  <code className="block mt-1 font-mono text-[11px] text-emerald-800 bg-emerald-50 p-1.5 rounded">
                    Feasible = &#123; c_i &isin; Candidates | PredictedLatency(c_i) &le; SLA_Threshold &#125;
                  </code>
                  Candidates failing this criterion are pruned from the candidate space and never considered for objective scoring.
                </p>
              </div>
              <div className="rounded-xl bg-white p-4 border border-emerald-100">
                <strong className="text-slate-900">Guaranteed Fallback Policy:</strong>
                <p className="mt-1 leading-relaxed text-slate-500">
                  When extreme workload bursts cause all available candidate tiers to exceed the configured SLA threshold (|Feasible| = 0),
                  CloudFlow deterministically invokes the emergency fallback rule:
                  <code className="block mt-1 font-mono text-[11px] text-emerald-800 bg-emerald-50 p-1.5 rounded">
                    Fallback = argmin &#123; PredictedLatency(c_i) - SLA_Threshold &#125;
                  </code>
                  This selects the candidate with the smallest latency shortfall, records the SLA violation flag, and increments telemetry violation counters.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: The Five Policies */}
        <section id="policies" className="scroll-mt-24 space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-600">
              Comparative Policies
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Five Evaluated Scheduling Algorithms
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              CloudFlow benchmarks its adaptive multi-objective scheduler against dedicated single-objective and baseline strategies.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border-2 border-emerald-500/40 bg-white p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-bl-lg">
                Adaptive
              </div>
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-[#0f766e]" />
                <h3 className="font-bold text-slate-900">CloudFlow Adaptive</h3>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">
                SLA-gated multi-objective optimization balancing latency (35%), cost (25%), carbon footprint (25%), and cold-start risk (15%).
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span>α=0.35</span>
                <span>β=0.25</span>
                <span>γ=0.25</span>
                <span>δ=0.15</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-[#0ea5e9]" />
                <h3 className="font-bold text-slate-900">Latency-First</h3>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">
                Greedy policy prioritizing minimal response time (α = 1.0). Over-provisions compute resources regardless of billing cost or carbon output.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span>α=1.00</span>
                <span>β=0.00</span>
                <span>γ=0.00</span>
                <span>δ=0.00</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-[#10b981]" />
                <h3 className="font-bold text-slate-900">Cost-First</h3>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">
                Aggressive cost minimizer (β = 1.0). Selects the cheapest possible memory configurations, accepting higher latency and potential cold-start delays.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span>α=0.00</span>
                <span>β=1.00</span>
                <span>γ=0.00</span>
                <span>δ=0.00</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-[#06b6d4]" />
                <h3 className="font-bold text-slate-900">Carbon-First</h3>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">
                Ecological optimizer (γ = 1.0). Directs workloads toward low-carbon regions and high-efficiency instances to minimize marginal emissions.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span>α=0.00</span>
                <span>β=0.00</span>
                <span>γ=1.00</span>
                <span>δ=0.00</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:col-span-2 lg:col-span-2">
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-[#94a3b8]" />
                <h3 className="font-bold text-slate-900">Default (Static / Unaware)</h3>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">
                Represents conventional static serverless deployment without multi-objective awareness, environmental telemetry, or SLA pre-filtering. Serves as the control baseline.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span>Static Dispatch</span>
                <span>No SLA filtering</span>
                <span>Unweighted baseline</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Quantitative Models */}
        <section id="models" className="scroll-mt-24 space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-600">
              Formulas & Empirical Parameters
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Underlying Quantitative Models
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              All simulation calculations are grounded in verifiable real-world cloud provider pricing and empirical datacenter emission studies.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-emerald-600">
                <BarChart3 size={16} /> Cost Model
              </div>
              <h3 className="mt-3 text-base font-semibold text-slate-900">AWS Lambda Pricing</h3>
              <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                Duration-based billing calculated per millisecond:
              </p>
              <div className="mt-3 rounded-lg bg-slate-50 p-3 font-mono text-[11px] text-slate-700">
                Cost = (Time<sub>sec</sub> &times; RAM<sub>GB</sub> &times; $0.0000166667) + $0.0000002
              </div>
              <p className="mt-3 text-[11px] text-slate-400">
                Matches tier pricing for x86 compute instances across standard AWS regions.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-emerald-600">
                <Leaf size={16} /> Carbon Model
              </div>
              <h3 className="mt-3 text-base font-semibold text-slate-900">Marginal Grid Emissions</h3>
              <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                Emissions calculated from server power draw and grid carbon factor:
              </p>
              <div className="mt-3 rounded-lg bg-slate-50 p-3 font-mono text-[11px] text-slate-700">
                CO₂e = Energy<sub>kWh</sub> &times; I<sub>grid</sub> &times; PUE
              </div>
              <p className="mt-3 text-[11px] text-slate-400">
                Default grid intensity: 415 g CO₂e/kWh; Datacenter PUE: 1.15.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-emerald-600">
                <Zap size={16} /> Cold-Start Model
              </div>
              <h3 className="mt-3 text-base font-semibold text-slate-900">Log-Normal Distribution</h3>
              <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                Container initialization latency sampled from empirical distribution:
              </p>
              <div className="mt-3 rounded-lg bg-slate-50 p-3 font-mono text-[11px] text-slate-700">
                T<sub>cold</sub> ~ LogNormal(&mu; = 200ms, &sigma; = 0.4)
              </div>
              <p className="mt-3 text-[11px] text-slate-400">
                Derived from real-world serverless benchmark telemetry across JVM/Node runtimes.
              </p>
            </div>
          </div>
        </section>

        {/* Section 5: Research Framing (Merged from Research) */}
        <section id="research-framing" className="scroll-mt-24 space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-600">
              Academic & Experimental Framing
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Research Context, Gap & Contributions
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              CloudFlow addresses documented limitations in state-of-the-art serverless systems research.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-emerald-600">
                <Target size={16} /> Research Objectives & Gap
              </div>
              <h3 className="text-base font-semibold text-slate-900">
                The Disconnect in Current Schedulers
              </h3>
              <p className="text-xs leading-6 text-slate-600">
                Modern FaaS architectures optimize either purely for latency (leading to massive carbon inefficiencies and budget waste)
                or purely for resource bin-packing (frequently violating tight SLAs and incurring catastrophic cold-start penalties).
              </p>
              <p className="text-xs leading-6 text-slate-600">
                <strong>Identified Gap:</strong> Lack of an open, SLA-first framework capable of balancing monetary cost,
                carbon emission intensity, and cold-start risk dynamically without manual heuristic tuning.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-emerald-600">
                <Sparkles size={16} /> Core Scientific Contributions
              </div>
              <ul className="space-y-2.5 text-xs text-slate-600">
                <li className="flex items-start gap-2">
                  <Check size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>SLA-Gated Feasibility Pruning:</strong> Eliminates SLA-violating candidates before multi-objective ranking.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Empirical Trace Playback:</strong> Deterministic replay with Mulberry32 PRNG for 100% reproducible experiments.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Multi-Policy Baseline Comparison:</strong> Direct side-by-side Pareto evaluation against greedy and static policies.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Open Data Persistence:</strong> ACID storage with automated standard CSV and PDF telemetry export.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Limitations and Validity */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              Experimental Limitations & Threats to Validity
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-3 text-xs text-slate-500">
              <div>
                <strong className="text-slate-700">Grid Trace Granularity:</strong> Marginal grid carbon intensity is based on hourly regional grid factors; real-time sub-minute grid fluctuations are modeled synthetically.
              </div>
              <div>
                <strong className="text-slate-700">Synthetic Network Jitter:</strong> Inter-region network transfer latency assumes normal distributions bounded by measured ping traces.
              </div>
              <div>
                <strong className="text-slate-700">Container Eviction Heuristics:</strong> Cloud provider container lifetime timers use fixed 10-minute idle windows rather than opaque proprietary provider eviction algorithms.
              </div>
            </div>
          </div>
        </section>

        {/* Bottom CTA Banner */}
        <section className="rounded-3xl bg-slate-950 p-8 sm:p-12 text-white shadow-xl">
          <div className="max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
              Ready for Verification
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Test These Formulations in the CloudFlow Simulator
            </h2>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              Launch repeatable workloads, configure custom objective weights, evaluate SLA compliance, and persist experiment data.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button
                onClick={onOpenDashboard}
                size="lg"
                className="rounded-xl bg-emerald-500 px-6 font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Launch Simulation Experiment <ArrowRight size={16} className="ml-1" />
              </Button>
              <Button
                onClick={onBack}
                size="lg"
                variant="outline"
                className="rounded-xl border-slate-700 bg-transparent text-white hover:bg-slate-800"
              >
                Return to Home
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 lg:px-10">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-lg bg-emerald-500 text-white text-[10px] font-bold">CF</span>
            <span className="font-semibold text-slate-700">CloudFlow Research</span>
          </div>
          <p>Adaptive Serverless Cloud Scheduling for Cost Efficiency, Carbon Awareness, and SLA Compliance</p>
        </div>
      </footer>
    </div>
  )
}
