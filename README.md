# CloudFlow

> **CloudFlow: Adaptive Serverless Scheduling for Cost Efficiency, Carbon Awareness, and SLA Compliance.**  
> *Smarter Scheduling. Efficient Execution. Sustainable Cloud.*

CloudFlow is a research-ready adaptive serverless scheduling framework and evaluation platform designed to optimize multi-objective trade-offs across execution cost, regional carbon emissions, latency percentiles, and strict SLA compliance.

---

## 🎯 Research Objectives

CloudFlow addresses the trade-offs of modern serverless computing across distributed regional environments:

1. **SLA Compliance First:** Enforce latency thresholds ($L_{\text{est}} \le L_{\text{SLA}}$) before ranking candidate cloud options.
2. **Cost Efficiency:** Model invocation, memory, CPU, and network transfer costs across compute tiers.
3. **Carbon Awareness:** Model regional marginal grid carbon intensity ($g\ \text{CO}_2\text{e}/\text{kWh}$) to minimize environmental footprint.
4. **Cold-Start Awareness:** Factor container initialization latency and idle container warm-pools into placement choices.

---

## 📐 Evaluated Metrics

- **Average Latency & P95 Latency (ms):** End-to-end response times including queueing and cold start.
- **Execution Cost ($):** Provider billing estimates per workload run.
- **Estimated Carbon Emissions ($g\ \text{CO}_2\text{e}$):** Energy consumption $\times$ regional grid carbon intensity.
- **Cold-Start Rate (%):** Frequency of cold container initializations.
- **SLA Violation Rate (%):** Percentage of requests exceeding configured latency thresholds.
- **Scheduling Overhead (ms):** Algorithmic computation time per scheduling decision.

---

## ⚖️ Scheduling Policies

1. **Latency-First:** Greedy selection minimizing estimated latency.
2. **Cost-First:** Greedy selection minimizing direct compute billing.
3. **Carbon-First:** Greedy selection minimizing operational carbon impact.
4. **Fixed / Default:** Static single-region baseline reflecting standard serverless deployments.
5. **CloudFlow Adaptive:** Two-stage decision rule: filters for SLA feasibility, then optimizes a normalized multi-objective utility function across eligible candidates.

---

## 🛠️ Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) 16 (App Router)
- **UI & Components:** [React](https://react.dev/) 19, [Tailwind CSS](https://tailwindcss.com/) v4, [Base UI / shadcn](https://ui.shadcn.com/), [Framer Motion](https://www.framer.com/motion/)
- **Visualizations:** [Recharts](https://recharts.org/)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Package Manager:** `pnpm`

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v20+ recommended)
- `pnpm` (or `npx pnpm`)

### Installation & Setup

```bash
# Clone the repository
git clone https://github.com/CCT-project/CloudFlow.git
cd CloudFlow

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Quality & Validation

```bash
# Type check TypeScript
pnpm typecheck

# Production build
pnpm build
```

---

## 📄 License

Academic / Research Project.
