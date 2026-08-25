import { NextRequest, NextResponse } from 'next/server'
import { getStoresOverview } from '@/lib/db/queries'
import { createStore } from '@/lib/db/mutations'
import { toApiErrorMessage } from '@/lib/api-error'
import { getSessionContext, isAdmin } from '@/lib/session'

export async function GET() {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })

  const data = await getStoresOverview()
  const scoped = isAdmin(ctx) ? data : data.filter((store) => store.id === ctx.storeId)
  return NextResponse.json({ stores: scoped })
}

export async function POST(request: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const body = await request.json()
  const name = String(body.name ?? '').trim()
  const city = String(body.city ?? '').trim()

  if (!name || !city) {
    return NextResponse.json({ error: 'Le nom et la ville sont requis.' }, { status: 400 })
  }

  try {
    const store = await createStore({ name, city })
    return NextResponse.json({ store }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
