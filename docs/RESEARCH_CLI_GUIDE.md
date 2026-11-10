# CloudFlow Headless Research CLI Guide

## 1. Overview & Research Objectives

The **CloudFlow Headless Research CLI Runner** (`scripts/research-runner.ts`) is a dedicated high-throughput benchmarking kernel engineered for large-scale, automated, and strictly reproducible multi-objective serverless scheduling experiments.

In academic and enterprise research evaluations, standard interactive web APIs (such as Next.js route handlers) are constrained by serverless gateway timeouts (10s on Vercel Hobby, 60s on Pro) and browser memory limits. The Headless Research CLI bypasses all HTTP networking layers and executes directly against CloudFlow's mathematical scheduling engine, enabling researchers to evaluate:
- **Large request volumes**: $1\text{K}, 5\text{K}, 10\text{K},$ and $50\text{K}$ requests per seed.
- **Statistically robust sample sizes**: $k \ge 30$ pseudo-random seeds per workload pattern.
- **Fair policy comparisons**: All five scheduling policies (CloudFlow Adaptive, Latency-First, Cost-First, Carbon-First, and Default Round-Robin) evaluated consecutively over identical synthetic arrival traces.
- **Reproducibility guarantees**: Complete provenance tracking (Git commit hash, Node environment, seed seeds, and hardware architecture).

---

## 2. Mathematical & Statistical Foundations

### 2.1 Avoidance of Jensen's Inequality Fallacy (Pooled Quantiles)
A common statistical flaw in systems benchmarking is computing P95 latency per seed run and subsequently taking the arithmetic mean of those P95 values:
$$\mathbb{E}[P_{95}] \ne P_{95}(\bigcup X_i)$$
Because percentile operators are non-linear and typically convex in queueing systems, Jensen's inequality dictates that averaging percentiles introduces systematic bias.

The CLI runner solves this by concatenating all raw individual request latencies across all $k$ seeds into a pooled population vector $L_{\text{pooled}} = [l_1, l_2, \dots, l_{N \times k}]$ and computing true empirical population quantiles:
$$P_q = \text{Quantile}(L_{\text{pooled}}, q), \quad q \in \{50, 90, 95, 99\}$$
Both the true pooled $P_{95}$ and the sample mean of per-seed $P_{95}$ values are reported for complete transparency.

### 2.2 Paired Student's t-Tests
Because all policies are evaluated against the *exact same* synthetic request stream for any given seed $s$, measurements across policies are paired. The runner computes paired differences:
$$D_i = X_{\text{adaptive}, i} - X_{\text{baseline}, i}, \quad i = 1, \dots, k$$
$$\bar{D} = \frac{1}{k}\sum_{i=1}^k D_i, \quad s_D = \sqrt{\frac{1}{k-1}\sum_{i=1}^k (D_i - \bar{D})^2}$$
$$t = \frac{\bar{D}}{s_D / \sqrt{k}}, \quad \text{df} = k - 1$$

### 2.3 Holm-Bonferroni FWER Correction
To prevent Type I error inflation arising from evaluating 4 baseline comparisons across 7 metrics ($m = 28$ hypothesis tests per workload pattern), the runner applies the step-down Holm-Bonferroni procedure:
$$p_{(1)} \le p_{(2)} \le \dots \le p_{(m)}$$
$$p_{\text{adj}, (i)} = \min\left(1, \max_{j \le i} \left[(m - j + 1) p_{(j)}\right]\right)$$
Significance is rejected at Family-Wise Error Rate $\alpha = 0.05$.

### 2.4 Standardized Effect Sizes (Cohen's $d_z$)
To quantify practical significance independent of sample size:
$$d_z = \frac{|\bar{D}|}{s_D}$$
- **$|d_z| < 0.2$**: Negligible effect
- **$0.2 \le |d_z| < 0.5$**: Small effect
- **$0.5 \le |d_z| < 0.8$**: Medium effect
- **$|d_z| \ge 0.8$**: Large effect

---

## 3. Command-Line Reference

### 3.1 Invocation
You can invoke the runner via `npm run research` or directly with `node scripts/research-runner.ts`:

```bash
# Via npm script
npm run research -- [options]

# Directly with Node (Node.js 22.6+ / 24+ with native TypeScript support)
node scripts/research-runner.ts [options]
```

### 3.2 Options and Flags

| Option | Shorthand | Type | Default | Description |
|---|---|---|---|---|
| `--workload <type>` | `-w` | `string` | `all` | Workload pattern to evaluate: `steady`, `poisson`, `bursty`, or `all`. |
| `--requests <num>` | `-r` | `number` | `1000` | Number of synthetic requests generated per seed (e.g. `1000`, `5000`, `10000`, `50000`). |
| `--seeds <num>` | `-s` | `number` | `30` | Number of paired pseudo-random seeds ($k \ge 30$ recommended for Central Limit Theorem). |
| `--seed-start <num>` | | `number` | `4200` | Starting integer for the deterministic seed sequence (`seedStart .. seedStart + seeds - 1`). |
| `--sla <num>` | | `number` | `250` | SLA latency threshold in milliseconds. |
| `--duration <num>` | | `number` | `15` | Total simulated workload duration in minutes. |
| `--max-instances <num>` | `-M` | `number` | `10` | Maximum concurrent container instances allowed per candidate pool. |
| `--output-dir <path>` | `-o` | `string` | `research-results` | Root output directory where benchmark artifacts are stored. |
| `--include-traces` | | `flag` | `false` | When set, exports a representative sample of individual request-level execution traces to CSV. |
| `--quiet` | `-q` | `flag` | `false` | Suppresses real-time console progress bars and status summaries. |
| `--run-id <name>` | | `string` | *(auto-generated)* | Custom subdirectory name for the benchmark run. |
| `--help` | `-h` | `flag` | `false` | Displays CLI syntax and flag descriptions. |

---

## 4. Execution Examples

### 4.1 Quick Sanity Run (5 Seeds, 100 Requests)
```bash
node scripts/research-runner.ts --workload steady --requests 100 --seeds 5 --include-traces --run-id sanity-check
```

### 4.2 Standard Research Paper Benchmark (30 Seeds, 1K Requests, All Workloads)
```bash
node scripts/research-runner.ts --workload all --requests 1000 --seeds 30 --sla 250 --output-dir research-results
```

### 4.3 High-Throughput Stress Evaluation (30 Seeds, 10K Requests, Bursty)
```bash
node scripts/research-runner.ts --workload bursty --requests 10000 --seeds 30 --duration 30 --sla 250
```

### 4.4 Large-Scale Evaluation (50K Requests)
For $50\text{K}$ request simulations, allocate additional Node.js heap memory to accommodate full request-level trace structures:
```bash
node --max-old-space-size=4096 scripts/research-runner.ts --workload poisson --requests 50000 --seeds 30 --run-id scale-50k-poisson
```

---

## 5. Output Artifacts

Every benchmark execution creates an isolated directory:
`research-results/<run-id>/`

Inside the directory, four standardized artifacts are generated:

### 5.1 `benchmark-summary.json`
Comprehensive machine-readable JSON object containing:
- Complete execution metadata (run ID, timestamp, seed sequence, duration).
- Workload-level aggregated performance metrics.
- Pooled request quantiles ($P_{50}, P_{90}, P_{95}, P_{99}$) for all 5 policies.
- Full paired t-test results, Holm-Bonferroni adjusted p-values, degrees of freedom, and Cohen's $d_z$ effect sizes.

### 5.2 `policy-comparison.csv`
RFC-4180 compliant CSV document divided into distinct sections:
1. **Benchmark Execution Manifest**: Run parameters, Git commit, Node version, platform.
2. **Pooled Latency Quantiles**: True population quantiles versus sample means.
3. **Comprehensive Descriptive Statistics**: Mean, median, variance, standard deviation, standard error, and 95% confidence intervals for Cost, Carbon, Latency, P95 Latency, Cold Start Rate, SLA Violations, and Overhead.
4. **Paired Hypothesis Testing**: Raw p-values, adjusted p-values, test statistics, and effect magnitudes.

### 5.3 `reproducibility-manifest.json`
Provides an empirical audit trail for scientific peer review:
```json
{
  "manifestVersion": "1.0",
  "title": "CloudFlow Reproducibility Manifest",
  "runId": "benchmark-2026-11-10_14-30-00-all-r1000-s30",
  "gitCommit": "ffd06bc40f025087de398312c04e549b3426d1fd",
  "nodeVersion": "v26.8.1",
  "hardwarePlatform": "win32-x64",
  "experimentalParameters": {
    "workloadPatterns": ["Steady", "Poisson", "Bursty"],
    "requestsPerSeed": 1000,
    "seedCount": 30,
    "seedSequence": [4200, 4201, "..."],
    "slaLatencyThresholdMs": 250,
    "adaptiveWeights": { "alpha": 0.35, "beta": 0.25, "gamma": 0.25, "delta": 0.15 }
  },
  "reproductionCommand": "npm run research -- --workload all --requests 1000 --seeds 30 --seed-start 4200 --sla 250"
}
```

### 5.4 `sample-traces.csv` *(Optional)*
Generated when `--include-traces` is specified. Contains granular per-request traces from the first seed run of the adaptive policy:
- `Workload`
- `RequestId`
- `ArrivalTimeMs`
- `ExecutionDurationMs`
- `SelectedCandidate`
- `WasCold`
- `QueueDelayMs`
- `TotalLatencyMs`
- `ViolatedSLA`

---

## 6. Sensitivity Analysis CLI Runner (`scripts/sensitivity-runner.ts`)

In addition to the standard benchmark runner, CloudFlow includes a multi-dimensional Sensitivity Analysis CLI runner to explore the parameter space across weights, SLA thresholds, and workload arrival patterns.

### 6.1 Invocation Commands
```bash
# Full sensitivity sweep across weights, SLA thresholds, and workloads (30 seeds, 1,000 requests/seed)
npm run sensitivity

# Specific dimension sweep: Adaptive objective weights sensitivity (10 seeds, 500 requests/seed)
node scripts/sensitivity-runner.ts --mode weights --requests 500 --seeds 10

# SLA threshold sweep across tight and loose bounds (150ms, 250ms, 400ms, 600ms)
node scripts/sensitivity-runner.ts --mode sla --slas 150,250,400,600 --requests 1000 --seeds 30

# Workload traffic sensitivity across Steady, Poisson, and Bursty
node scripts/sensitivity-runner.ts --mode workloads --requests 1000 --seeds 30
```

### 6.2 Supported CLI Flags
| Flag | Description | Default |
| :--- | :--- | :--- |
| `--mode, -m, --dimension` | Dimension: `weights`, `sla`, `workloads`, or `full` | `full` |
| `--requests, -r` | Request count per random seed | `1000` |
| `--seeds, -s` | Number of paired random seeds ($k$) | `30` |
| `--seed-start` | Initial seed index | `4200` |
| `--slas` | Comma-separated SLA latency thresholds in ms | `150,250,400,600` |
| `--weights, -w` | Comma-separated weight presets or `all` | `all` |
| `--workload` | Arrival pattern: `steady`, `poisson`, `bursty`, or `all` | `all` |
| `--output-dir, -o` | Directory for persisted artifacts | `research-results` |
| `--quiet, -q` | Suppress interactive console output | `false` |

### 6.3 Output Artifacts
Every run writes four artifacts to `research-results/<run-id>/`:
1. `sensitivity-summary.json`: Complete hierarchical data structure with all parameters, metrics, quantiles, and hypothesis tests.
2. `sensitivity-results.csv`: RFC-4180 compliant CSV table ready for import into R, pandas, or Excel.
3. `sensitivity-manifest.json`: Full reproducibility metadata including Git SHA, Node version, platform, PRNG seed sequence, and candidate specs.
4. `sensitivity-report.md`: Formatted GitHub Markdown report with executive summary, KaTeX formulas, tables, trade-off analysis, and disclaimers.

---

## 7. Verification and Automated Testing

The headless CLI runners are covered by automated unit and integration tests located in `tests/research-runner.test.ts` and `tests/sensitivity-analysis.test.ts`.

To verify CLI runner behavior:
```bash
# Run research runner tests
node --test tests/research-runner.test.ts

# Run sensitivity analysis tests
node --test tests/sensitivity-analysis.test.ts
```

The test suites validate:
1. **CLI Argument Parsing**: Flags, default parameter values, and error handling for invalid options.
2. **Trace Parity & Multi-Policy Invocations**: Verifies all 5 policies process identical arrival traces per seed.
3. **Bitwise Reproducibility**: Identical configs with identical seeds produce matching metrics.
4. **Pooled Quantile Ordering**: Confirms $P_{50} \le P_{90} \le P_{95} \le P_{99}$.
5. **Statistical Correction**: Confirms paired t-tests and Holm-Bonferroni corrections function within theoretical bounds.
6. **Artifact Generation**: Verifies JSON, CSV, manifest, and markdown report files are correctly emitted and conform to expected schemas.

---

## 8. Model Assumptions & Limitations

All results generated by the Headless Research CLI represent **deterministic model-based simulation results calibrated against empirical cloud provider characteristics** (AWS Lambda, Google Cloud Functions, Azure Functions), rather than physical multi-tenant hypervisor measurements. For detailed simulation assumptions, container lifecycle states, and concurrency queueing models, refer to [RESEARCH_METHODOLOGY.md](./RESEARCH_METHODOLOGY.md).
