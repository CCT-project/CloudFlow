import { NextRequest, NextResponse } from 'next/server'
import { hashPassword } from '@/lib/auth/password'
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { createUser, findUserByEmail } from '@/lib/storage/users'
import { validateRegisterRequest } from '@/lib/validation/api-validator'
import {
  checkRateLimit,
  createRateLimitErrorResponse,
  createRateLimitHeaders,
} from '@/lib/rate-limit/limiter'

export async function POST(request: NextRequest) {
  // Enforce distributed rate limiting (5 requests per minute)
  const rl = await checkRateLimit('register', request)
  if (!rl.success) {
    return createRateLimitErrorResponse(rl, 'Too many registration attempts. Please try again later.')
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

  const validation = validateRegisterRequest(body)
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

  const { name, email, password } = validation.data

  try {
    // Check if user already exists
    const existing = await findUserByEmail(email)
    if (existing) {
      return attachHeaders(
        NextResponse.json(
          {
            status: 'error',
            error: {
              code: 'EMAIL_ALREADY_EXISTS',
              message: 'An account with this email address already exists. Please sign in instead.',
            },
          },
          { status: 409 }
        )
      )
    }

    // Securely hash password
    const passwordHash = await hashPassword(password)

    // Persist new user
    const newUser = await createUser({
      name: name.trim(),
      email: email.trim(),
      passwordHash,
    })

    // Create session token
    const token = createSessionToken({
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      createdAt: newUser.createdAt,
    })

    // Set HTTP-only secure cookie
    const response = NextResponse.json(
      {
        status: 'success',
        data: {
          user: {
            id: newUser.id,
            email: newUser.email,
            name: newUser.name,
          },
        },
        message: 'Account created successfully.',
      },
      { status: 201 }
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
    const message = err instanceof Error ? err.message : 'Registration failed.'
    return attachHeaders(
      NextResponse.json(
        {
          status: 'error',
          error: {
            code: 'REGISTRATION_FAILED',
            message,
          },
        },
        { status: 500 }
      )
    )
  }
}
