import type {
  AdaptiveObjectiveWeights,
  ContainerLifecycleEvent,
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

export const ALL_POLICIES: PolicyType[] = [
  'Latency-first',
  'Cost-first',
  'Carbon-first',
  'Default',
  'CloudFlow adaptive',
]

export interface PolicySimulationResult {
  summary: PolicyPerformanceSummary
  traces: SimulatedRequestTrace[]
  latencies: number[]
  lifecycleEvents?: ContainerLifecycleEvent[]
}

export interface SimulationOptions {
  maxInstancesPerCandidate?: number
  coldStartTimeoutMs?: number
}

interface ContainerInstance {
  id: string
  busyUntilMs: number
  lastUsedMs: number
}

interface CandidatePoolState {
  candidate: ServerlessCandidate
  maxInstances: number
  instances: ContainerInstance[]
}

/**
 * Simulates a single policy over an exact, predetermined sequence of synthetic requests
 * using a realistic discrete-event container lifecycle and finite concurrency model:
 * - Tracks container instance allocation, reuse, and idle expiration.
 * - Concurrency cold starts emerge naturally when concurrent requests arrive while existing instances are busy.
 * - Queueing delays emerge when the configured candidate capacity limit is reached.
 * - Total latency = baseLatency + queueingDelay + coldStartDelay + executionDuration + jitter (no double-counting).
 */
export function simulatePolicyOnWorkload(
  requests: SyntheticRequest[],
  policy: PolicyType,
  candidatePool: ServerlessCandidate[],
  slaLatencyThresholdMs: number,
  adaptiveWeights?: Partial<AdaptiveObjectiveWeights>,
  seed: number = 4242,
  options?: SimulationOptions
): PolicySimulationResult {
  // PRNG instance for reproducible jitter
  const jitterPrng = new DeterministicPRNG(seed + policy.length * 101)

  // Cold start idle window: 10 minutes (600,000 ms) default, or configurable
  const COLD_START_TIMEOUT_MS = options?.coldStartTimeoutMs ?? 10 * 60 * 1000

  // Initialize candidate container pools
  const pools: Record<string, CandidatePoolState> = {}
  candidatePool.forEach((c) => {
    const maxInstances =
      c.maxInstances ?? options?.maxInstancesPerCandidate ?? Math.max(10, c.activeInstances * 2)
    const initialInstances: ContainerInstance[] = []
    if (c.isWarm) {
      // Provision realistic initial warm container instances (e.g. up to 2 provisioned containers)
      const warmCount = Math.min(2, Math.max(1, c.activeInstances))
      for (let i = 0; i < warmCount; i++) {
        initialInstances.push({
          id: `${c.id}-init-${i}`,
          busyUntilMs: 0,
          lastUsedMs: 0,
        })
      }
    }
    pools[c.id] = {
      candidate: c,
      maxInstances,
      instances: initialInstances,
    }
  })

  const latencies: number[] = []
  let totalCostUSD = 0
  let totalCarbonG = 0
  let coldStartsCount = 0
  let slaViolationsCount = 0
  let totalOverheadMs = 0
  let totalQueueingDelayMs = 0
  let totalColdStartDelayMs = 0
  let totalExecutionDurationMs = 0
  let maxConcurrency = 0

  const traces: SimulatedRequestTrace[] = []
  const lifecycleEvents: ContainerLifecycleEvent[] = []
  const maxSampleTraces = Math.min(requests.length, 250)

  for (const req of requests) {
    // 1. Maintain candidate pools at this arrival timestamp: expire idle containers (> COLD_START_TIMEOUT_MS)
    for (const [candId, pool] of Object.entries(pools)) {
      const remaining: ContainerInstance[] = []
      for (const inst of pool.instances) {
        const isBusy = inst.busyUntilMs > req.arrivalTimeMs
        const idleDuration = req.arrivalTimeMs - inst.lastUsedMs
        if (isBusy || idleDuration <= COLD_START_TIMEOUT_MS) {
          remaining.push(inst)
        } else {
          // Log container idle expiration event
          if (lifecycleEvents.length < 500) {
            lifecycleEvents.push({
              timestampMs: inst.lastUsedMs + COLD_START_TIMEOUT_MS,
              candidateId: candId,
              containerId: inst.id,
              eventType: 'expired',
              activeConcurrency: pool.instances.length - 1,
            })
          }
        }
      }
      pool.instances = remaining
    }

    // 2. Determine candidate warm availability at current arrival time
    const dynamicCandidates: ServerlessCandidate[] = candidatePool.map((c) => {
      const pool = pools[c.id]
      const idleCount = pool.instances.filter((i) => i.busyUntilMs <= req.arrivalTimeMs).length
      const canServeWarm = idleCount > 0
      return {
        ...c,
        isWarm: canServeWarm,
        activeInstances: pool.instances.length,
      }
    })

    // 3. Evaluate policy
    const evaluation = evaluateBaselinePolicy({
      policy,
      slaLatencyThresholdMs,
      candidates: dynamicCandidates,
      executionDurationMs: req.executionDurationMs,
      latencyMarginMs: 7.5,
      isColdStart: false,
      adaptiveWeights,
    })

    totalOverheadMs += evaluation.schedulingOverheadMs

    let chosenCandidate = evaluation.selectedCandidate
    if (!chosenCandidate) {
      chosenCandidate = dynamicCandidates[0]
    }

    // 4. Allocate container instance from chosen candidate's pool
    const pool = pools[chosenCandidate.id]
    const idleInstances = pool.instances.filter((i) => i.busyUntilMs <= req.arrivalTimeMs)

    let queueingDelayMs = 0
    let coldStartDelayMs = 0
    let wasCold = false
    let startTimeMs = req.arrivalTimeMs
    let assignedContainerId = `${chosenCandidate.id}-inst-1`
    let lifecycleState: 'cold_start_scale_out' | 'warm_reuse' | 'queue_delayed' = 'warm_reuse'

    if (idleInstances.length > 0) {
      // Warm reuse
      wasCold = false
      lifecycleState = 'warm_reuse'
      const inst = idleInstances[0]
      assignedContainerId = inst.id
      startTimeMs = req.arrivalTimeMs
      inst.busyUntilMs = startTimeMs + req.executionDurationMs
      inst.lastUsedMs = inst.busyUntilMs
    } else if (pool.instances.length < pool.maxInstances) {
      // Concurrency Cold Start: scale out a new container instance
      wasCold = true
      lifecycleState = 'cold_start_scale_out'
      coldStartsCount++
      coldStartDelayMs = chosenCandidate.coldStartLatencyMs
      startTimeMs = req.arrivalTimeMs + coldStartDelayMs
      assignedContainerId = `${chosenCandidate.id}-inst-${pool.instances.length + 1}`
      const newInst: ContainerInstance = {
        id: assignedContainerId,
        busyUntilMs: startTimeMs + req.executionDurationMs,
        lastUsedMs: startTimeMs + req.executionDurationMs,
      }
      pool.instances.push(newInst)
    } else {
      // Capacity Saturation / Queueing Delay: wait for earliest instance to finish
      wasCold = false
      lifecycleState = 'queue_delayed'
      pool.instances.sort((a, b) => a.busyUntilMs - b.busyUntilMs)
      const earliest = pool.instances[0]
      assignedContainerId = earliest.id
      queueingDelayMs = Math.max(0, earliest.busyUntilMs - req.arrivalTimeMs)
      startTimeMs = req.arrivalTimeMs + queueingDelayMs
      earliest.busyUntilMs = startTimeMs + req.executionDurationMs
      earliest.lastUsedMs = earliest.busyUntilMs
    }

    totalQueueingDelayMs += queueingDelayMs
    totalColdStartDelayMs += coldStartDelayMs
    totalExecutionDurationMs += req.executionDurationMs

    // Track active concurrency across all candidate pools
    const activeConcurrency = Object.values(pools).reduce(
      (sum, p) => sum + p.instances.filter((i) => i.busyUntilMs > req.arrivalTimeMs).length,
      0
    )
    if (activeConcurrency > maxConcurrency) {
      maxConcurrency = activeConcurrency
    }

    if (lifecycleEvents.length < 500) {
      if (wasCold) {
        lifecycleEvents.push({
          timestampMs: req.arrivalTimeMs,
          candidateId: chosenCandidate.id,
          containerId: assignedContainerId,
          eventType: 'created',
          durationMs: coldStartDelayMs,
          activeConcurrency,
        })
      } else if (queueingDelayMs > 0) {
        lifecycleEvents.push({
          timestampMs: req.arrivalTimeMs,
          candidateId: chosenCandidate.id,
          containerId: assignedContainerId,
          eventType: 'queue_wait',
          durationMs: queueingDelayMs,
          activeConcurrency,
        })
      } else {
        lifecycleEvents.push({
          timestampMs: req.arrivalTimeMs,
          candidateId: chosenCandidate.id,
          containerId: assignedContainerId,
          eventType: 'warm_reuse',
          durationMs: req.executionDurationMs,
          activeConcurrency,
        })
      }
    }

    // 5. Total request latency: base network + queueing + cold start + execution duration + jitter
    const latencyJitter = (jitterPrng.next() - 0.5) * 15
    const totalLatency = Math.max(
      20,
      chosenCandidate.baseLatencyMs +
        queueingDelayMs +
        coldStartDelayMs +
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
        executionDurationMs: req.executionDurationMs,
        queueingDelayMs: Number(queueingDelayMs.toFixed(1)),
        coldStartDelayMs: Number(coldStartDelayMs.toFixed(1)),
        containerId: assignedContainerId,
        serviceStartTimeMs: startTimeMs,
        serviceFinishTimeMs: startTimeMs + req.executionDurationMs,
        activeConcurrency,
        lifecycleState,
      })
    }
  }

  const averageLatencyMs = calculateAverageLatency(latencies)
  const p95LatencyMs = calculateP95Latency(latencies)
  const coldStartRatePercent = calculateColdStartRate(coldStartsCount, requests.length)
  const slaViolationRatePercent = calculateSlaViolationRate(slaViolationsCount, requests.length)
  const averageOverheadMs = Number((totalOverheadMs / requests.length).toFixed(3))
  const averageExecutionDurationMs = Number((totalExecutionDurationMs / requests.length).toFixed(1))
  const averageQueueingDelayMs = Number((totalQueueingDelayMs / requests.length).toFixed(2))
  const averageColdStartDelayMs = Number((totalColdStartDelayMs / requests.length).toFixed(2))

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
    averageExecutionDurationMs,
    averageQueueingDelayMs,
    averageColdStartDelayMs,
    maxConcurrency,
  }

  return { summary, traces, latencies, lifecycleEvents }
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
  const policyTraces: Partial<Record<PolicyType, SimulatedRequestTrace[]>> = {}
  let primaryResult: PolicySimulationResult | null = null

  for (const pol of targetPolicies) {
    const res = simulatePolicyOnWorkload(
      requests,
      pol,
      candidatePool,
      slaLatencyThresholdMs,
      body.adaptiveWeights,
      seed,
      {
        maxInstancesPerCandidate: body.maxInstancesPerCandidate,
        coldStartTimeoutMs: body.coldStartTimeoutMs,
      }
    )
    policySummaries[pol] = res.summary
    policyTraces[pol] = res.traces

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
    sampleTraces: primaryResult!.traces,
    policyTraces,
    lifecycleEvents: primaryResult!.lifecycleEvents,
    simulationAssumptions: {
      prng: 'Deterministic Mulberry32 algorithm with independent decoupled streams for arrival times and execution durations',
      concurrencyModel: 'Discrete-event container instance pool with concurrency scale-out, warm reuse, finite capacity queueing, and 10-minute idle expiration',
      latencyModel: 'Base regional latency + queueing delay + cold start delay (if container scale-out) + execution duration + bounded jitter (+/- 7.5ms)',
      costModel: 'Calculated using durationMs * costPerMsUSD + standard invocation fee ($0.0000002)',
      carbonModel: 'Calculated from 35W container power estimate * duration * regional grid carbon intensity (g CO2e/kWh)',
      coldStartModel: '10-minute idle container expiration timeout and concurrency cold-starts when concurrent requests exceed warm instances',
      adaptivePolicyModel: 'Two-stage multi-objective optimization: Stage A filters for SLA feasibility including execution duration; Stage B minimizes normalized score = alpha*Cost + beta*Carbon + gamma*Latency + delta*ColdRisk',
    },
  }
}
