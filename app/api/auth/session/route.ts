import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json(
        {
          status: 'success',
          data: {
            authenticated: false,
            user: null,
          },
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      {
        status: 'success',
        data: {
          authenticated: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
        },
      },
      { status: 200 }
    )
  } catch {
    return NextResponse.json(
      {
        status: 'success',
        data: {
          authenticated: false,
          user: null,
        },
      },
      { status: 200 }
    )
  }
}
