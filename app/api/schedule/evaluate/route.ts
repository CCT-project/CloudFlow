import { NextRequest, NextResponse } from 'next/server'
import { ApiErrorResponse } from '@/lib/types/scheduler'
import { evaluateBaselinePolicy } from '@/lib/scheduler/baseline-policies'
import { validateScheduleEvaluateRequest } from '@/lib/validation/api-validator'

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

  const validation = validateScheduleEvaluateRequest(body)
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
    const result = evaluateBaselinePolicy(validation.data)
    return NextResponse.json(result, { status: 200 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Evaluation failed.'
    const errorResponse: ApiErrorResponse = {
      status: 'error',
      error: {
        code: 'SCHEDULING_EVALUATION_ERROR',
        message,
      },
    }
    return NextResponse.json(errorResponse, { status: 422 })
  }
}
