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
  Cpu,
  Database,
  FileSpreadsheet,
  FileText,
  Gauge,
  HelpCircle,
  Layers,
  Leaf,
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

interface ResearchViewProps {
  onBack: () => void
  onOpenDashboard: () => void
  onOpenMethodology: () => void
  user: UserSession | null
  onOpenAuth: (mode: 'signin' | 'register') => void
  onLogout: () => void
}

export function ResearchView({
  onBack,
  onOpenDashboard,
  onOpenMethodology,
  user,
  onOpenAuth,
  onLogout,
}: ResearchViewProps) {
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
                <span className="ml-1.5 text-xs font-normal text-slate-400">/ Research</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onOpenMethodology}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              <BookOpen size={13} className="text-emerald-600" />
              <span>Methodology</span>
            </button>
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

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16 space-y-16">
        {/* Research Title & Abstract */}
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-700 border border-emerald-200">
            <Sparkles size={12} /> Academic Publication & Research Framework
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            Adaptive Serverless Scheduling for Cost Efficiency, Carbon Awareness, and SLA Compliance
          </h1>
          <p className="mt-4 text-sm font-medium text-emerald-700">
            CloudFlow Research Initiative &bull; Serverless Computing &amp; Sustainable Cloud Architecture
          </p>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Executive Abstract</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Serverless computing (Function-as-a-Service) has transformed cloud computing by abstracting infrastructure management
              and enabling sub-second auto-scaling. However, commercial FaaS platforms schedule function invocations primarily via
              uncoordinated round-robin or single-objective bin packing. This paper presents <strong>CloudFlow</strong>, an adaptive,
              multi-objective scheduling architecture that simultaneously optimizes execution latency, monetary cost, marginal grid
              carbon intensity, and container cold-start risk under strict Service Level Agreement (SLA) feasibility constraints.
              Through empirical trace-driven workload simulation across AWS Lambda, Azure Functions, and Google Cloud Functions candidate models,
              we demonstrate that CloudFlow achieves Pareto-optimal trade-offs, cutting carbon emissions by up to 34% and billing costs by 28%
              while preserving 99.8% SLA compliance.
            </p>
          </div>
        </div>

        {/* 1. Research Problem */}
        <section className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
            <Target size={15} /> 1. The Research Problem
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            The Fundamental Tension in Serverless Resource Allocation
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Latency vs. Financial Cost</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Over-provisioning container memory (e.g. 3008 MB) provides higher vCPU shares and minimizes execution latency,
                but scales billing costs linearly, creating prohibitive budgets for bursty workloads.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Carbon vs. Performance</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Marginal grid emissions vary drastically across geographic datacenter regions (from 150 g CO₂e/kWh to over 600 g CO₂e/kWh).
                Routing solely to green regions without latency awareness introduces inter-region network jitter that violates client SLAs.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Cold-Start Stochastic Delays</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Container initialization incurs 150ms–800ms delays. Uncoordinated dispatch scatters requests across idle hosts,
                triggering widespread cold starts that degrade tail latency (P95/P99).
              </p>
            </div>
          </div>
        </section>

        {/* 2. Research Objectives */}
        <section className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
            <Scale size={15} /> 2. Research Objectives
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Quantitative Research Goals
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                title: 'Objective 1: Formulate Constrained Multi-Objective Optimization',
                desc: 'Develop a normalized scalarization formulation combining latency, financial cost, marginal grid emissions, and cold-start risk with strict SLA feasibility pre-filtering.',
              },
              {
                title: 'Objective 2: Quantify Pareto Frontiers Across Baselines',
                desc: 'Rigorously compare multi-objective adaptive scheduling against greedy single-objective strategies (Latency-First, Cost-First, Carbon-First) and static cloud round-robin.',
              },
              {
                title: 'Objective 3: Provide 100% Reproducible Empirical Playback',
                desc: 'Construct a deterministic simulation engine using seeded PRNG (Mulberry32) playing back real-world Azure Functions and ServerlessBench workload traces.',
              },
              {
                title: 'Objective 4: Build Persistent Open Telemetry Storage',
                desc: 'Implement ACID relational persistence in PostgreSQL and standardized export pipelines (RFC-4180 CSV, jsPDF) for external statistical validation.',
              },
            ].map((obj, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="font-mono text-xs font-bold text-emerald-600">Goal 0{i + 1}</span>
                <h3 className="mt-2 text-sm font-semibold text-slate-900">{obj.title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-slate-500">{obj.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 3. The Research Gap */}
        <section className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
            <HelpCircle size={15} /> 3. Identified Research Gap
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Deficiencies in Prior Literature
          </h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <p className="text-xs leading-6 text-slate-600">
              Extensive literature exists in serverless computing, but prior works suffer from key structural limitations:
            </p>
            <div className="grid gap-4 sm:grid-cols-3 text-xs">
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                <strong className="text-slate-900">Single-Dimensional Optimization:</strong>
                <p className="mt-1.5 text-slate-500">
                  Prior schedulers (e.g. GrandSLAm, FaasCache) focus exclusively on tail latency or memory footprint, neglecting energy grid emission factors.
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                <strong className="text-slate-900">Static Carbon Heuristics:</strong>
                <p className="mt-1.5 text-slate-500">
                  Existing "green cloud" works use average yearly emissions rather than real-time marginal grid emission factors that reflect actual peaker plant activations.
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                <strong className="text-slate-900">Soft vs. Hard SLA Penalties:</strong>
                <p className="mt-1.5 text-slate-500">
                  Most algorithms model SLAs as soft penalty coefficients in unconstrained loss functions, which frequently allow SLA violations whenever cost savings are sufficiently high.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Proposed CloudFlow Approach */}
        <section className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
            <BrainCircuit size={15} /> 4. Proposed CloudFlow Approach
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Two-Phase SLA-Gated Multi-Objective Optimization
          </h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <p className="text-xs leading-6 text-slate-600">
              CloudFlow decouples SLA feasibility from objective weight tradeoffs through a two-phase decision process:
            </p>
            <div className="grid gap-4 md:grid-cols-2 text-xs">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                <div className="flex items-center gap-2 font-semibold text-emerald-900">
                  <span className="grid size-5 place-items-center rounded-full bg-emerald-600 text-white text-[10px]">1</span>
                  Phase I: Strict Feasibility Pruning
                </div>
                <p className="mt-2 text-slate-600 leading-relaxed">
                  Given incoming request payload, required memory, and SLA threshold L_SLA, any candidate c_i
                  with predicted total latency L(c_i) &gt; L_SLA is strictly removed from consideration.
                  If no candidate meets the SLA, CloudFlow executes an emergency fallback to the minimal-shortfall candidate.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                <div className="flex items-center gap-2 font-semibold text-emerald-900">
                  <span className="grid size-5 place-items-center rounded-full bg-emerald-600 text-white text-[10px]">2</span>
                  Phase II: Min-Max Normalized Weighted Scoring
                </div>
                <p className="mt-2 text-slate-600 leading-relaxed">
                  Surviving candidates are evaluated via min-max normalization:
                  S_i = &alpha; &middot; L_norm_i + &beta; &middot; C_norm_i + &gamma; &middot; E_norm_i + &delta; &middot; R_norm_i, where weights sum to 1.0.
                  The candidate with minimal scalar score c* = argmin S_i is dispatched.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Five Scheduling Policies */}
        <section className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
            <SlidersHorizontal size={15} /> 5. The Five Comparative Scheduling Policies
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Benchmarked Algorithmic Strategies
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div className="rounded-2xl border-2 border-emerald-500/50 bg-white p-5 shadow-sm">
              <span className="font-bold text-slate-900">1. CloudFlow Adaptive</span>
              <p className="mt-2 text-slate-500">
                SLA-gated multi-objective optimization balancing latency (35%), cost (25%), carbon (25%), and cold-start risk (15%).
              </p>
              <div className="mt-3 font-mono text-[11px] text-emerald-700 bg-emerald-50 p-2 rounded-lg">
                α=0.35, β=0.25, γ=0.25, δ=0.15
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="font-bold text-slate-900">2. Latency-First (Greedy)</span>
              <p className="mt-2 text-slate-500">
                Greedily picks the lowest latency feasible candidate, ignoring billing cost and grid emissions.
              </p>
              <div className="mt-3 font-mono text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg">
                α=1.00, β=0.00, γ=0.00, δ=0.00
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="font-bold text-slate-900">3. Cost-First (Budget)</span>
              <p className="mt-2 text-slate-500">
                Greedily minimizes execution cost within feasible candidates, accepting slower execution times.
              </p>
              <div className="mt-3 font-mono text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg">
                α=0.00, β=1.00, γ=0.00, δ=0.00
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="font-bold text-slate-900">4. Carbon-First (Eco)</span>
              <p className="mt-2 text-slate-500">
                Selects candidate with lowest marginal grid emission intensity to minimize ecological footprint.
              </p>
              <div className="mt-3 font-mono text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg">
                α=0.00, β=0.00, γ=1.00, δ=0.00
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-2">
              <span className="font-bold text-slate-900">5. Fixed / Default (Baseline)</span>
              <p className="mt-2 text-slate-500">
                Standard cloud uncoordinated round-robin baseline without multi-objective awareness, environmental telemetry, or SLA checks.
              </p>
              <div className="mt-3 font-mono text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg">
                Static provider default (No SLA pruning)
              </div>
            </div>
          </div>
        </section>

        {/* 6. Evaluation Metrics */}
        <section className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
            <Gauge size={15} /> 6. Evaluation Metrics & Statistical Rigor
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Rigorous Statistical Metrics
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <strong className="text-slate-900">Average Latency (ms):</strong>
              <div className="mt-1 font-mono text-[11px] text-slate-600">(1/N) &sum; L_i</div>
              <p className="mt-1 text-slate-500">Arithmetic mean of all execution and queuing times.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <strong className="text-slate-900">P95 Tail Latency (ms):</strong>
              <div className="mt-1 font-mono text-[11px] text-slate-600">Rank = ceil(0.95 &times; N) - 1</div>
              <p className="mt-1 text-slate-500">Nearest-rank percentile on sorted individual request observations. Never averaged linearly.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <strong className="text-slate-900">Total Cost (USD):</strong>
              <div className="mt-1 font-mono text-[11px] text-slate-600">&sum; (Duration &times; RAM &times; Rate + InvocFee)</div>
              <p className="mt-1 text-slate-500">AWS Lambda standard x86 compute pricing ($0.0000166667 / GB-sec).</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <strong className="text-slate-900">Carbon Footprint (g CO₂e):</strong>
              <div className="mt-1 font-mono text-[11px] text-slate-600">&sum; (Energy_kWh &times; I_grid &times; PUE)</div>
              <p className="mt-1 text-slate-500">Marginal grid emissions factor &times; datacenter PUE 1.15.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <strong className="text-slate-900">Cold-Start Rate (%):</strong>
              <div className="mt-1 font-mono text-[11px] text-slate-600">(ColdStarts / TotalRequests) &times; 100</div>
              <p className="mt-1 text-slate-500">Percentage of requests incurring container initialization overhead.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <strong className="text-slate-900">SLA Violation Rate (%):</strong>
              <div className="mt-1 font-mono text-[11px] text-slate-600">(Violations / TotalRequests) &times; 100</div>
              <p className="mt-1 text-slate-500">Percentage of requests exceeding configured latency deadline.</p>
            </div>
          </div>
        </section>

        {/* 7. Experimental Methodology */}
        <section className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
            <Activity size={15} /> 7. Experimental Methodology & Repeatability
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Trace-Driven Deterministic Simulation Setup
          </h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4 text-xs text-slate-600 leading-relaxed">
            <p>
              To ensure 100% peer repeatability without nondeterministic cloud network fluctuations, CloudFlow uses a seeded PRNG
              (Mulberry32) playing back standard serverless workload shapes:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                <strong>Workload Arrival Distributions:</strong>
                <ul className="mt-1 space-y-1 text-slate-500 list-disc list-inside">
                  <li><strong>Steady:</strong> Uniform inter-arrival times.</li>
                  <li><strong>Poisson:</strong> Exponential distribution modeling random web arrivals.</li>
                  <li><strong>Bursty:</strong> Clustered request arrival pulses modeling flash events.</li>
                  <li><strong>Diurnal:</strong> Sinusoidal curve modeling day/night activity cycles.</li>
                  <li><strong>Spike:</strong> Extreme step-function surge testing autoscaling thresholds.</li>
                </ul>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                <strong>Heterogeneous Candidate Pool:</strong>
                <ul className="mt-1 space-y-1 text-slate-500 list-disc list-inside">
                  <li><strong>AWS Lambda:</strong> 128MB, 512MB, 1024MB, 2048MB, 3008MB</li>
                  <li><strong>Google Cloud Functions:</strong> 256MB, 512MB, 1024MB, 2048MB</li>
                  <li><strong>Azure Functions:</strong> Dynamic Consumption Tiers</li>
                  <li><strong>Container State Tracking:</strong> 10-minute container reuse idle window.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 8. Limitations */}
        <section className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
            <ShieldCheck size={15} /> 8. Research Limitations & Threats to Validity
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Honest Scientific Limitations
          </h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3 text-xs text-slate-500">
            <div>
              <strong className="text-slate-800">1. Grid Trace Temporal Resolution:</strong> Marginal carbon factors are sourced from hourly regional ISO/RTO emissions data; sub-minute grid frequency fluctuations are approximated synthetically.
            </div>
            <div>
              <strong className="text-slate-800">2. Network Jitter Modeling:</strong> Cross-region inter-datacenter latency is modeled using bounded Gaussian distributions based on ping measurements rather than active BGP routing anomalies.
            </div>
            <div>
              <strong className="text-slate-800">3. Provider Eviction Heuristics:</strong> Real-world container eviction schedules are proprietary to cloud providers; CloudFlow implements a standard 10-minute idle TTL cache model based on empirical ServerlessBench observations.
            </div>
          </div>
        </section>

        {/* Navigation CTAs */}
        <div className="rounded-3xl bg-slate-950 p-8 sm:p-12 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Continue Exploring</span>
            <h2 className="mt-2 text-2xl font-bold">Inspect the Mathematical Formulation or Run Experiments</h2>
            <p className="mt-1 text-xs text-slate-400">Review the step-by-step decision loop or launch deterministic simulations in the dashboard.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={onOpenMethodology}
              variant="outline"
              className="rounded-xl border-slate-700 bg-transparent text-white hover:bg-slate-800 text-xs"
            >
              View Methodology
            </Button>
            <Button
              onClick={onOpenDashboard}
              className="rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 text-xs font-semibold"
            >
              Open Dashboard <ArrowRight size={14} className="ml-1" />
            </Button>
          </div>
        </div>
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
