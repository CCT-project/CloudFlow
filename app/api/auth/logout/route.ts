import { NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'

export async function POST() {
  const response = NextResponse.json(
    {
      status: 'success',
      message: 'Signed out successfully.',
    },
    { status: 200 }
  )

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0, // Immediately expire cookie
  })

  return response
}
