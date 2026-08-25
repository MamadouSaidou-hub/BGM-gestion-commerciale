import { NextResponse } from 'next/server'
import { getSupplierOptions } from '@/lib/db/queries'
import { getSessionContext, isAdmin } from '@/lib/session'

export async function GET() {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const suppliers = await getSupplierOptions()
  return NextResponse.json({ suppliers })
}
