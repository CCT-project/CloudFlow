import type {
  AdaptiveObjectiveWeights,
  PolicyPerformanceSummary,
  PolicyType,
  ServerlessCandidate,
  SimulatedRequestTrace,
  SimulateRequestBody,
  SimulateResponseBody,
} from '../types/scheduler.ts'
import {
  calculateAverageLatency,
  calculateCarbonEmissions,
  calculateColdStartRate,
  calculateExecutionCost,
  calculateP95Latency,
  calculateSlaViolationRate,
} from '../metrics/calculations.ts'
import { evaluateBaselinePolicy } from '../scheduler/baseline-policies.ts'
import { DEFAULT_CANDIDATES } from './defaults.ts'
import { DeterministicPRNG, generateWorkloadRequests } from './workload.ts'
import type { SyntheticRequest } from './workload.ts'

const ALL_POLICIES: PolicyType[] = [
  'Latency-first',
  'Cost-first',
  'Carbon-first',
  'Default',
  'CloudFlow adaptive',
]

interface PolicySimulationResult {
  summary: PolicyPerformanceSummary
  traces: SimulatedRequestTrace[]
}

/**
 * Simulates a single policy over an exact, predetermined sequence of synthetic requests.
 */
function simulatePolicyOnWorkload(
  requests: SyntheticRequest[],
  policy: PolicyType,
  candidatePool: ServerlessCandidate[],
  slaLatencyThresholdMs: number,
  adaptiveWeights?: Partial<AdaptiveObjectiveWeights>,
  seed: number = 4242
): PolicySimulationResult {
  // PRNG instance for reproducible jitter
  const jitterPrng = new DeterministicPRNG(seed + policy.length * 101)

  // Track state of candidate warm pools (last used timestamp)
  const candidateLastUsed: Record<string, number> = {}
  candidatePool.forEach((c) => {
    candidateLastUsed[c.id] = c.isWarm ? 0 : -9999999
  })

  // Cold start idle window: 10 minutes (600,000 ms)
  const COLD_START_TIMEOUT_MS = 10 * 60 * 1000

  const latencies: number[] = []
  let totalCostUSD = 0
  let totalCarbonG = 0
  let coldStartsCount = 0
  let slaViolationsCount = 0
  let totalOverheadMs = 0

  const traces: SimulatedRequestTrace[] = []
  const maxSampleTraces = Math.min(requests.length, 50)

  for (const req of requests) {
    // Determine warm status for all candidates at this arrival time
    const dynamicCandidates: ServerlessCandidate[] = candidatePool.map((c) => {
      const lastUsed = candidateLastUsed[c.id] ?? -9999999
      const idleTime = req.arrivalTimeMs - lastUsed
      const isWarm = idleTime <= COLD_START_TIMEOUT_MS
      return {
        ...c,
        isWarm,
      }
    })

    // Evaluate policy
    const evaluation = evaluateBaselinePolicy({
      policy,
      slaLatencyThresholdMs,
      candidates: dynamicCandidates,
      executionDurationMs: req.executionDurationMs,
      isColdStart: false,
      adaptiveWeights,
    })

    totalOverheadMs += evaluation.schedulingOverheadMs

    let chosenCandidate = evaluation.selectedCandidate
    let meetsSLA = evaluation.isSlaSatisfied

    if (!chosenCandidate) {
      // Pick best effort fallback if none returned
      chosenCandidate = dynamicCandidates[0]
      meetsSLA = false
    }

    const wasCold = !chosenCandidate.isWarm
    if (wasCold) {
      coldStartsCount++
    }

    // Actual request latency with bounded jitter (+/- 7.5ms)
    const latencyJitter = (jitterPrng.next() - 0.5) * 15
    const totalLatency = Math.max(
      20,
      chosenCandidate.baseLatencyMs +
        (wasCold ? chosenCandidate.coldStartLatencyMs : 0) +
        req.executionDurationMs +
        latencyJitter
    )

    if (totalLatency > slaLatencyThresholdMs) {
      slaViolationsCount++
    }

    const cost = calculateExecutionCost(req.executionDurationMs, chosenCandidate.costPerMsUSD)
    const carbon = calculateCarbonEmissions(
      req.executionDurationMs,
      chosenCandidate.carbonIntensityGPerKwh
    )

    totalCostUSD += cost
    totalCarbonG += carbon
    latencies.push(totalLatency)

    // Update container warm pool timestamp
    candidateLastUsed[chosenCandidate.id] = req.arrivalTimeMs + totalLatency

    if (req.id <= maxSampleTraces) {
      traces.push({
        requestId: req.id,
        arrivalTimeMs: req.arrivalTimeMs,
        latencyMs: Number(totalLatency.toFixed(1)),
        costUSD: cost,
        carbonG: carbon,
        isColdStart: wasCold,
        meetsSLA: totalLatency <= slaLatencyThresholdMs,
        selectedCandidateId: chosenCandidate.id,
        selectedCandidateName: chosenCandidate.name,
      })
    }
  }

  const averageLatencyMs = calculateAverageLatency(latencies)
  const p95LatencyMs = calculateP95Latency(latencies)
  const coldStartRatePercent = calculateColdStartRate(coldStartsCount, requests.length)
  const slaViolationRatePercent = calculateSlaViolationRate(slaViolationsCount, requests.length)
  const averageOverheadMs = Number((totalOverheadMs / requests.length).toFixed(3))

  const summary: PolicyPerformanceSummary = {
    policy,
    totalRequests: requests.length,
    averageLatencyMs,
    p95LatencyMs,
    totalCostUSD: Number(totalCostUSD.toFixed(6)),
    totalCarbonG: Number(totalCarbonG.toFixed(4)),
    coldStartRatePercent,
    slaViolationRatePercent,
    averageOverheadMs,
  }

  return { summary, traces }
}

/**
 * Runs a deterministic simulation of serverless request execution.
 * When multiple policies are requested, simulates every policy over the EXACT same
 * request sequence for fair multi-policy benchmarking.
 */
export function runSimulation(body: SimulateRequestBody): SimulateResponseBody {
  const seed = body.seed ?? 4242
  const prng = new DeterministicPRNG(seed)

  const requestCount = body.requestCount
  const durationMinutes = body.durationMinutes ?? 30
  const slaLatencyThresholdMs = body.slaLatencyThresholdMs
  const arrivalPattern = body.arrivalPattern ?? 'Poisson'
  const primaryPolicy: PolicyType = body.policy ?? 'Latency-first'
  const candidatePool: ServerlessCandidate[] =
    body.candidates && body.candidates.length > 0 ? body.candidates : DEFAULT_CANDIDATES

  // Determine list of policies to evaluate
  let targetPolicies: PolicyType[] = [primaryPolicy]
  if (body.compareAllPolicies) {
    targetPolicies = [...ALL_POLICIES]
  } else if (body.policiesToEvaluate && body.policiesToEvaluate.length > 0) {
    targetPolicies = [...body.policiesToEvaluate]
    if (!targetPolicies.includes(primaryPolicy)) {
      targetPolicies.unshift(primaryPolicy)
    }
  }

  // Generate deterministic synthetic requests ONCE for all evaluated policies
  const requests = generateWorkloadRequests(requestCount, durationMinutes, arrivalPattern, prng)

  // Run simulation for each target policy
  const policySummaries: Partial<Record<PolicyType, PolicyPerformanceSummary>> = {}
  let primaryResult: PolicySimulationResult | null = null

  for (const pol of targetPolicies) {
    const res = simulatePolicyOnWorkload(
      requests,
      pol,
      candidatePool,
      slaLatencyThresholdMs,
      body.adaptiveWeights,
      seed
    )
    policySummaries[pol] = res.summary

    if (pol === primaryPolicy || !primaryResult) {
      primaryResult = res
    }
  }

  return {
    status: 'success',
    simulationId: `sim-seed${seed}-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    workload: {
      workloadType: body.workloadType ?? 'Medium',
      requestCount,
      durationMinutes,
      slaLatencyThresholdMs,
      arrivalPattern,
      policiesToEvaluate: targetPolicies,
    },
    policy: primaryPolicy,
    summary: primaryResult!.summary,
    policySummaries,
    simulationAssumptions: {
      prng: 'Deterministic Mulberry32 algorithm with reproducible seed',
      latencyModel: 'Base regional latency + synthetic duration + cold start delay (if cold) + bounded jitter (+/- 7.5ms)',
      costModel: 'Calculated using durationMs * costPerMsUSD + standard invocation fee ($0.0000002)',
      carbonModel: 'Calculated from 35W container power estimate * duration * regional grid carbon intensity (g CO2e/kWh)',
      coldStartModel: '10-minute idle container expiration timeout based on request arrival timestamp intervals',
      adaptivePolicyModel: 'Two-stage multi-objective optimization: Stage A filters for SLA feasibility; Stage B minimizes normalized score = alpha*Cost + beta*Carbon + gamma*Latency + delta*ColdRisk',
    },
    sampleTraces: primaryResult!.traces,
  }
}
