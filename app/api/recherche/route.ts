import { NextRequest, NextResponse } from 'next/server'
import { getGlobalSearch } from '@/lib/db/queries'
import { getSessionContext } from '@/lib/session'

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })

  const q = request.nextUrl.searchParams.get('q') ?? ''
  const results = await getGlobalSearch(q, ctx)
  return NextResponse.json({ results })
}
