# CloudFlow Assumptions, System Limitations & Future Work

This document provides a transparent, scientifically grounded evaluation of the assumptions, simulation boundaries, and known limitations of CloudFlow, alongside planned research opportunities.

---

## 1. Current Simulator Limitations

> [!IMPORTANT]
> **Primary Scientific Boundary:**
> CloudFlow operates as a **discrete-event trace simulator** calibrated against empirical cloud provider characteristics reported in top-tier computer systems literature (e.g., Wang et al., ASPLOS; Shahrad et al., USENIX ATC Serverless Trace). It does **not** execute live hypervisor-level virtualization calls against physical AWS, GCP, or Azure infrastructure in its standard evaluation suite.

1. **Synthetic Clock Progression:** Discrete time advances monotonically based on scheduled event completions. It does not experience operating system thread scheduling jitter, kernel context-switch interruptions, or host CPU clock frequency scaling.
2. **Synchronous Serverless Edge Limits:** Interactive API requests (`/api/research/batch`) enforce a compound boundary of `seedCount * requestCount <= 50,000` to prevent HTTP timeouts within serverless edge runtimes (e.g., Vercel's 60-second function ceiling). Massive-scale stress benchmarks require offline CLI batch execution.
3. **Single Decision Point:** Scheduling decisions are evaluated centrally per request. In a globally distributed physical deployment, distributed scheduling proxies would be required, introducing peer consensus latency.

---

## 2. Assumptions in Workload Generation

1. **Log-Normal Execution Runtimes:** Task execution times are modeled as $t_{\text{exec}} \sim \text{Lognormal}(\mu=4.38, \sigma=0.55)$ clipped to $[15\text{ ms}, 950\text{ ms}]$. While consistent with published serverless trace distributions, real workloads exhibit multi-modal runtime profiles with long computational tails.
2. **Homogeneous Request Payloads:** The simulator assumes uniform CPU utilization across execution runtimes. Real-world applications vary between I/O-bound database queries, memory-intensive data processing, and compute-heavy cryptographic tasks.
3. **Stationary Arrival Rates:** Arrival intensity $\lambda$ remains stationary within a given evaluation phase, rather than exhibiting diurnal 24-hour day/night cycles or seasonal traffic drift.

---

## 3. Cloud Provider & Regional Limitations

1. **Fixed Candidate Topologies:** The candidate pool models four fixed regional nodes:
   - AWS Lambda us-east-1 (Virginia, USA)
   - AWS Lambda eu-west-1 (Dublin, Ireland)
   - GCP us-central1 (Iowa, USA)
   - Azure westeurope (Amsterdam, Netherlands)
   Arbitrary custom regional topologies are not dynamically configurable through the user interface.
2. **Simplified Network RTT:** Network latency is modeled using baseline geographical round-trip time + Gaussian noise ($15\text{ ms} \to 85\text{ ms}$). Physical transit suffers from BGP route flap, packet drops, ISP peering congestion, and cross-continental fiber degradation.
3. **Billing Simplifications:** Billed costs reflect public on-demand list prices under discrete 100ms billing tiers. The model does not include enterprise Compute Savings Plans, annual volume discounts, AWS Graviton architecture discounts, or free tier allowances.

---

## 4. Carbon Estimation Limitations

1. **Static Regional Grid Intensities:** Grid emission factors ($160 \to 485\text{ gCO}_2\text{eq/kWh}$) are modeled as static regional averages derived from historical Electricity Maps and IEA datasets. In reality, marginal grid emissions vary minute-by-minute based on real-time grid dispatch merit order, solar irradiance, and wind generation.
2. **Average Container Power Modeling:** Serverless power consumption is modeled at a constant 35W per active vCPU core equivalent, with 2W idle power draw. Real CPU power fluctuates dynamically with frequency scaling, AVX instruction use, and memory bus utilization.
3. **Exclusion of Scope 3 Embodied Carbon:** The model calculates Scope 2 operational electricity carbon only. Scope 3 embodied carbon from server manufacturing, silicon fabrication, and data center physical infrastructure is currently excluded.

---

## 5. Cold-Start Modeling Limitations

1. **Stochastic Log-Normal Initialization:** Container cold starts are modeled with baseline initialization latency + log-normal stochastic delay ($180\text{ ms} \to 340\text{ ms}$).
2. **Omission of Hypervisor Contention:** The model does not simulate host hypervisor CPU throttling, Linux cgroup memory reclaim thrashing, container image layer unpack delays, or VPC Elastic Network Interface (ENI) attachment latency.
3. **Uniform Language Runtimes:** All candidates model a generic lightweight Node.js/Go runtime. Heavy runtimes (e.g. JVM, Python with large ML dependencies) with several-second initialization delays are not modeled.

---

## 6. SLA Modeling Limitations

1. **Hard Latency Threshold ($T_{\text{SLA}}$):** SLA compliance is evaluated as a binary step function ($L_i \le T_{\text{SLA}}$). Industrial service contracts frequently define multi-tiered SLAs (e.g. $P_{99} \le 500\text{ms}$ and $P_{95} \le 300\text{ms}$) with progressive financial penalty tiers.
2. **Single-Metric SLA:** The SLA contract is restricted to turnaround latency. Availability SLAs (error rates, HTTP 5xx failures) and throughput SLAs are not currently factored into feasibility filtering.

---

## 7. Future Research Opportunities

1. **Physical Multi-Cloud Testbed Harness:**
   - Develop an automated worker agent that deploys identical Node.js and Python benchmark functions to actual AWS Lambda, Google Cloud Run, and Azure Functions accounts.
   - Run parallel live invocations to validate simulated trade-offs against physical telemetry.
2. **Dynamic Electricity Maps API Integration:**
   - Fetch real-time marginal carbon intensity data via live API endpoints (Electricity Maps / WattTime), enabling dynamic temporal and spatial workload shifting.
3. **Machine Learning Arrival Predictors:**
   - Integrate an online LSTM or Transformer-based workload arrival predictor to anticipate burst traffic and pre-warm container instances prior to burst arrival.
4. **Contextual Bandit Weight Auto-Tuning:**
   - Implement reinforcement learning algorithms (e.g. contextual multi-armed bandits) to dynamically tune objective weights ($\alpha, \beta, \gamma, \delta$) based on observed SLA violation rates.
