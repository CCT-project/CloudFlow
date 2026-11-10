# CloudFlow: Adaptive Serverless Scheduling

> **Adaptive Serverless Scheduling for Cost Efficiency, Carbon Awareness, and SLA Compliance.**
> *Smarter Scheduling. Efficient Execution. Sustainable Cloud.*

[![CI & Automated Testing](https://github.com/CCT-project/CloudFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/CCT-project/CloudFlow/actions/workflows/ci.yml)
[![Production Live](https://img.shields.io/badge/Production-Live%20on%20Vercel-success)](https://cloud-flow-kappa.vercel.app)
[![Tests Passing](https://img.shields.io/badge/Tests-194%20Passing-brightgreen)](tests/)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.4.5-black)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.0.0-blue)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-blue)](https://www.typescriptlang.org/)

**Live Production Dashboard:** [https://cloud-flow-kappa.vercel.app](https://cloud-flow-kappa.vercel.app)
**Source Repository:** [https://github.com/CCT-project/CloudFlow](https://github.com/CCT-project/CloudFlow)

---

> [!NOTE]
> **Scientific Methodology & Simulation Notice:**
> CloudFlow operates as a **deterministic discrete-event trace simulator** calibrated against empirical cloud provider characteristics (AWS Lambda, GCP Cloud Functions, Azure Functions) from published computer systems literature. All evaluations, costs, latencies, and carbon emissions are computed from documented mathematical models, container reuse lifecycles, and regional grid intensity datasets.

---

## 1. Problem Statement

Modern cloud applications increasingly adopt Function-as-a-Service (FaaS) serverless computing due to rapid auto-scaling, fine-grained pay-per-use billing, and zero idle operational overhead. However, existing commercial serverless platforms exhibit critical scheduling limitations:

1. **Greedy Single-Objective Scheduling:** Standard platforms route invocations based purely on localized turnaround latency or provider-side utilization, ignoring consumer execution billing and regional environmental impact.
2. **Environmental Footprint of Cloud Computing:** Electricity consumption for hyperscale data centers accounts for substantial global carbon emissions. Marginal carbon intensities vary by up to $5\times$ across regional electrical grids (e.g., $160\text{ gCO}_2/\text{kWh}$ in renewable-rich hydro/wind regions vs. $485\text{ gCO}_2/\text{kWh}$ in fossil-heavy regions), yet mainstream cloud schedulers remain completely carbon-blind.
3. **Severe Cold-Start Degradation:** Irregular, bursty request arrivals force repeated container initialization delays ($180\text{ ms} \to 340\text{ ms}$), causing severe tail latency spikes ($P_{95}, P_{99}$) and violating Service Level Agreements (SLAs).
4. **Lack of SLA Feasibility Dominance:** Naive multi-objective algorithms frequently trade away SLA compliance in exchange for fractional cost or carbon savings, which is unacceptable for latency-critical production workloads.

---

## 2. Proposed Solution

**CloudFlow** introduces an adaptive, multi-objective serverless scheduling engine that balances execution cost, carbon emissions, and turnaround latency **while strictly enforcing SLA feasibility as a dominant constraint**:

1. **Two-Stage Decision Mechanism:**
   - **Stage A (SLA Feasibility Filter):** Proactively estimates total turnaround latency—including queueing delay under saturation, container initialization status, and compute duration. Candidates that exceed the SLA threshold ($T_{\text{est}} > T_{\text{SLA}}$) are **strictly disqualified** from normal ranking.
   - **Stage B (Normalized Multi-Objective Scoring):** Evaluates remaining feasible candidates using min-max normalized utility scoring across weighted cost ($\alpha$), carbon emissions ($\beta$), predicted latency ($\gamma$), and cold-start risk ($\delta$).
2. **Deterministic Shortfall Fallback:** When traffic surges push all candidates beyond the SLA, CloudFlow deterministically selects the candidate minimizing SLA shortfall ($\Delta_{\text{shortfall}} = T_{\text{est}} - T_{\text{SLA}}$) and emits structured diagnostic warnings.
3. **Discrete-Event Container Simulation:** Faithfully models finite container pools ($M=10$), warm container reuse within 10-minute idle Time-To-Live (TTL) windows, and concurrency-driven FIFO queueing delays.
4. **Multi-Seed Statistical Validation:** Built-in inferential hypothesis testing ($k \ge 30$ seeds) executing paired Student's $t$-tests, Holm-Bonferroni Family-Wise Error Rate (FWER) control, and Cohen's $d_z$ effect sizes.

---

## 3. Project Objectives

- **Enforce Strict SLA Compliance:** Guarantee that SLA feasibility strictly dominates multi-objective optimization.
- **Minimize Operational Execution Cost:** Factor invocation fees and duration memory tiers into placement decisions.
- **Reduce Cloud Carbon Footprint:** Exploit spatial variance in marginal regional grid carbon intensities.
- **Mitigate Cold-Start Degradation:** Track container warm/cold states to prioritize warm pool reuse.
- **Ensure Empirical Reproducibility:** Decouple random streams via 32-bit Mulberry32 PRNG to produce identical paired request traces across all evaluated policies.

---

## 4. Key Features

- **Interactive Research Console:** Web-based dashboard with responsive metric summary cards and real-time visualization.
- **Fair 5-Policy Benchmarking:** Evaluates CloudFlow Adaptive alongside Latency-first, Cost-first, Carbon-first, and Default baseline policies on identical synthetic request sequences.
- **Request Trace Visualizer:** Granular trace inspection featuring 12-item pagination, category filter pills (*All, Cold Starts, Warm Reuses, Queued Requests, SLA Violations*), search bar, and execution metadata.
- **Empirical Latency Distributions:** Interactive histograms with selectable bin widths ($10\text{ms}, 25\text{ms}, 50\text{ms}$) and aligned empirical Cumulative Distribution Function (CDF) curves.
- **Container Lifecycle Heatmaps:** Visualizes instance allocations, active concurrent states, queueing delays, and idle evictions.
- **Statistical Forest Plot:** Visual representation of Cohen's $d_z$ effect sizes and 95% confidence intervals across $k \ge 30$ seeds.
- **Enterprise Security & Isolation:** Cryptographic HMAC-SHA256 session tokens, fail-closed multi-user experiment isolation, bcrypt credential hashing, and Upstash Redis distributed rate limiting.
- **1-Click Export:** Download RFC-4180 compliant CSV datasets and formatted jsPDF summary reports.

---

## 5. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend Framework** | **Next.js** (App Router) | 16.4.5 | Server-side rendering, client hydration, and API route handlers. |
| **UI Library** | **React** | 19.0.0 | Component rendering and interactive state management. |
| **Styling & Icons** | **Tailwind CSS**, Lucide React | 4.3.3 / 1.16.0 | Responsive layout styling and semantic icons. |
| **Data Visualization** | **Recharts**, HTML5 Canvas | 3.10.1 | Time-series charts, histograms, empirical CDFs, and forest plots. |
| **Language & Tooling** | **TypeScript** | 5.7.3 | Strict static type validation across frontend and backend. |
| **Database & ORM** | **Prisma ORM**, **Neon PostgreSQL** | 6.4.1 | Relational persistence with connection pooling (`-pooler`). |
| **Caching & Rate Limiting**| **Upstash Redis**, `@upstash/ratelimit` | 1.41.0 / 2.2.0 | Distributed sliding-window abuse defense with fail-closed production policy. |
| **Security & Auth** | **bcryptjs**, Node.js Crypto | 3.0.3 | Salted password hashing, timing-safe HMAC session signing. |
| **Report Generation** | **jsPDF**, RFC-4180 CSV Engine | 4.2.1 | Client-side publication-grade PDF and CSV dataset exports. |
| **Test Runner** | **Node.js Native Test Runner (`node:test`)** | Built-in | Fast, zero-dependency automated test execution (168 tests). |
| **Cloud Hosting** | **Vercel Edge Platform** | Production | Global serverless edge runtime hosting and CI deployment. |

---

## 6. System Architecture

```mermaid
flowchart TD
    subgraph Client["Client Presentation Tier (Browser)"]
        UI["React 19 Interactive Dashboard"]
        TV["Trace Visualizer"]
        LD["Latency Distribution & CDF"]
        CL["Container Lifecycle Heatmap"]
        FP["Statistical Forest Plot"]
    end

    subgraph Gateway["Edge Security & Gateway Boundary"]
        CSP["Content Security Policy & HSTS"]
        RL["Upstash Redis Distributed Rate Limiter"]
        AUTH["HMAC-SHA256 Session Authenticator"]
    end

    subgraph API["Next.js 16 API Route Handlers"]
        S_API["/api/simulate"]
        BR_API["/api/research/batch"]
        E_API["/api/schedule/evaluate"]
        EXP_API["/api/experiments/*"]
        A_API["/api/auth/*"]
    end

    subgraph Simulation["Deterministic Simulation Kernel"]
        PRNG["Mulberry32 PRNG (Decoupled Streams)"]
        WL["Workload Generator (Steady, Poisson, Bursty)"]
        ENG["Discrete-Event Container Engine (M=10, 10m TTL)"]
        POL["5 Scheduling Policies (Adaptive, Latency, Cost, Carbon, Default)"]
    end

    subgraph Storage["Persistence Layer"]
        PRISMA["Prisma ORM (Cached Singleton)"]
        PG[("Neon PostgreSQL Database")]
    end

    UI -->|HTTPS / JSON API| CSP
    CSP --> RL
    RL --> AUTH
    AUTH --> S_API & BR_API & E_API & EXP_API & A_API
    S_API & BR_API & E_API --> PRNG
    PRNG --> WL
    WL --> ENG
    ENG --> POL
    EXP_API & A_API --> PRISMA
    PRISMA --> PG
```

For complete architectural specifications, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 7. Workflow & Execution Process

```mermaid
sequenceDiagram
    autonumber
    actor User as Researcher / User
    participant Frontend as Next.js Dashboard
    participant API as /api/simulate
    participant Engine as Discrete-Event Engine
    participant Scheduler as CloudFlow Adaptive Policy
    participant DB as Neon PostgreSQL

    User->>Frontend: Configure Simulation (Requests, Workload, SLA, Weights, Seed)
    Frontend->>API: POST /api/simulate (JSON payload)
    API->>API: Validate schema boundaries & check Redis rate limits
    API->>Engine: Initialize Mulberry32 PRNG & generate request trace
    loop For Each Request in Trace
        Engine->>Scheduler: Evaluate Candidate Nodes (Stage A SLA check)
        alt Feasible Candidates Found
            Scheduler->>Scheduler: Stage B Normalized Scoring (Cost, Carbon, Latency, Cold Start)
        else No Candidate Meets SLA
            Scheduler->>Scheduler: Fallback to Minimum SLA Shortfall
        end
        Scheduler-->>Engine: Selected Candidate
        Engine->>Engine: Update Container Pool (Reuse Warm / Scale Cold / Enqueue)
    end
    Engine->>API: Aggregate 5-Policy Comparative Metrics & Trace Samples
    alt Save Experiment Requested
        API->>DB: Atomic Transaction: Create Experiment & PolicyResults
        DB-->>API: Persisted Experiment Record
    end
    API-->>Frontend: Simulation Results JSON
    Frontend->>User: Render Metric Cards, Tables, Traces & Charts
```

---

## 8. Five Scheduling Policies

CloudFlow evaluates five distinct scheduling policies under identical workload traces:

1. **CloudFlow Adaptive (`cloudflow-adaptive`):**
   - **Stage A (SLA Feasibility Filter):** Identifies candidates satisfying $T_{\text{est}}(c) \le T_{\text{SLA}}$. If no candidate meets the threshold, falls back to the candidate minimizing shortfall:
     $$\Delta_{\text{shortfall}} = T_{\text{est}}(c) - T_{\text{SLA}}$$
   - **Stage B (Normalized Multi-Objective Utility):** Evaluates feasible candidates:
     $$\text{Score}(c) = \alpha \hat{\text{Cost}}(c) + \beta \hat{\text{Carbon}}(c) + \gamma \hat{\text{Latency}}(c) + \delta \hat{R}_{\text{cold}}(c)$$
     Default weights: $\alpha = 0.35, \beta = 0.25, \gamma = 0.25, \delta = 0.15$ ($\sum = 1.0$).
2. **Latency-First:**
   - Minimizes estimated turnaround latency among SLA-feasible candidates:
     $$c^* = \arg\min_{c \in C_{\text{eligible}}} \left( L_{\text{base}, c} + L_{\text{queue}, c} + \mathbb{I}_{\text{cold}} \cdot L_{\text{cold}, c} \right)$$
3. **Cost-First:**
   - Minimizes direct compute billing among SLA-feasible candidates:
     $$c^* = \arg\min_{c \in C_{\text{eligible}}} \left( \text{Price}_{\text{invoc}, c} + \text{Price}_{\text{GB-s}, c} \cdot \text{Mem}_c \cdot T_{\text{est}, c} \right)$$
4. **Carbon-First:**
   - Minimizes regional marginal carbon emissions among SLA-feasible candidates:
     $$c^* = \arg\min_{c \in C_{\text{eligible}}} \left( \text{Power}_{\text{avg}, c} \cdot T_{\text{est}, c} \cdot I_{\text{grid}, c} \right)$$
5. **Default Baseline (Round-Robin with SLA Filter):**
   - Cyclic assignment across available multi-region candidates, constrained by Stage A SLA feasibility.

---

## 9. Workload Models

CloudFlow implements three synthetic arrival patterns via `lib/simulation/workload.ts`:

1. **Steady Workload:**
   - Uniform pacing with deterministic micro-jitter ($\epsilon = 0.05$):
     $$\Delta t_i = \frac{1}{\lambda} \cdot \left(1 + \epsilon \cdot (U_i - 0.5)\right)$$
   - Represents paced background tasks and establishes container reuse equilibrium.
2. **Poisson Process:**
   - Memoryless stochastic process generated via inverse-transform sampling:
     $$\Delta t_i = -\frac{\ln(1 - U_i)}{\lambda}$$
   - Represents uncorrelated real-world web traffic arrivals.
3. **Clustered Bursty Workload:**
   - Two-state Markov-modulated arrival model with acute burst compression factor 10:
     $$\Delta t_{\text{burst}} = \frac{\Delta t_{\text{base}}}{10}$$
   - Forces container pool saturation ($M=10$), inducing cold starts, FIFO queueing, and stress-testing shortfall fallbacks.

---

## 10. Performance Metrics & Units

All metrics in CloudFlow use standardized units and deterministic formulas:

| Metric | Symbol | Unit | Description |
|---|---|---|---|
| **Average Latency** | $\bar{L}$ | Milliseconds ($\text{ms}$) | Arithmetic mean turnaround time across all requests. |
| **P95 / P99 Latency** | $L_{P95}, L_{P99}$ | Milliseconds ($\text{ms}$) | 95th and 99th percentile tail latency (0-indexed nearest rank). |
| **Execution Cost** | $C_{\text{total}}$ | US Dollars ($\$$ USD) | Total compute runtime billed in discrete 100ms tiers + base invocation fees. |
| **Carbon Emissions** | $E_{\text{total}}$ | Grams $\text{CO}_2\text{eq}$ ($g\text{CO}_2\text{eq}$) | Energy consumption ($\text{kWh}$) multiplied by regional grid intensity and PUE. |
| **Cold-Start Rate** | $R_{\text{cold}}$ | Percentage ($\%$) | Proportion of requests requiring container initialization. |
| **SLA Violation Rate** | $R_{\text{SLA}}$ | Percentage ($\%$) | Proportion of requests exceeding the configured $T_{\text{SLA}}$ threshold. |
| **Scheduling Overhead**| $O_{\text{sched}}$ | Milliseconds ($\text{ms}$) | Scheduling decision execution time measured via monotonic timers. |

---

## 11. Mathematical Formulations & Optimization Methodology

### 1. Billed Execution Cost ($ USD)
$$\text{Cost} = \sum_{i=1}^N \left[ P_{\text{invoc}, c(i)} + \left( P_{\text{mem}, c(i)} \cdot \frac{M_{c(i)}}{1024} \cdot \left\lceil \frac{T_{\text{exec}, i}}{100} \right\rceil \times 0.1 \right) \right]$$

### 2. Operational Carbon Footprint ($g\text{CO}_2\text{eq}$)
$$\text{Energy (kWh)} = \frac{P_{\text{core}} \cdot (T_{\text{exec}} / 1000)}{3600 \times 1000}$$
$$\text{Carbon} = \text{Energy (kWh)} \times I_{\text{grid}, c} \times \text{PUE}_c$$
- $P_{\text{core}} = 35\text{W}$ per active vCPU core equivalent.
- $I_{\text{grid}}$: Regional marginal grid carbon intensity ($160 \to 485\text{ gCO}_2/\text{kWh}$).
- $\text{PUE}$: Power Usage Effectiveness ($1.12 \to 1.20$).

### 3. Pooled P95 Latency (Multi-Seed Aggregation)
When evaluating multi-seed batch trials ($k \ge 30$), CloudFlow calculates **pooled request-level P95 latency** across the concatenated vector of all request observations rather than taking the unweighted average of individual seed P95s:
$$L_{\text{pooled}} = \text{Quantile}_{0.95}\left( \bigcup_{j=1}^k \mathbf{L}_j \right)$$

### 4. Inferential Statistical Hypothesis Testing
- **Paired Student's $t$-Test:** Computes difference vector $D_j = M_{\text{CloudFlow}, j} - M_{B, j}$ across $k$ seeds ($df = k - 1$).
- **Holm-Bonferroni FWER Control:** Adjusts raw $p$-values sequentially to maintain an overall family-wise error rate of $\alpha = 0.05$ across all $m = 4$ pairwise comparisons.
- **Cohen's $d_z$ Effect Size:** Quantifies practical magnitude ($d_z = \bar{D} / s_D$) classified into Negligible ($< 0.2$), Small ($0.2 \le d < 0.5$), Medium ($0.5 \le d < 0.8$), and Large ($d \ge 0.8$).

---

## 12. Database Architecture

CloudFlow utilizes **PostgreSQL** hosted on Neon with **Prisma ORM**:

```mermaid
erDiagram
    User ||--o{ Experiment : "owns (onDelete: SetNull)"
    Experiment ||--|{ PolicyResult : "contains (onDelete: Cascade)"

    User {
        string id PK "UUID"
        string email UK "Unique, Indexed"
        string name "Display Name"
        string passwordHash "bcrypt"
        datetime createdAt "now()"
        datetime updatedAt
    }

    Experiment {
        string id PK "UUID"
        string name "Title"
        datetime createdAt "Indexed"
        string workloadType "Indexed"
        int requestCount "1..50000"
        int durationMinutes
        float slaLatencyThresholdMs
        string arrivalPattern
        int seed "PRNG Seed"
        json weights "alpha, beta, gamma, delta"
        json assumptions "Documented models"
        string userId FK "Nullable, Indexed"
        boolean isPublic "Default: false, Indexed"
    }

    PolicyResult {
        string id PK "UUID"
        string experimentId FK "Indexed"
        string policy "Policy Name"
        int totalRequests
        float averageLatencyMs
        float p95LatencyMs
        float totalCostUSD
        float totalCarbonG
        float coldStartRatePercent
        float slaViolationRatePercent
        float averageOverheadMs
    }
```

- **Fail-Closed Security:** Queries enforce strict data isolation. Private experiments belonging to other users or unassigned private records are blocked at the storage layer.
- For complete table schemas and migration history, see [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md).

---

## 13. API Documentation Overview

CloudFlow implements 9 active HTTP API endpoints:

| Endpoint | Method | Rate Limit | Purpose |
|---|---|---|---|
| `/api/simulate` | `POST` | 20 / min | Executes a deterministic 5-policy workload benchmark. |
| `/api/schedule/evaluate` | `POST` | 60 / min | Evaluates candidate nodes for a single request under SLA feasibility. |
| `/api/research/batch` | `POST` | 10 / min | Multi-seed batch execution ($k \ge 30$) with Student's $t$ & Holm-Bonferroni tests. |
| `/api/experiments` | `GET` | 60 / min | Returns paginated experiment records with multi-user isolation. |
| `/api/experiments` | `POST` | 20 / min | Atomically persists experiment configurations and policy results. |
| `/api/experiments/:id` | `GET` | 60 / min | Retrieves detailed metrics and policy results for a single experiment. |
| `/api/experiments/:id` | `DELETE`| 20 / min | Deletes an experiment with strict owner authorization. |
| `/api/auth/register` | `POST` | 5 / min | Registers a new researcher user account (bcrypt password). |
| `/api/auth/login` | `POST` | 5 / min | Authenticates credentials and sets HMAC-signed session cookie. |
| `/api/auth/logout` | `POST` | 60 / min | Invalidation of active user session and clears cookie. |
| `/api/auth/session` | `GET` | 60 / min | Retrieves authenticated user profile from verified session token. |

Complete JSON request/response contracts and error structures are documented in [docs/API_REFERENCE.md](docs/API_REFERENCE.md).

---

## 14. Installation & Local Setup

### Prerequisites
- **Node.js:** `>= 22.0.0`
- **Package Manager:** `pnpm` (`>= 9.0.0` or `npx pnpm`) or `npm` (`>= 10.0.0`)
- **Database (Optional for local prototyping):** PostgreSQL instance (local or Neon free tier)

### 1. Clone the Repository
```bash
git clone https://github.com/CCT-project/CloudFlow.git
cd CloudFlow
```

### 2. Install Dependencies
```bash
# Using pnpm (Recommended)
pnpm install

# Or using npm
npm install
```

---

## 15. Environment Variable Configuration

Copy [.env.example](.env.example) to `.env.local` for local overrides:
```bash
cp .env.example .env.local
```

### Mandatory Keys in `.env.local`:
```env
# Application Host URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Authentication & Session Security (Minimum 32 characters in production)
SESSION_SECRET="your-cryptographically-random-32-plus-character-secret"

# PostgreSQL Database Connection - Pooled (Application Runtime)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cloudflow?schema=public"

# PostgreSQL Database Connection - Direct (Prisma Migrate Deployment)
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/cloudflow?schema=public"

# Upstash Redis Distributed Rate Limiting (Optional in local dev, fails-closed in prod)
UPSTASH_REDIS_REST_URL="https://your-upstash-redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-upstash-token"
```

> [!WARNING]
> Never commit `.env` or `.env.local` to version control. The repository's [.gitignore](.gitignore) strictly bars them.

---

## 16. Running the Application

### Development Mode
```bash
# Using pnpm
pnpm dev

# Or using npm
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build & Local Execution
```bash
# Build the application
pnpm build

# Start the optimized production server
pnpm start
```

### Headless Research Benchmarking CLI
CloudFlow includes an automated, high-throughput command-line runner (`scripts/research-runner.ts`) for executing multi-seed experiments without browser timeouts:

```bash
# Default benchmark (Steady, Poisson, Bursty workloads across 30 seeds, 1,000 requests/seed)
pnpm research

# Custom evaluation: Bursty traffic, 5,000 requests per seed, 30 seeds
pnpm research --workload bursty --requests 5000 --seeds 30

# High-volume stress experiment (50,000 requests per seed)
node --max-old-space-size=4096 scripts/research-runner.ts --workload poisson --requests 50000 --seeds 30
```
All artifacts are saved to `research-results/<run-id>/` (`benchmark-summary.json`, `policy-comparison.csv`, `reproducibility-manifest.json`). For full CLI documentation, see [docs/RESEARCH_CLI_GUIDE.md](docs/RESEARCH_CLI_GUIDE.md).

### Sensitivity Analysis CLI Runner
CloudFlow features a multi-dimensional sensitivity analysis framework (`scripts/sensitivity-runner.ts`) to evaluate scheduler robustness across adaptive weight presets, SLA latency thresholds, and workload arrival patterns:

```bash
# Full sensitivity evaluation matrix (Weights, SLA thresholds, and Workloads across 30 seeds)
npm run sensitivity

# Specific dimension sweep: Adaptive objective weights sensitivity (10 seeds, 500 requests/seed)
node scripts/sensitivity-runner.ts --mode weights --requests 500 --seeds 10

# SLA threshold sweep across tight and loose bounds (150ms, 250ms, 400ms, 600ms)
node scripts/sensitivity-runner.ts --mode sla --slas 150,250,400,600 --requests 1000 --seeds 30

# Workload traffic sensitivity across Steady, Poisson, and Bursty
node scripts/sensitivity-runner.ts --mode workloads --requests 1000 --seeds 30
```
Outputs four comprehensive artifacts per run in `research-results/<run-id>/`: `sensitivity-summary.json`, `sensitivity-results.csv`, `sensitivity-manifest.json`, and `sensitivity-report.md`.

---

## 17. Running Automated Tests

CloudFlow uses **Node.js's native test runner (`node:test`)** with zero third-party testing bloat:

```bash
# Run all 194 unit, integration, security, and sensitivity tests
npm test

# Run strict TypeScript typecheck (0 errors required)
npm run typecheck

# Validate Prisma schema relations
npx prisma validate

# Run end-to-end production build compilation
npm run build
```

- **Test Pass Rate:** **194 / 194 tests passing (100%)** across 25 test suites (~20 seconds).
- Complete test suite documentation is available in [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md).

---

## 18. Deployment Instructions

### Production Deployment to Vercel
1. Link your GitHub repository to Vercel.
2. In the Vercel Project Settings, configure the following Environment Variables:
   - `SESSION_SECRET`: A secure 32+ character random string.
   - `DATABASE_URL`: Neon pooled connection string with `-pooler`.
   - `DIRECT_URL`: Neon direct connection string without `-pooler`.
   - `UPSTASH_REDIS_REST_URL`: Upstash REST endpoint.
   - `UPSTASH_REDIS_REST_TOKEN`: Upstash REST token.
3. Deploy. The production build uses `next build --webpack` for cross-platform WASM SWC compilation.
4. **Live URL:** [https://cloud-flow-kappa.vercel.app](https://cloud-flow-kappa.vercel.app)

---

## 19. Project Limitations & Future Improvements

### Current Limitations
- **Discrete-Event Simulation:** Calibrated to empirical literature, but does not invoke physical AWS Lambda or GCP hypervisors in its default benchmark suite.
- **Static Regional Carbon:** Uses static average/marginal emissions factors per region rather than minute-by-minute dynamic grid dispatch telemetry.
- **Synchronous Edge Limits:** Interactive API requests enforce `seedCount * requestCount <= 50,000` to prevent serverless function timeouts.

### Future Research Roadmap
- **Live Multi-Cloud Testbed:** Automated deployment workers invoking real AWS Lambda, Google Cloud Run, and Azure Functions.
- **Electricity Maps Live API:** Real-time marginal grid emission factors fetched dynamically.
- **Machine Learning Arrival Predictors:** LSTM/Transformer neural models to predict burst surges and pre-warm container pools.

For an exhaustive scientific discussion of assumptions and boundaries, see [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

---

## 20. Technical Documentation Directory

For complete in-depth technical specifications, refer to the `docs/` directory:

- [System Architecture Specification](docs/ARCHITECTURE.md)
- [API Reference Manual & Examples](docs/API_REFERENCE.md)
- [Database Schema & Data Dictionary](docs/DATABASE_SCHEMA.md)
- [Research Methodology & Statistics](docs/RESEARCH_METHODOLOGY.md)
- [Testing & Quality Assurance Guide](docs/TESTING_GUIDE.md)
- [Assumptions, Limitations & Future Work](docs/LIMITATIONS.md)
- [Headless Research CLI Guide](docs/RESEARCH_CLI_GUIDE.md)
- [Final Production Verification Report](docs/FINAL_PRODUCTION_VERIFICATION.md)

---

## 📄 License

This project is licensed for research, academic evaluation, and college project presentation under the terms of the project repository.
