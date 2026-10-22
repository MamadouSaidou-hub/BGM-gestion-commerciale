import { NextRequest, NextResponse } from 'next/server'
import { getCashAccountsOverview } from '@/lib/db/queries'
import { createCashAccount } from '@/lib/db/mutations'
import { cashAccountType } from '@/lib/db/schema'
import { toApiErrorMessage } from '@/lib/api-error'
import { parsePeriodLabel } from '@/lib/period'
import { getSessionContext, isAdmin } from '@/lib/session'
import { csvResponse } from '@/lib/csv'

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const period = parsePeriodLabel(request.nextUrl.searchParams.get('period'), '7d')
  const data = await getCashAccountsOverview(period)

  if (request.nextUrl.searchParams.get('format') === 'csv') {
    return csvResponse(
      data.movements,
      [
        { key: 'date', label: 'Date' },
        { key: 'account', label: 'Caisse' },
        { key: 'type', label: 'Type' },
        { key: 'category', label: 'Catégorie' },
        { key: 'description', label: 'Description' },
        { key: 'amountFormatted', label: 'Montant' },
      ],
      'caisse-mouvements.csv',
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
  const type = body.type as (typeof cashAccountType)[number]
  const initialBalance = body.initialBalance !== undefined && body.initialBalance !== '' ? Number(body.initialBalance) : 0
  const storeId = body.storeId ? Number(body.storeId) : null

  if (!name || !cashAccountType.includes(type) || !Number.isFinite(initialBalance)) {
    return NextResponse.json({ error: 'Champs invalides ou manquants.' }, { status: 400 })
  }

  try {
    const account = await createCashAccount({ name, type, initialBalance, storeId })
    return NextResponse.json({ account }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
