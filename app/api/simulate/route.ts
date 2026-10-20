import { NextRequest, NextResponse } from 'next/server'
import {
  ApiErrorResponse,
  DEFAULT_ADAPTIVE_WEIGHTS,
  PolicyType,
  PolicyPerformanceSummary,
} from '@/lib/types/scheduler'
import { runSimulation } from '@/lib/simulation/engine'
import { validateSimulateRequest, VALID_POLICIES } from '@/lib/validation/api-validator'
import {
  createExperiment,
  DatabaseUnavailableError,
  DatabaseError,
} from '@/lib/storage/experiments'

export async function POST(request: NextRequest) {
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
    return NextResponse.json(errorResponse, { status: 400 })
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
    return NextResponse.json(errorResponse, { status: 400 })
  }

  try {
    const reqData = { ...validation.data }
    // If persistence requested, ensure all 5 policies are benchmarked fairly over the same trace
    if (reqData.saveExperiment) {
      reqData.compareAllPolicies = true
    }

    const result = runSimulation(reqData)

    if (reqData.saveExperiment) {
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
        weights: {
          ...DEFAULT_ADAPTIVE_WEIGHTS,
          ...(reqData.adaptiveWeights || {}),
        },
        assumptions: result.simulationAssumptions,
        policyResults: policyResultsToSave,
      })

      result.isSaved = true
      result.savedExperimentId = saved.id
    }

    return NextResponse.json(result, { status: 200 })
  } catch (err: unknown) {
    if (err instanceof DatabaseUnavailableError) {
      const errorResponse: ApiErrorResponse = {
        status: 'error',
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: err.message,
        },
      }
      return NextResponse.json(errorResponse, { status: 503 })
    }

    if (err instanceof DatabaseError) {
      const errorResponse: ApiErrorResponse = {
        status: 'error',
        error: {
          code: 'DATABASE_PERSISTENCE_FAILED',
          message: err.message,
        },
      }
      return NextResponse.json(errorResponse, { status: 500 })
    }

    const message = err instanceof Error ? err.message : 'An error occurred during workload simulation.'
    const errorResponse: ApiErrorResponse = {
      status: 'error',
      error: {
        code: 'SIMULATION_EXECUTION_ERROR',
        message,
      },
    }
    return NextResponse.json(errorResponse, { status: 422 })
  }
}
