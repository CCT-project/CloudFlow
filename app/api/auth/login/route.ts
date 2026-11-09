import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword } from '@/lib/auth/password'
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { findUserByEmail } from '@/lib/storage/users'
import { validateLoginRequest } from '@/lib/validation/api-validator'
import {
  checkRateLimit,
  createRateLimitErrorResponse,
  createRateLimitHeaders,
} from '@/lib/rate-limit/limiter'

// Pre-computed dummy bcrypt hash (cost 10) to ensure constant-time response when user is not found
const DUMMY_HASH = '$2a$10$7EqJtq98hPqEX7fNZaODo.Yn.g4xWvK1gq4pY5V9Kk5t2nJ9Kk5t2'

export async function POST(request: NextRequest) {
  // Enforce distributed rate limiting (5 requests per minute)
  const rl = await checkRateLimit('login', request)
  if (!rl.success) {
    return createRateLimitErrorResponse(rl, 'Too many login attempts. Please try again later.')
  }

  const rlHeaders = createRateLimitHeaders(rl)
  const attachHeaders = (res: NextResponse): NextResponse => {
    for (const [k, v] of Object.entries(rlHeaders)) {
      res.headers.set(k, v)
    }
    return res
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return attachHeaders(
      NextResponse.json(
        {
          status: 'error',
          error: {
            code: 'MALFORMED_JSON',
            message: 'Request body must be valid JSON.',
          },
        },
        { status: 400 }
      )
    )
  }

  const validation = validateLoginRequest(body)
  if (!validation.isValid) {
    return attachHeaders(
      NextResponse.json(
        {
          status: 'error',
          error: {
            code: validation.code,
            message: validation.message,
            details: validation.details,
          },
        },
        { status: 400 }
      )
    )
  }

  const { email, password } = validation.data

  try {
    const user = await findUserByEmail(email)

    // Defend against user enumeration timing attacks by running bcrypt comparison even if user doesn't exist
    if (!user) {
      await verifyPassword(password, DUMMY_HASH)
      return attachHeaders(
        NextResponse.json(
          {
            status: 'error',
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid email address or password.',
            },
          },
          { status: 401 }
        )
      )
    }

    const isValid = await verifyPassword(password, user.passwordHash)
    if (!isValid) {
      return attachHeaders(
        NextResponse.json(
          {
            status: 'error',
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid email address or password.',
            },
          },
          { status: 401 }
        )
      )
    }

    // Generate secure session token
    const token = createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    })

    const response = NextResponse.json(
      {
        status: 'success',
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
        },
        message: 'Signed in successfully.',
      },
      { status: 200 }
    )

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    })

    attachHeaders(response)
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sign in failed.'
    return attachHeaders(
      NextResponse.json(
        {
          status: 'error',
          error: {
            code: 'SIGNIN_FAILED',
            message,
          },
        },
        { status: 500 }
      )
    )
  }
}
