import { NextRequest, NextResponse } from 'next/server'
import { ApiErrorResponse } from '@/lib/types/scheduler'
import { runSimulation } from '@/lib/simulation/engine'
import { validateSimulateRequest } from '@/lib/validation/api-validator'

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
    const result = runSimulation(validation.data)
    return NextResponse.json(result, { status: 200 })
  } catch (err: unknown) {
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
