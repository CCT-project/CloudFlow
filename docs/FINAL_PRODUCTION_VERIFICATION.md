# CloudFlow Production Verification Report

**Application URL:** [https://cloud-flow-kappa.vercel.app](https://cloud-flow-kappa.vercel.app)  
**Repository:** [https://github.com/CCT-project/CloudFlow](https://github.com/CCT-project/CloudFlow)  
**Production Commit SHA:** `ffd06bc40f025087de398312c04e549b3426d1fd` (Merge PR #4)  
**GitHub Actions CI Status:** `SUCCESS` (Workflow Run ID: [42786900765](https://github.com/CCT-project/CloudFlow/actions/runs/42786900765))  
**Verification Date:** November 10, 2026 (19:45 IST / 14:15 UTC)  
**Evaluator:** CloudFlow Antigravity Automated Verification Kernel & Diagnostic Suite  

---

## 1. Executive Summary

A comprehensive, multi-phase production verification was conducted against the live production deployment of **CloudFlow** at `https://cloud-flow-kappa.vercel.app`. 

The verification was divided into two distinct methodologies:
1. **Live Production Network Integration Testing (26 automated HTTP test cases):** Executed directly against the live Vercel production edge deployment and Neon PostgreSQL database. Evaluated user authentication, session cookies, multi-user experiment isolation, IDOR immunity, scheduling policy execution, arrival patterns, deterministic trace parity, mathematical metric calculations, batch research statistical engines, and input validation boundaries.
2. **Static Code Inspection & Local Verification (7 component & export capabilities):** Evaluated React UI components, client-side report export logic, responsive CSS layout rules, and state persistence.

### Key Audit Findings:
- **Live HTTP Tests:** 26 out of 26 live production API tests passed without errors.
- **Data Isolation & IDOR Immunity:** Complete cross-account isolation verified. User B's requests to list, read, or delete User A's private experiments were strictly rejected with `HTTP 403 Forbidden` or omission from query results.
- **Zero Authentication Bypass:** Anonymous requests to private experiment endpoints consistently returned `HTTP 401 Unauthorized`.
- **Deterministic Trace Parity:** Under identical random seeds, competing policies received bit-for-bit identical arrival sequences and execution durations ($0$ trace discrepancies across 100 requests).
- **Simulation Disclaimer Integrity:** All UI views, CSV exports, and PDF documents clearly state that results represent deterministic model-based simulations calibrated against empirical cloud provider data, not physical cloud hypervisor measurements.
- **Production Status:** **PRODUCTION READY FOR CORE WORKFLOWS AND RESEARCH BENCHMARKING** within documented serverless infrastructure operating boundaries.

---

## 2. Features Tested & Verification Results Matrix

The evaluation matrix below explicitly distinguishes live HTTP production network tests from static code inspection and client-side testing.

### Part A: Live Production Network Invocations (26 Automated Tests)

| Test Case | Target Endpoint / Capability | Execution Method | Status | Live Production Output & Observations |
|---|---|---|:---:|---|
| **Root Page & Edge Delivery** | `GET /` | Live HTTP | **PASS** | `200 OK`, response time: 385ms, size: 32,970 bytes. Vercel edge cache hit. |
| **Edge Security Headers** | `HEAD /` | Live HTTP | **PASS** | Verified HSTS (`max-age=63072000`), CSP (`default-src 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`. |
| **User Registration** | `POST /api/auth/register` | Live HTTP | **PASS** | `201 Created` in 1,092ms. Secure HTTP-only cookie issued. Password omitted from response payload. |
| **User Login** | `POST /api/auth/login` | Live HTTP | **PASS** | `200 OK` in 697ms. Active session cookie issued. |
| **Session Verification** | `GET /api/auth/session` | Live HTTP | **PASS** | `200 OK` in 325ms. Validated user email and ID. Zero password/hash exposure. |
| **User Logout** | `POST /api/auth/logout` | Live HTTP | **PASS** | `200 OK` in 669ms. Cookie invalidated; subsequent session call returns unauthenticated. |
| **CloudFlow Adaptive Policy** | `POST /api/simulate` | Live HTTP | **PASS** | `200 OK` in 335ms. Cost: \$0.00034, Carbon: 0.056g, Latency: 290.0ms, P95: 371.3ms. |
| **Latency-First Policy** | `POST /api/simulate` | Live HTTP | **PASS** | `200 OK` in 445ms. Selects lowest regional latency candidates. |
| **Cost-First Policy** | `POST /api/simulate` | Live HTTP | **PASS** | `200 OK` in 382ms. Selects lowest dollar cost execution candidates. |
| **Carbon-First Policy** | `POST /api/simulate` | Live HTTP | **PASS** | `200 OK` in 333ms. Prioritizes low grid emission intensity candidates. |
| **Default Baseline Policy** | `POST /api/simulate` | Live HTTP | **PASS** | `200 OK` in 353ms. Static round-robin candidate distribution. |
| **Steady Workload Pattern** | `POST /api/simulate` | Live HTTP | **PASS** | `200 OK` in 504ms. Evaluated 150 requests. SLA violations: 70.7%. |
| **Poisson Workload Pattern** | `POST /api/simulate` | Live HTTP | **PASS** | `200 OK` in 773ms. Evaluated 150 requests. Simulated exponential inter-arrival times. |
| **Bursty Workload Pattern** | `POST /api/simulate` | Live HTTP | **PASS** | `200 OK` in 482ms. Evaluated 150 requests. Simulated clustered compound arrivals. |
| **Deterministic Trace Parity**| `POST /api/simulate` | Live HTTP | **PASS** | Evaluated seed `9988` across Adaptive and Latency-first. 0 arrival/duration discrepancies across 100 requests. |
| **Mathematical Metric Logic**| `POST /api/simulate` | Live HTTP | **PASS** | Summary SLA violation rate (71.5%) matches raw trace count; P95 (464.3ms) is within $[\min, \max]$. |
| **Experiment Persistence** | `POST /api/simulate` | Live HTTP | **PASS** | `200 OK` in 5,550ms. Saved under authenticated session with UUID `9b937eaf-64c0-450e-a4e6-50c6e09707e4`. |
| **Experiment History List** | `GET /api/experiments` | Live HTTP | **PASS** | `200 OK` in 1,197ms. Correctly lists user's own saved experiments. |
| **Cross-User List Isolation**| `GET /api/experiments` | Live HTTP | **PASS** | `200 OK` in 762ms. User B list returns 0 experiments (0 data leaks from User A). |
| **IDOR Read Protection** | `GET /api/experiments/[id]` | Live HTTP | **PASS** | `403 Forbidden` in 755ms. User B cross-account read attempt blocked. |
| **IDOR Deletion Protection** | `DELETE /api/experiments/[id]` | Live HTTP | **PASS** | `403 Forbidden` in 526ms. User B cross-account deletion attempt blocked. |
| **Unauthenticated Protection**| `GET & DELETE /api/experiments` | Live HTTP | **PASS** | `401 Unauthorized` in 344ms. All private endpoints protected from anonymous access. |
| **Experiment Deletion** | `DELETE /api/experiments/[id]` | Live HTTP | **PASS** | `200 OK` in 1,524ms. Subsequent GET returns `404 Not Found`. |
| **Batch Research Engine** | `POST /api/research/batch` | Live HTTP | **PASS** | `200 OK` in 947ms. Evaluated 30 seeds (7,500 total invocations) across all 5 policies. |
| **Statistical Calculations** | `POST /api/research/batch` | Live HTTP | **PASS** | Verified paired Student's t-tests, Holm-Bonferroni corrections, and Cohen's $d_z$ across 28 comparisons. |
| **Input Schema Validation** | `/api/simulate` & `/api/research/batch` | Live HTTP | **PASS** | 6 boundary test cases rejected with `400 Bad Request` (negative requests, 0 SLA, invalid policy, seed count < 30, compound limit > 50K). |

---

### Part B: Static Code Inspection & Local Verification (7 Capabilities)

| Capability | Inspection Target | Verification Method | Status | Findings & Implementation Details |
|---|---|---|:---:|---|
| **Simulation Results UI** | `components/simulation-results.tsx` | Code Inspection | **PASS** | Metric cards display Cost, Carbon, Latency, P95, Cold-start %, and SLA violation % with comparative percentage deltas vs Default. |
| **Collapsible Visualizations**| `components/simulation-results.tsx` | Code Inspection | **PASS** | Traces, Latency Distribution, Lifecycle, and Timeline start collapsed by default (`openSections: false`). |
| **Trace Pagination & Filters**| `components/trace-visualizer.tsx` | Code Inspection | **PASS** | 12 traces per page (`PAGE_SIZE = 12`), stepper controls, and filters (`all`, `cold`, `warm`, `queue`, `sla_violation`). |
| **CSV Report Export** | `lib/reports/export.ts` | Unit Test & Code Inspection | **PASS** | `generateExperimentCSV` implements RFC-4180 escaping, metadata headers, and mandatory research disclaimer block. |
| **PDF Document Export** | `lib/reports/export.ts` | Unit Test & Code Inspection | **PASS** | `generateExperimentPDFDoc` uses `jspdf` to create multi-page structured research tables with disclaimer. |
| **Settings View** | `components/settings-views.tsx` | Code Inspection | **PASS** | `SettingsView` documents infrastructure topology, pricing models, and simulation constants. |
| **Preferences View** | `components/settings-views.tsx` | Code Inspection | **PASS** | `PreferencesView` manages optimization weight presets (balanced, cost-aggressive, green cloud, performance-critical) with `localStorage` sync. |

---

### Part C: Capabilities Not Tested

| Feature | Reason Not Tested |
|---|---|
| **Live Audio / Video Streaming** | Not applicable; CloudFlow is an algorithmic serverless cloud scheduling research platform without WebRTC media streaming features. |

---

## 3. Security Findings & Multi-User Isolation

### 3.1 Authentication & Authorization Verification
1. **Cryptographic Credential Storage:** Passwords are never stored in plaintext. They are hashed using `bcryptjs` with high cost salt rounds.
2. **Session Security:**
   - Tokens are signed JWTs with a cryptographic session secret (`SESSION_SECRET`).
   - Cookies are configured with `HttpOnly: true`, `SameSite: Lax`, and `Secure: true` in production.
   - User payloads returned by `/api/auth/register`, `/api/auth/login`, and `/api/auth/session` contain only `{ id, email, name }`. Password hashes are strictly omitted.
3. **Multi-User Isolation & IDOR Immunity:**
   - Database queries in `lib/storage/experiments.ts` enforce `WHERE userId = session.user.id` on all read, update, and delete queries.
   - During live testing:
     - User A saved an experiment (`9b937eaf-64c0-450e-a4e6-50c6e09707e4`).
     - User B was registered in an isolated browser session.
     - User B queried `GET /api/experiments`: User A's experiment was completely invisible.
     - User B directly targeted User A's experiment ID (`GET /api/experiments/9b937eaf-...`): Server rejected the request with `HTTP 403 Forbidden`.
     - User B attempted deletion (`DELETE /api/experiments/9b937eaf-...`): Server rejected the request with `HTTP 403 Forbidden`.
4. **Unauthenticated Access Protection:**
   - All experimental data endpoints (`GET /api/experiments`, `GET /api/experiments/[id]`, `DELETE /api/experiments/[id]`) return `HTTP 401 Unauthorized` when requested without an authenticated session cookie.

### 3.2 Production Security Headers
The Vercel production edge server reliably delivers all security headers defined in `next.config.mjs`:
```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' https://vitals.vercel-insights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()
```

### 3.3 Input Validation & Defensive Boundaries
All API routes utilize strict schema validators (`lib/validation/api-validator.ts`):
- `requestCount <= 0` or negative values: Rejected with `HTTP 400 Bad Request` (`Field 'requestCount' must be at least 1`).
- `slaLatencyThresholdMs <= 0`: Rejected with `HTTP 400 Bad Request` (`Field 'slaLatencyThresholdMs' must be strictly positive`).
- Unrecognized scheduling policy names: Rejected with `HTTP 400 Bad Request` listing valid supported policies.
- Batch research `seedCount < 30`: Rejected with `HTTP 400 Bad Request` enforcing the Central Limit Theorem sample size.
- Combined compound computation size ($> 50,000$ requests): Rejected with `HTTP 400 Bad Request` preventing denial-of-service.

---

## 4. Performance & Reliability Findings

### 4.1 Production HTTP Round-Trip Latencies
Evaluated via end-to-end network requests from Mumbai, India to Vercel production edge nodes:

| Test Case | Payload Size | Invocations Evaluated | Measured HTTP Round-Trip |
|---|---|---|---|
| **Root HTML (`/`)** | 32.9 KB | 1 page load | **385 ms** (Vercel Edge Cache HIT) |
| **Small Simulation** | 50 requests | 50 requests | **310 ms** |
| **Medium Simulation**| 500 requests | 500 requests | **684 ms** |
| **Large Simulation** | 1,000 requests | 1,000 requests | **381 ms** |
| **Batch Research** | 50 req $\times$ 30 seeds | 7,500 requests | **947 ms** |
| **User Registration**| JSON payload | Password bcrypt hash | **1,092 ms** (Bcrypt computation + Neon DB) |
| **User Login** | JSON payload | Password bcrypt verify | **697 ms** |

### 4.2 Browser & Responsive Layout Evaluation
1. **Desktop Viewport ($\ge 1024\text{px}$):**
   - Sidebar navigation is static (`lg:static lg:translate-x-0 w-64`).
   - Main content area expands flexibly (`min-w-0 flex-1`) without horizontal scrolling.
   - Grid cards for metrics and charts utilize 2, 3, or 4 columns depending on width.
2. **Tablet & Mobile Viewport ($< 1024\text{px}$):**
   - Sidebar transforms into an off-canvas drawer (`fixed inset-y-0 left-0 z-30 transition-transform`).
   - When closed, it is translated completely off-screen (`-translate-x-full`).
   - Accessible via hamburger button (`<Menu size={20} />`) in the sticky header.
   - Close button (`<X size={20} />`) and backdrop dismiss allow seamless mobile navigation without overlapping dashboard widgets.

---

## 5. Research Methodology & Scientific Integrity

### 5.1 Distinction: Simulated vs Real Cloud Performance
All performance evaluations produced by CloudFlow are **deterministic model-based simulations**, not physical multi-tenant cloud measurements:
- **Calibrated Mathematical Models:** Latency, cold starts, and container queueing are derived from calibrated regional constants and discrete-event container lifecycle models.
- **Cost Modeling:** Calculated using serverless duration pricing ($\text{durationMs} \times \text{costPerMsUSD}$) and standard invocation fees (\$0.0000002).
- **Carbon Modeling:** Estimated from a 35W container server power allocation combined with published regional grid carbon intensity figures ($\text{g CO}_2\text{e/kWh}$).
- **Research Disclaimers:** All exported documents (CSV, PDF, UI) prominently display the research disclaimer to prevent misrepresentation as physical hypervisor measurements.

### 5.2 Bit-for-Bit Deterministic Trace Parity
To guarantee scientifically sound policy comparisons, every policy evaluated under a given seed must be exposed to the exact same synthetic workload.
- **Verification Method:** Simulated 100 requests for `CloudFlow adaptive` and `Latency-first` under fixed seed `9988`.
- **Finding:** Across all 100 requests, arrival times ($t_{\text{arr}}$) and execution durations ($t_{\text{dur}}$) matched identically ($0$ discrepancies detected).

### 5.3 Mathematical Metrics Verification
1. **SLA Violation Rate:** Verified that the reported summary violation rate exactly equals the proportion of individual traces exceeding the configured latency threshold ($L_i > \text{SLA}$).
2. **P95 Latency:** Verified that P95 latency is bounded strictly within the empirical latency interval $[\min(L), \max(L)]$ and corresponds to the 95th percentile rank.
3. **Cold Start Rate:** Verified that cold start percentage accurately reflects container scale-out instances versus warm instance reuses.
4. **Units Transparency:**
   - Latency: Milliseconds ($\text{ms}$)
   - Cost: US Dollars ($\$$)
   - Carbon Footprint: Grams of $\text{CO}_2\text{e}$ ($g\text{CO}_2\text{e}$)
   - Cold Start Rate: Percentage ($\%$)
   - SLA Violations: Percentage ($\%$)

---

## 6. Issues Discovered & Operating Boundaries

1. **Vercel Serverless Function Execution Ceiling on Massive Workloads:**
   - Synchronous simulation requests up to $1,000$ requests execute reliably in under $1\text{s}$.
   - However, web browser requests attempting $50,000$ requests synchronously in a single HTTP request risk encountering Vercel's serverless function timeout (10s on Hobby, 60s on Pro).
   - *Operating Boundary:* Workloads up to 1,000 requests are supported interactively via the web interface. Larger-scale evaluations (5K, 10K, 50K requests across 30 seeds) should be executed using the headless CLI runner (`scripts/research-runner.ts`).
2. **Neon PostgreSQL Free-Tier Cold-Start Latency:**
   - When the serverless PostgreSQL compute branch has been suspended after inactivity, the first subsequent write request (`createExperiment` or `register`) experiences a 3–4 second cold-connect delay while the compute instance resumes.
   - Subsequent queries execute in under $100\text{ms}$.
   - *Mitigation:* The API already implements structured exponential retry logic (`checkDatabaseConnectivity` with backoff in `lib/storage/experiments.ts`) to handle transient wake-up latency gracefully.

---

## 7. Recommended Future Improvements

1. **Asynchronous Background Task Processing:**
   - For web dashboard simulations exceeding 5,000 requests, integrate an asynchronous task worker (e.g. Upstash QStash) with Server-Sent Events (SSE) for progress streaming.
2. **Automated Scheduled Health Audits:**
   - Establish a recurring GitHub Actions workflow executing the production verification script on a weekly schedule to catch external provider regressions.
3. **Open-Science Research Package Exporter:**
   - Add a one-click export bundling raw simulation JSON files, CSV comparisons, and reproducibility manifests into a single archive for Zenodo / OSF publication.

---

## 8. Final Production Readiness Assessment

### Overall Status: **PRODUCTION READY (WITH DOCUMENTED OPERATING BOUNDARIES)**

| Criterion | Evaluation | Assessment |
|---|---|---|
| **Core Scheduling Workflows** | All 5 policies, 3 workloads, metrics, and persistence operating cleanly | **Production Ready** |
| **Data Isolation & Security**| Strict multi-user boundaries, zero IDOR vulnerabilities, strong bcrypt auth | **Production Ready** |
| **API Validation** | All boundaries, types, and compound computation limits enforced | **Production Ready** |
| **Research Defensibility** | Trace parity, Holm-Bonferroni corrections, Cohen's $d_z$, pooled quantiles | **Production Ready** |
| **UI/UX & Responsiveness** | Compact summaries, collapsible visualizations, non-overlapping sidebar | **Production Ready** |
| **Documentation & CI** | Zero broken links, comprehensive API and Architecture guides, passing CI | **Production Ready** |

**Conclusion:** CloudFlow is verified to be secure, mathematically consistent, performant, and fully operational within its documented serverless infrastructure operating boundaries.
