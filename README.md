# CloudFlow

> **CloudFlow: Adaptive Serverless Scheduling for Cost Efficiency, Carbon Awareness, and SLA Compliance.**  
> *Smarter Scheduling. Efficient Execution. Sustainable Cloud.*

CloudFlow is a research-ready serverless scheduling framework and evaluation platform designed to optimize multi-objective trade-offs across execution cost, regional carbon emissions, latency percentiles, and strict SLA compliance.

> **Notice:** The current implementation is a deterministic serverless simulation framework, not a live cloud deployment benchmark. All evaluations, costs, latencies, and carbon emissions are computed from documented mathematical models and regional grid intensity datasets.

---

## 🎯 Research Objectives

CloudFlow models the complex trade-offs of modern serverless computing across distributed regional environments:

1. **SLA Compliance First:** Enforce latency thresholds ($L_{\text{est}} \le L_{\text{SLA}}$) before ranking candidate cloud options.
2. **Cost Efficiency:** Model invocation, memory, CPU, and duration costs across compute tiers.
3. **Carbon Awareness:** Model regional marginal grid carbon intensity ($g\ \text{CO}_2\text{e}/\text{kWh}$) to minimize environmental footprint.
4. **Cold-Start Awareness:** Factor container initialization latency and idle container warm-pools into placement choices.

---

## 📐 Metric Formulations & Units

All metrics in CloudFlow use standardized units and deterministic formulas:

### 1. Execution Cost ($ USD)
$$\text{Cost} = (\text{durationMs} \times \text{costPerMsUSD}) + \text{invocationFeeUSD}$$
- **Assumptions:** Direct compute runtime duration billed per millisecond based on 512MB/1-vCPU tier. Default base invocation fee modeled at $\$0.0000002$.

### 2. Estimated Carbon Emissions ($g\ \text{CO}_2\text{e}$)
$$\text{Energy (kWh)} = \frac{\text{powerWatts} \times (\text{durationMs} / 1000)}{3600 \times 1000}$$
$$\text{Emissions} = \text{Energy (kWh)} \times \text{gridCarbonIntensity (g CO}_2\text{e/kWh)}$$
- **Assumptions:** Average serverless container power estimated at 35W per active core equivalent. Regional marginal carbon intensities derived from public grid datasets (e.g. Electricity Maps, IEA regional averages).

### 3. Average Latency ($\text{ms}$)
$$\bar{L} = \frac{1}{N} \sum_{i=1}^N L_i$$

### 4. P95 Latency ($\text{ms}$)
- **Method:** 0-indexed nearest-rank percentile method on the sorted latency array $L$ of length $N$:
  $$\text{Index} = \max(0, \lceil 0.95 \times N \rceil - 1)$$

### 5. Cold-Start Rate ($\%$)
$$\text{ColdStartRate} = \frac{N_{\text{cold}}}{N_{\text{total}}} \times 100$$
- **Assumptions:** 10-minute idle container expiration timeout based on request arrival timestamp intervals.

### 6. SLA Violation Rate ($\%$)
$$\text{SLAViolationRate} = \frac{N_{L_i > L_{\text{SLA}}}}{N_{\text{total}}} \times 100$$

### 7. Scheduling Overhead ($\text{ms}$)
- Decision time in milliseconds measured with high-resolution timers (`performance.now()`).

---

## ⚖️ Scheduling Policies & Adaptive Algorithm

CloudFlow evaluates five distinct scheduling policies under identical workload traces:

1. **Latency-First:** Selects the candidate minimizing estimated latency among SLA-feasible candidates.
2. **Cost-First:** Selects the candidate minimizing direct compute billing among SLA-feasible candidates.
3. **Carbon-First:** Selects the candidate with minimum regional carbon emissions among SLA-feasible candidates.
4. **Fixed / Default:** Static single-region baseline reflecting conventional serverless architecture.
5. **CloudFlow Adaptive (`cloudflow-adaptive`):** Two-stage multi-objective optimization with strict SLA dominance.

### CloudFlow Adaptive Algorithm Architecture

#### Stage A: SLA Feasibility Check
Candidates are first evaluated against the configured SLA latency threshold:
$$C_{\text{eligible}} = \{ c \in C \mid L_{\text{est}}(c) \le L_{\text{SLA}} \}$$
- **SLA Dominance Principle:** Infeasible candidates ($L_{\text{est}}(c) > L_{\text{SLA}}$) are **strictly disqualified** from normal optimization and cannot be selected merely because they offer lower cost or carbon emissions.
- **Documented Fallback:** If zero candidates meet the SLA threshold ($C_{\text{eligible}} = \emptyset$), CloudFlow selects the candidate with the smallest SLA shortfall:
  $$\text{shortfall}(c) = L_{\text{est}}(c) - L_{\text{SLA}}$$
  $$c^* = \arg\min_{c \in C} \text{shortfall}(c)$$
  The system returns `isSlaSatisfied: false` with explicit diagnostic warnings.

#### Stage B: Normalized Multi-Objective Scoring
For all eligible candidates $c \in C_{\text{eligible}}$, raw metrics are normalized to the range $[0.0, 1.0]$:
- Safe Min-Max Normalization (handles zero range and identical values safely without division by zero):
  $$\hat{m}(c) = \begin{cases} 0.0 & \text{if } \max_m - \min_m < 10^{-12} \\ \frac{m(c) - \min_m}{\max_m - \min_m} & \text{otherwise} \end{cases}$$
- Cold-Start Risk mapping:
  $$\hat{R}_{\text{cold}}(c) = \begin{cases} 0.0 & \text{Low} \\ 0.5 & \text{Medium} \\ 1.0 & \text{High} \end{cases}$$
- Configurable Objective Weights:
  - $\alpha$ (Cost): default `0.35`
  - $\beta$ (Carbon): default `0.25`
  - $\gamma$ (Latency): default `0.25`
  - $\delta$ (Cold-Start Risk): default `0.15`
  - Requirement: $\alpha + \beta + \gamma + \delta = 1.0$ ($\pm 0.001$ floating-point tolerance, all weights $\ge 0$).
- Composite Objective Score (lower is better):
  $$\text{Score}(c) = \alpha \hat{\text{Cost}}(c) + \beta \hat{\text{Carbon}}(c) + \gamma \hat{\text{Latency}}(c) + \delta \hat{R}_{\text{cold}}(c)$$
  $$c^* = \arg\min_{c \in C_{\text{eligible}}} \text{Score}(c)$$

---

## 🔬 Fair Multi-Policy Benchmarking Methodology

To ensure scientifically valid comparisons, the simulation engine generates a single synthetic request trace based on the specified workload type, arrival pattern (Poisson, Steady, Bursty), duration, and PRNG seed (Mulberry32). 

Every evaluated policy is simulated against the **exact same request sequence** with identical candidate initial states. This eliminates stochastic bias and allows direct evaluation of cost vs. carbon vs. latency trade-offs across all five policies.

---

## 🔌 API Endpoints

### 1. `POST /api/simulate`
Executes a deterministic workload simulation across multi-cloud serverless candidates.

- **Validation Limits:**
  - `requestCount`: Integer between 1 and 50,000.
  - `slaLatencyThresholdMs`: Strictly positive finite number (> 0 ms).
  - `arrivalPattern`: `'Poisson' | 'Steady' | 'Bursty'` (default: `'Poisson'`).
  - `policy`: `'Latency-first' | 'Cost-first' | 'Carbon-first' | 'Default'` (default: `'Latency-first'`).
  - `seed`: Optional integer for deterministic reproducibility.

**Example Request:**
```json
{
  "requestCount": 500,
  "durationMinutes": 10,
  "slaLatencyThresholdMs": 400,
  "arrivalPattern": "Poisson",
  "policy": "Latency-first",
  "seed": 4242
}
```

**Example Response (HTTP 200):**
```json
{
  "status": "success",
  "simulationId": "sim-seed4242-mvgch09a",
  "timestamp": "2026-10-20T07:11:10.222Z",
  "policy": "Latency-first",
  "summary": {
    "policy": "Latency-first",
    "totalRequests": 500,
    "averageLatencyMs": 287.46,
    "p95LatencyMs": 370.19,
    "totalCostUSD": 0.001649,
    "totalCarbonG": 0.2725,
    "coldStartRatePercent": 0,
    "slaViolationRatePercent": 0,
    "averageOverheadMs": 0.009
  },
  "simulationAssumptions": { ... },
  "sampleTraces": [ ... ]
}
```

---

### 2. `POST /api/schedule/evaluate`
Evaluates candidate options against the specified policy with explicit SLA feasibility enforcement.

**Example Request:**
```json
{
  "policy": "Cost-first",
  "slaLatencyThresholdMs": 300,
  "candidates": [
    {
      "id": "c1",
      "name": "AWS Lambda us-east-1",
      "provider": "AWS",
      "region": "us-east-1",
      "baseLatencyMs": 140,
      "coldStartLatencyMs": 220,
      "costPerMsUSD": 0.000000021,
      "carbonIntensityGPerKwh": 380,
      "activeInstances": 10,
      "isWarm": true
    }
  ]
}
```

**Example Response (HTTP 200):**
```json
{
  "status": "success",
  "policy": "Cost-first",
  "slaLatencyThresholdMs": 300,
  "isSlaSatisfied": true,
  "selectedCandidate": { "id": "c1", "name": "AWS Lambda us-east-1", ... },
  "decisionExplanation": "Selected 'AWS Lambda us-east-1' offering lowest execution cost ($0.00000272) among SLA-feasible candidates.",
  "evaluations": [ ... ],
  "schedulingOverheadMs": 0.23
}
```

---

### 3. `GET /api/experiments`
Returns experiment collections.

**Example Response (HTTP 200):**
```json
{
  "status": "success",
  "data": {
    "experiments": [],
    "total": 0,
    "persistence": {
      "enabled": false,
      "storageType": "none",
      "notice": "Persistent experiment storage is not yet active in Phase 2. Experiments are currently executed transiently in-memory. Persistent storage (database/file store) will be implemented in Phase 4."
    }
  }
}
```

---

### Error Handling
All endpoints return consistent JSON error objects with appropriate HTTP status codes (e.g. 400 for validation errors, 422 for execution constraints):

```json
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request payload failed schema validation.",
    "details": [
      "Field 'requestCount' must be at least 1.",
      "Missing required field 'slaLatencyThresholdMs'."
    ]
  }
}
```

---

## 🧪 Testing & Validation

CloudFlow uses Node.js's native test runner (`node:test`) with zero extra testing dependencies:

```bash
# Run all unit and integration tests
pnpm test

# Run strict TypeScript type check
pnpm typecheck

# Build for production
pnpm build
```

---

## 🛠️ Architecture

```text
app/
  api/
    simulate/route.ts          # POST /api/simulate
    schedule/evaluate/route.ts # POST /api/schedule/evaluate
    experiments/route.ts       # GET /api/experiments
  layout.tsx                   # App Root Layout with CloudFlow branding
  page.tsx                     # Main Dashboard View
lib/
  metrics/
    calculations.ts            # Mathematical formulations (cost, carbon, P95, SLA)
  scheduler/
    adaptive-policy.ts         # CloudFlow Adaptive two-stage scheduling algorithm
    baseline-policies.ts       # Baseline policies (latency-first, cost-first, carbon-first, default)
  simulation/
    defaults.ts                # Default multi-cloud regional serverless candidates
    engine.ts                  # Deterministic simulation execution engine
    workload.ts                # Deterministic PRNG and synthetic workload generator
  types/
    scheduler.ts               # Core domain and API contracts
  validation/
    api-validator.ts           # Schema validation and request boundary limits
tests/
  adaptive.test.ts             # Unit tests for CloudFlow adaptive policy & weight validation
  comparison.test.ts           # Multi-policy benchmark consistency & trade-off tests
  metrics.test.ts              # Unit tests for metric formulas
  policies.test.ts             # Unit tests for baseline policy selection & SLA enforcement
  simulation.test.ts           # Deterministic reproducibility & distribution tests
  validation.test.ts           # Input boundary & error handling tests
```

---

## 📄 Known Limitations (Phase 3)

- **Transient Storage:** Experiment runs are currently simulated in-memory and not stored permanently across restarts. Persistent storage will be implemented in Phase 4.
- **Frontend Integration:** The UI dashboard currently displays mock demonstration values; Phase 5 will connect the dashboard forms, tables, and charts to live API results.
