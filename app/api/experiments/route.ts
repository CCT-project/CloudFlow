import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    {
      status: 'success',
      data: {
        experiments: [],
        total: 0,
        persistence: {
          enabled: false,
          storageType: 'none',
          notice:
            'Persistent experiment storage is not yet active in Phase 2. Experiments are currently executed transiently in-memory. Persistent storage (database/file store) will be implemented in Phase 4.',
        },
      },
    },
    { status: 200 }
  )
}
