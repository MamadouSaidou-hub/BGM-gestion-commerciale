import { NextResponse } from 'next/server'

// Vercel sets this automatically on every deployment — a stable, free way to know "is this the
// same build the client loaded, or has a new one shipped since" without maintaining a version
// number by hand. Falls back to the build timestamp locally, where that env var doesn't exist.
const BUILD_VERSION = process.env.VERCEL_GIT_COMMIT_SHA ?? `local-${Date.now()}`

export async function GET() {
  return NextResponse.json(
    { version: BUILD_VERSION },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } },
  )
}
