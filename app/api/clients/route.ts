import { NextRequest, NextResponse } from 'next/server'
import { getClientsOverview } from '@/lib/db/queries'
import { createClient } from '@/lib/db/mutations'
import { toApiErrorMessage } from '@/lib/api-error'
import { getSessionContext, isAdmin } from '@/lib/session'
import { csvResponse } from '@/lib/csv'

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })

  const data = await getClientsOverview(isAdmin(ctx) ? null : ctx.storeId)

  if (request.nextUrl.searchParams.get('format') === 'csv') {
    return csvResponse(
      data.clients,
      [
        { key: 'name', label: 'Client' },
        { key: 'phone', label: 'Téléphone' },
        { key: 'store', label: 'Magasin' },
        { key: 'totalPaid', label: 'Encaissé au total' },
        { key: 'outstanding', label: 'Créance en cours' },
        { key: 'status', label: 'Statut' },
      ],
      'clients.csv',
    )
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })

  const body = await request.json()
  const name = String(body.name ?? '').trim()

  if (!name) {
    return NextResponse.json({ error: 'Le nom du client est requis.' }, { status: 400 })
  }

  const requestedStoreId = body.storeId ? Number(body.storeId) : null
  if (!isAdmin(ctx) && requestedStoreId !== null && requestedStoreId !== ctx.storeId) {
    return NextResponse.json({ error: 'Ce magasin n’est pas le vôtre.' }, { status: 403 })
  }
  const storeId = isAdmin(ctx) ? requestedStoreId : (requestedStoreId ?? ctx.storeId)

  try {
    const client = await createClient({
      name,
      phone: body.phone ? String(body.phone).trim() : undefined,
      storeId,
    })
    return NextResponse.json({ client }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
