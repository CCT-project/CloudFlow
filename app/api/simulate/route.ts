import { NextRequest, NextResponse } from 'next/server'
import {
  ApiErrorResponse,
  DEFAULT_ADAPTIVE_WEIGHTS,
  PolicyType,
  PolicyPerformanceSummary,
  SimulateResponseBody,
} from '@/lib/types/scheduler'
import { runSimulation } from '@/lib/simulation/engine'
import { validateSimulateRequest, VALID_POLICIES } from '@/lib/validation/api-validator'
import {
  createExperiment,
  findRecentDuplicateExperiment,
  DatabaseUnavailableError,
  DatabaseError,
  logStructuredDatabaseError,
  sanitizeCorrelationId,
} from '@/lib/storage/experiments'
import { getSessionUser } from '@/lib/auth/session'
import {
  checkRateLimit,
  createRateLimitErrorResponse,
  createRateLimitHeaders,
} from '@/lib/rate-limit/limiter'

// In-flight simulation tracking to prevent concurrent duplicate submissions
const inFlightSimulations = new Map<string, Promise<SimulateResponseBody>>()

// Recent simulation cache to prevent rapid repeated submissions (5-second deduplication window)
interface RecentSimulationEntry {
  result: SimulateResponseBody
  timestamp: number
}
const recentSavedSimulations = new Map<string, RecentSimulationEntry>()
const DEDUPLICATION_WINDOW_MS = 5000

function clearSimulationDeduplicationCache(): void {
  inFlightSimulations.clear()
  recentSavedSimulations.clear()
}

function getSimulationDeduplicationKey(
  userId: string | null | undefined,
  reqData: any
): string {
  const parts = [
    userId || 'anon',
    reqData.workloadType || 'Medium',
    reqData.requestCount,
    reqData.durationMinutes || 30,
    reqData.slaLatencyThresholdMs,
    reqData.arrivalPattern || 'Steady',
    reqData.seed ?? 4242,
    reqData.experimentName || '',
    JSON.stringify(reqData.adaptiveWeights || {}),
  ]
  return parts.join(':')
}

export async function POST(request: NextRequest) {
  const correlationId = sanitizeCorrelationId(request.headers.get('x-correlation-id'))

  // Enforce distributed rate limiting (20 requests per minute)
  const sessionUser = await getSessionUser()
  const rl = await checkRateLimit('simulate', request, sessionUser?.id)
  if (!rl.success) {
    const errorRes = createRateLimitErrorResponse(
      rl,
      'Too many simulation requests. You have exceeded the rate limit. Please try again later.'
    )
    errorRes.headers.set('x-correlation-id', correlationId)
    return errorRes
  }

  const rlHeaders = createRateLimitHeaders(rl)

  const jsonResponse = (data: unknown, init?: number | ResponseInit) => {
    const status = typeof init === 'number' ? init : init?.status || 200
    const existingHeaders = typeof init === 'object' && init?.headers ? init.headers : {}
    return NextResponse.json(data, {
      status,
      headers: {
        ...existingHeaders,
        ...rlHeaders,
        'x-correlation-id': correlationId,
      },
    })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    const errorResponse: ApiErrorResponse = {
      status: 'error',
      error: {
        code: 'MALFORMED_JSON',
        message: 'The request body could not be parsed as valid JSON.',
      },
    }
    return jsonResponse(errorResponse, 400)
  }

  const validation = validateSimulateRequest(body)
  if (!validation.isValid) {
    const errorResponse: ApiErrorResponse = {
      status: 'error',
      error: {
        code: validation.code,
        message: validation.message,
        details: validation.details,
      },
    }
    return jsonResponse(errorResponse, 400)
  }

  try {
    const reqData = { ...validation.data }
    // If persistence requested, ensure all 5 policies are benchmarked fairly over the same trace
    if (reqData.saveExperiment) {
      reqData.compareAllPolicies = true
    }

    // Enforce strict multi-tenant isolation: database persistence is permitted only for verified user sessions
    if (reqData.saveExperiment && !sessionUser) {
      reqData.saveExperiment = false
    }

    // When persistence is requested by an authenticated user, enforce multi-layer deduplication
    if (reqData.saveExperiment && sessionUser) {
      const user = sessionUser
      const dedupKey = getSimulationDeduplicationKey(user.id, reqData)

      // Layer 1: Check in-flight concurrent execution promise
      const existingInFlight = inFlightSimulations.get(dedupKey)
      if (existingInFlight) {
        const inFlightResult = await existingInFlight
        return jsonResponse(inFlightResult, 200)
      }

      // Layer 2: Check recent in-memory cache within deduplication window
      const now = Date.now()
      const recent = recentSavedSimulations.get(dedupKey)
      if (recent && now - recent.timestamp < DEDUPLICATION_WINDOW_MS) {
        return jsonResponse(recent.result, 200)
      }

      // Layer 3: Check database for an identical experiment recently created by this user
      const existingDbRecord = await findRecentDuplicateExperiment({
        userId: user.id,
        workloadType: reqData.workloadType || 'Medium',
        requestCount: reqData.requestCount,
        durationMinutes: reqData.durationMinutes || 30,
        slaLatencyThresholdMs: reqData.slaLatencyThresholdMs,
        arrivalPattern: reqData.arrivalPattern || 'Steady',
        seed: reqData.seed ?? 4242,
        windowSeconds: 5,
      })

      if (existingDbRecord) {
        const result = runSimulation(reqData)
        result.isSaved = true
        result.savedExperimentId = existingDbRecord.id
        recentSavedSimulations.set(dedupKey, { result, timestamp: Date.now() })
        return jsonResponse(result, 200)
      }

      // Execute simulation and persistence within tracked promise
      const executionPromise = (async (): Promise<SimulateResponseBody> => {
        const result = runSimulation(reqData)

        const expName =
          reqData.experimentName ||
          `Simulation-${result.workload.workloadType}-${new Date().toISOString().slice(0, 10)}`

        const summaries = result.policySummaries || {
          [result.policy]: result.summary,
        }

        const policyResultsToSave = VALID_POLICIES.map((p: PolicyType) => {
          const sum: PolicyPerformanceSummary = summaries[p] || result.summary
          return {
            policy: p,
            totalRequests: sum.totalRequests,
            averageLatencyMs: sum.averageLatencyMs,
            p95LatencyMs: sum.p95LatencyMs,
            totalCostUSD: sum.totalCostUSD,
            totalCarbonG: sum.totalCarbonG,
            coldStartRatePercent: sum.coldStartRatePercent,
            slaViolationRatePercent: sum.slaViolationRatePercent,
            averageOverheadMs: sum.averageOverheadMs,
          }
        })

        const saved = await createExperiment({
          name: expName,
          workloadType: result.workload.workloadType,
          requestCount: result.workload.requestCount,
          durationMinutes: result.workload.durationMinutes,
          slaLatencyThresholdMs: result.workload.slaLatencyThresholdMs,
          arrivalPattern: result.workload.arrivalPattern,
          seed: reqData.seed ?? 4242,
          userId: user.id, // Strictly bound to verified server session; never null
          isPublic: false,
          weights: {
            ...DEFAULT_ADAPTIVE_WEIGHTS,
            ...(reqData.adaptiveWeights || {}),
          },
          assumptions: result.simulationAssumptions,
          policyResults: policyResultsToSave,
          correlationId,
        })

        result.isSaved = true
        result.savedExperimentId = saved.id

        // Cache completed result for recent window
        recentSavedSimulations.set(dedupKey, {
          result,
          timestamp: Date.now(),
        })

        // Prune stale cache entries
        if (recentSavedSimulations.size > 100) {
          const cutoff = Date.now() - DEDUPLICATION_WINDOW_MS * 2
          for (const [k, v] of recentSavedSimulations.entries()) {
            if (v.timestamp < cutoff) {
              recentSavedSimulations.delete(k)
            }
          }
        }

        return result
      })()

      inFlightSimulations.set(dedupKey, executionPromise)
      try {
        const finalResult = await executionPromise
        return jsonResponse(finalResult, 200)
      } finally {
        inFlightSimulations.delete(dedupKey)
      }
    }

    // Non-persisted transient simulation (saveExperiment === false or unauthenticated)
    const result = runSimulation(reqData)
    result.isSaved = false
    return jsonResponse(result, 200)
  } catch (err: unknown) {
    logStructuredDatabaseError(err, {
      operation: 'simulate_route',
      correlationId,
    })

    if (err instanceof DatabaseUnavailableError) {
      const errorResponse: ApiErrorResponse = {
        status: 'error',
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: err.message,
        },
      }
      return jsonResponse(errorResponse, 503)
    }

    if (err instanceof DatabaseError) {
      const errorResponse: ApiErrorResponse = {
        status: 'error',
        error: {
          code: 'DATABASE_PERSISTENCE_FAILED',
          message: err.message,
        },
      }
      return jsonResponse(errorResponse, 500)
    }

    const message = err instanceof Error ? err.message : 'An error occurred during workload simulation.'
    const errorResponse: ApiErrorResponse = {
      status: 'error',
      error: {
        code: 'SIMULATION_EXECUTION_ERROR',
        message,
      },
    }
    return jsonResponse(errorResponse, 422)
  }
}
