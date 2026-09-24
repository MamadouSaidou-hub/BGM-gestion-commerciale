import { NextResponse } from 'next/server'
import { getNotifications } from '@/lib/db/queries'
import { getSessionContext, isAdmin } from '@/lib/session'

export async function GET() {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })

  const items = await getNotifications(isAdmin(ctx) ? null : ctx.storeId, isAdmin(ctx))
  return NextResponse.json({ items })
}
