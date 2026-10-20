import { NextRequest, NextResponse } from 'next/server'
import {
  ApiErrorResponse,
  DEFAULT_ADAPTIVE_WEIGHTS,
  GetExperimentsResponseBody,
  SingleExperimentResponseBody,
} from '@/lib/types/scheduler'
import {
  createExperiment,
  getExperiments,
  checkDatabaseConnectivity,
  DatabaseUnavailableError,
  DatabaseError,
} from '@/lib/storage/experiments'
import {
  validateCreateExperimentRequest,
  validateGetExperimentsQuery,
} from '@/lib/validation/api-validator'
import { DEFAULT_SIMULATION_ASSUMPTIONS } from '@/lib/simulation/defaults'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const validation = validateGetExperimentsQuery(url.searchParams)

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
    const result = await getExperiments(validation.data)
    const isAvailable = await checkDatabaseConnectivity()

    const response: GetExperimentsResponseBody = {
      status: 'success',
      data: {
        experiments: result.experiments,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        persistence: {
          enabled: true,
          storageType: 'postgresql',
          verified: isAvailable,
        },
      },
    }

    return NextResponse.json(response, { status: 200 })
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

    const message =
      err instanceof DatabaseError
        ? err.message
        : 'An unexpected database error occurred while retrieving experiments.'

    const errorResponse: ApiErrorResponse = {
      status: 'error',
      error: {
        code: 'DATABASE_ERROR',
        message,
      },
    }
    return NextResponse.json(errorResponse, { status: 500 })
  }
}

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

  const validation = validateCreateExperimentRequest(body)
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

  const data = validation.data

  try {
    const created = await createExperiment({
      name: data.name,
      workloadType: data.workloadType || 'Medium',
      requestCount: data.requestCount,
      durationMinutes: data.durationMinutes || 30,
      slaLatencyThresholdMs: data.slaLatencyThresholdMs,
      arrivalPattern: data.arrivalPattern || 'Steady',
      seed: data.seed ?? 42,
      weights: {
        ...DEFAULT_ADAPTIVE_WEIGHTS,
        ...(data.adaptiveWeights || {}),
      },
      assumptions: {
        ...DEFAULT_SIMULATION_ASSUMPTIONS,
        ...(data.simulationAssumptions || {}),
      },
      policyResults: data.policyResults.map((pr) => ({
        policy: pr.policy,
        totalRequests: pr.totalRequests,
        averageLatencyMs: pr.averageLatencyMs,
        p95LatencyMs: pr.p95LatencyMs,
        totalCostUSD: pr.totalCostUSD,
        totalCarbonG: pr.totalCarbonG,
        coldStartRatePercent: pr.coldStartRatePercent,
        slaViolationRatePercent: pr.slaViolationRatePercent,
        averageOverheadMs: pr.averageOverheadMs ?? 0,
      })),
    })

    const response: SingleExperimentResponseBody = {
      status: 'success',
      data: {
        experiment: created,
        persistence: {
          enabled: true,
          storageType: 'postgresql',
        },
      },
    }

    return NextResponse.json(response, { status: 201 })
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

    const message =
      err instanceof DatabaseError
        ? err.message
        : 'Failed to persist experiment to the database.'

    const errorResponse: ApiErrorResponse = {
      status: 'error',
      error: {
        code: 'DATABASE_PERSISTENCE_FAILED',
        message,
      },
    }
    return NextResponse.json(errorResponse, { status: 500 })
  }
}
