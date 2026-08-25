import { NextRequest, NextResponse } from 'next/server'
import { getSuppliersOverview } from '@/lib/db/queries'
import { createSupplier } from '@/lib/db/mutations'
import { toApiErrorMessage } from '@/lib/api-error'
import { getSessionContext, isAdmin } from '@/lib/session'
import { csvResponse } from '@/lib/csv'

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const data = await getSuppliersOverview()

  if (request.nextUrl.searchParams.get('format') === 'csv') {
    return csvResponse(
      data.suppliers,
      [
        { key: 'name', label: 'Fournisseur' },
        { key: 'phone', label: 'Téléphone' },
        { key: 'sacksThisMonth', label: 'Sacs ce mois' },
        { key: 'totalPaid', label: 'Payé au total' },
        { key: 'owed', label: 'Dû' },
        { key: 'status', label: 'Statut' },
      ],
      'fournisseurs.csv',
    )
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const body = await request.json()
  const name = String(body.name ?? '').trim()

  if (!name) {
    return NextResponse.json({ error: 'Le nom du fournisseur est requis.' }, { status: 400 })
  }

  try {
    const supplier = await createSupplier({ name, phone: body.phone ? String(body.phone).trim() : undefined })
    return NextResponse.json({ supplier }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
