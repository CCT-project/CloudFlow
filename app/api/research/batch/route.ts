import { NextRequest, NextResponse } from 'next/server'
import type { ApiErrorResponse } from '@/lib/types/scheduler'
import { runBatchResearch } from '@/lib/research/batch-engine'
import { validateBatchResearchRequest } from '@/lib/validation/api-validator'
import { getSessionUser } from '@/lib/auth/session'
import {
  checkRateLimit,
  createRateLimitErrorResponse,
  createRateLimitHeaders,
} from '@/lib/rate-limit/limiter'
import { sanitizeCorrelationId } from '@/lib/storage/experiments'

export async function POST(request: NextRequest) {
  const correlationId = sanitizeCorrelationId(request.headers.get('x-correlation-id'))

  // Enforce distributed rate limiting (10 requests per minute)
  const sessionUser = await getSessionUser()
  const rl = await checkRateLimit('batchResearch', request, sessionUser?.id)
  if (!rl.success) {
    const errorRes = createRateLimitErrorResponse(
      rl,
      'Too many batch research requests. You have exceeded the rate limit. Please try again later.'
    )
    errorRes.headers.set('x-correlation-id', correlationId)
    return errorRes
  }

  const rlHeaders = createRateLimitHeaders(rl)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    const errorPayload: ApiErrorResponse = {
      status: 'error',
      error: {
        code: 'INVALID_JSON',
        message: 'Failed to parse JSON request body.',
        details: ['Invalid JSON syntax.'],
      },
    }
    const res = NextResponse.json(errorPayload, { status: 400 })
    Object.entries(rlHeaders).forEach(([k, v]) => res.headers.set(k, v))
    res.headers.set('x-correlation-id', correlationId)
    return res
  }

  const validation = validateBatchResearchRequest(body)
  if (!validation.isValid) {
    const errorPayload: ApiErrorResponse = {
      status: 'error',
      error: {
        code: validation.code,
        message: validation.message,
        details: validation.details,
      },
    }
    const res = NextResponse.json(errorPayload, { status: 400 })
    Object.entries(rlHeaders).forEach(([k, v]) => res.headers.set(k, v))
    res.headers.set('x-correlation-id', correlationId)
    return res
  }

  try {
    const result = runBatchResearch(validation.data)
    const res = NextResponse.json(result, { status: 200 })
    Object.entries(rlHeaders).forEach(([k, v]) => res.headers.set(k, v))
    res.headers.set('x-correlation-id', correlationId)
    return res
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Batch research evaluation failed.'
    const errorPayload: ApiErrorResponse = {
      status: 'error',
      error: {
        code: 'RESEARCH_EXECUTION_ERROR',
        message: 'Internal server error while executing batch research benchmark.',
        details: [message],
      },
    }
    const res = NextResponse.json(errorPayload, { status: 500 })
    Object.entries(rlHeaders).forEach(([k, v]) => res.headers.set(k, v))
    res.headers.set('x-correlation-id', correlationId)
    return res
  }
}
