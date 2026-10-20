import { NextRequest, NextResponse } from 'next/server'
import {
  ApiErrorResponse,
  SingleExperimentResponseBody,
} from '@/lib/types/scheduler'
import {
  getExperimentById,
  deleteExperiment,
  DatabaseUnavailableError,
  NotFoundError,
  DatabaseError,
} from '@/lib/storage/experiments'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    const errorResponse: ApiErrorResponse = {
      status: 'error',
      error: {
        code: 'INVALID_EXPERIMENT_ID',
        message: 'A valid experiment ID string must be specified.',
      },
    }
    return NextResponse.json(errorResponse, { status: 400 })
  }

  try {
    const experiment = await getExperimentById(id)

    const response: SingleExperimentResponseBody = {
      status: 'success',
      data: {
        experiment,
        persistence: {
          enabled: true,
          storageType: 'postgresql',
        },
      },
    }

    return NextResponse.json(response, { status: 200 })
  } catch (err: unknown) {
    if (err instanceof NotFoundError) {
      const errorResponse: ApiErrorResponse = {
        status: 'error',
        error: {
          code: 'EXPERIMENT_NOT_FOUND',
          message: err.message,
        },
      }
      return NextResponse.json(errorResponse, { status: 404 })
    }

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
        : 'Failed to retrieve experiment from database.'

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

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    const errorResponse: ApiErrorResponse = {
      status: 'error',
      error: {
        code: 'INVALID_EXPERIMENT_ID',
        message: 'A valid experiment ID string must be specified.',
      },
    }
    return NextResponse.json(errorResponse, { status: 400 })
  }

  try {
    const result = await deleteExperiment(id)

    return NextResponse.json(
      {
        status: 'success',
        data: result,
      },
      { status: 200 }
    )
  } catch (err: unknown) {
    if (err instanceof NotFoundError) {
      const errorResponse: ApiErrorResponse = {
        status: 'error',
        error: {
          code: 'EXPERIMENT_NOT_FOUND',
          message: err.message,
        },
      }
      return NextResponse.json(errorResponse, { status: 404 })
    }

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
        : 'Failed to delete experiment from database.'

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
