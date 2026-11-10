# CloudFlow Testing & Verification Guide

This guide details the testing framework, test execution commands, unit testing, integration testing, API testing, security verification, TypeScript validation, Prisma schema checks, and production build validation implemented in CloudFlow.

---

## 1. Testing Framework Overview

CloudFlow uses **Node.js's native test runner (`node:test`)** with standard assertion libraries (`node:assert/strict`). This architecture provides significant benefits:
- **Zero Third-Party Test Dependencies:** No dependency on Jest, Mocha, or Vitest, eliminating version conflicts and transpilation overhead.
- **Maximum Execution Speed:** Executes all 23 test suites (~168 tests) in approximately 26 seconds directly on the Node.js runtime.
- **Cross-Platform Compatibility:** Runs identically on Windows (cmd/PowerShell), macOS (zsh), and Linux (bash/Ubuntu).

---

## 2. Available Test Commands

```bash
# Run all 182 automated tests across all 24 test suites
npm test
# Or with pnpm:
pnpm test

# Run a specific test suite file
node --test tests/adaptive.test.ts
node --test tests/multi-user-isolation-e2e.test.ts
node --test tests/batch-research.test.ts
node --test tests/research-runner.test.ts

# Run strict TypeScript typecheck (0 errors required)
npm run typecheck
# Or with pnpm:
pnpm typecheck

# Validate Prisma schema relations and syntax
npx prisma validate

# Run complete Next.js production build verification
npm run build
# Or with pnpm:
pnpm build

# Run non-destructive database verification script (requires .env)
npm run db:verify
```

---

## 3. Unit Testing

Unit test suites verify isolated mathematical formulas, pure scheduling algorithms, and workload generation without database or network dependencies:

- **`tests/adaptive.test.ts`:**
  - Validates that default objective weights ($\alpha, \beta, \gamma, \delta$) sum to 1.0.
  - Verifies rejection of negative weights, non-finite values, and invalid sums.
  - Tests Stage A SLA feasibility filter: confirms infeasible candidates are rejected despite lower cost or carbon.
  - Verifies documented shortfall fallback when zero candidates satisfy the SLA.
  - Validates safe normalization when candidate metrics are identical (zero division defense).
- **`tests/metrics.test.ts`:**
  - Verifies execution cost billing under discrete 100ms pricing tiers.
  - Verifies carbon calculations using active power, duration, regional carbon factor, and PUE.
  - Tests arithmetic mean latency and nearest-rank P95 percentile calculation.
  - Tests cold-start and SLA violation rate calculations.
- **`tests/simulation.test.ts`:**
  - Verifies deterministic Mulberry32 PRNG reproducibility: identical seeds produce identical traces.
  - Verifies different seeds generate statistically distinct random distributions.
  - Tests Steady, Poisson, and Bursty arrival process generation.
- **`tests/policies.test.ts`:**
  - Validates Latency-first, Cost-first, Carbon-first, and Default baseline decision rules under SLA feasibility.

---

## 4. Integration Testing

Integration test suites verify interactions between simulation components, container pools, and statistics engines:

- **`tests/concurrency-simulation.test.ts`:**
  - Verifies container pool concurrency limit ($M = 10$).
  - Tests instance reuse within the 10-minute idle Time-To-Live (TTL) window.
  - Simulates FIFO request queueing when candidate pools saturate under surge traffic.
  - Verifies idle container eviction after 600 seconds of inactivity.
- **`tests/comparison.test.ts`:**
  - Evaluates all five scheduling policies against identical synthetic request traces.
  - Verifies trade-off consistency: confirms that Cost-first minimizes cost, Carbon-first minimizes emissions, and Latency-first minimizes latency among feasible candidates.
- **`tests/research-statistics.test.ts`:**
  - Tests paired Student's $t$-test calculations and degrees of freedom ($df = k - 1$).
  - Verifies Holm-Bonferroni step-down $p$-value adjustments to control Family-Wise Error Rate (FWER) at $\alpha = 0.05$.
  - Tests Cohen's $d_z$ effect size classifications (*negligible, small, medium, large*).
- **`tests/analytics.test.ts`:**
  - Verifies request-weighted aggregation across experiments.
  - Validates pooled request-level P95 calculation across multi-seed runs.
  - Tests RFC-4180 CSV escaping compliance.
  - Tests jsPDF document generation.

---

## 5. API Testing

API test suites verify Next.js route handlers, schema validation, rate limits, and error formatting:

- **`tests/validation.test.ts`:**
  - Tests `/api/simulate` payload schema validation.
  - Rejects negative or zero request counts and enforces the 50,000 maximum boundary.
  - Rejects non-finite, negative, or missing SLA thresholds.
  - Validates `/api/schedule/evaluate` candidate list requirements.
- **`tests/batch-research.test.ts`:**
  - Tests `/api/research/batch` multi-seed execution engine.
  - Enforces minimum 30 distinct seeds for statistical validity.
  - Enforces compound boundary: `seedCount * requestCount <= 50,000`.
- **`tests/experiments.test.ts`:**
  - Tests transactional experiment creation (`POST /api/experiments`).
  - Tests paginated listing, query filters, and sorting (`GET /api/experiments`).
  - Tests cascading deletion (`DELETE /api/experiments/:id`).

---

## 6. Security & Multi-User Isolation Testing

Security test suites verify authentication, authorization, session tampering, and abuse protection:

- **`tests/auth.test.ts`:**
  - Tests user registration payload validation and normalization.
  - Validates salted bcrypt password hashing and verification.
  - Tests HMAC-SHA256 session token creation and verification.
  - Verifies user storage operations using test doubles.
- **`tests/security.test.ts`:**
  - Validates production Content Security Policy (CSP): confirms `unsafe-eval` is omitted in production.
  - Verifies HSTS header (`max-age=63072000; includeSubDomains; preload`).
  - Validates `SESSION_SECRET` length requirements ($\ge 32$ characters) and verifies that production forbids insecure fallback secrets.
  - Tests session tampering and expired token detection.
- **`tests/experiment-ownership.test.ts` & `tests/multi-user-isolation-e2e.test.ts`:**
  - Verifies strict fail-closed authorization.
  - Confirms User A cannot view User B's private experiments.
  - Confirms User A cannot delete User B's experiments (HTTP 403 Forbidden).
  - Confirms unassigned private experiments are inaccessible.
  - Confirms public experiments follow intended public-access policy.
  - Verifies client-supplied user IDs in request bodies cannot bypass server session authorization.
- **`tests/rate-limiting.test.ts`:**
  - Tests Upstash Redis sliding-window rate limiting.
  - Verifies trusted proxy header precedence (`x-real-ip` over `x-forwarded-for`).
  - Confirms client IPs are salted and SHA-256 hashed.
  - Verifies fail-closed production policy when Redis is unavailable (HTTP 503).
  - Tests local development in-memory fallback.
- **`tests/error-logging.test.ts`:**
  - Verifies that database connection strings with passwords are redacted to `postgresql://[REDACTED_AUTH]@...`.
  - Verifies that raw URLs, credentials, and emails are scrubbed before logging.

---

## 7. TypeScript Static Validation

TypeScript compilation is verified with zero build-error tolerance:
```bash
npm run typecheck
```
- **Configuration:** Strict typing enforced in `tsconfig.json` (`noImplicitAny`, `strictNullChecks`, `noEmit: true`).
- **Next.js Integration:** `next.config.mjs` sets `typescript: { ignoreBuildErrors: false }` to guarantee that code with type errors cannot compile for production.

---

## 8. Prisma Schema Validation

Prisma schema integrity is validated against relational constraints:
```bash
npx prisma validate
```
- Checks syntax, model attributes, foreign key references, and index definitions in `prisma/schema.prisma`.
- Guarantees `onDelete: Cascade` on `PolicyResult` and `onDelete: SetNull` on `Experiment.userId`.

---

## 9. Production Build Validation

End-to-end compilation is validated using the production bundler:
```bash
npm run build
```
- Generates Prisma client bindings (`prisma generate`).
- Compiles the Next.js App Router application using Webpack (`next build --webpack`).
- Enforces static pre-rendering of root pages (`/`) and server-side dynamic compilation of all 9 API routes.
- Verifies that bundle chunking, CSP headers, and WASM SWC compiler bindings execute cleanly with zero warnings or errors.

---

## 10. Headless Research CLI Testing & Validation

CloudFlow includes a dedicated automated test suite for its headless research experimentation kernel:

```bash
# Run the research runner test suite
node --test tests/research-runner.test.ts
```

### 10.1 Covered Test Suites (14 Tests)
1. **Configuration Parsing & Sanitization:** Verifies flag parsing (`-w`, `-r`, `-s`, `--seed-start`, `--sla`, `--duration`, `-M`, `-o`, `--include-traces`, `-q`, `--run-id`), positive integer constraints, and invalid workload rejection.
2. **Deterministic Parity & Fairness:** Asserts all 5 scheduling policies evaluate identical synthetic request sequences for any given seed.
3. **Bitwise Reproducibility:** Confirms that identical configuration and seed sequences produce identical cost, latency, carbon, and P95 metrics.
4. **Pooled Request Quantiles:** Verifies monotonic non-decreasing quantiles ($P_{50} \le P_{90} \le P_{95} \le P_{99}$) calculated directly on the concatenated population vector (avoiding Jensen's inequality fallacy).
5. **Statistical Significance Testing:** Asserts paired Student's t-tests, Holm-Bonferroni FWER adjustments ($\alpha = 0.05$), and Cohen's $d_z$ effect magnitudes.
6. **Graceful Interruption & Partial Persistence:** Tests that aborted executions preserve completed workload results to disk without file corruption.
7. **End-to-End Artifact Generation:** Validates JSON schemas, RFC-4180 CSV tables, and reproducibility manifests.

### 10.2 Standalone Research Execution Commands
```bash
# Default research benchmark (All 3 workloads, 30 seeds, 1,000 requests/seed)
npm run research

# Targeted high-throughput evaluation (Bursty workload, 10,000 requests/seed, 30 seeds)
npm run research -- --workload bursty --requests 10000 --seeds 30

# High-volume stress run (Poisson, 50,000 requests/seed with 4GB heap allocation)
node --max-old-space-size=4096 scripts/research-runner.ts --workload poisson --requests 50000 --seeds 30
```
