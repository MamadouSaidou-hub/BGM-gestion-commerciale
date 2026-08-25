import { NextRequest, NextResponse } from 'next/server'
import { getStoreOptions, getTransfersList } from '@/lib/db/queries'
import { createTransfer } from '@/lib/db/mutations'
import { toApiErrorMessage } from '@/lib/api-error'
import { parsePeriodLabel } from '@/lib/period'
import { effectiveStoreParam, getSessionContext, isAdmin, scopedStoreList } from '@/lib/session'
import { csvResponse } from '@/lib/csv'

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })

  const searchParams = request.nextUrl.searchParams
  const period = parsePeriodLabel(searchParams.get('period'), '7d')
  const store = effectiveStoreParam(ctx, searchParams.get('store'))

  const [data, storeOptions] = await Promise.all([getTransfersList(period, store), getStoreOptions()])

  if (searchParams.get('format') === 'csv') {
    return csvResponse(
      data.transfers,
      [
        { key: 'reference', label: 'Référence' },
        { key: 'date', label: 'Date' },
        { key: 'fromStore', label: 'Origine' },
        { key: 'toStore', label: 'Destination' },
        { key: 'totalQuantity', label: 'Quantité' },
        { key: 'status', label: 'Statut' },
      ],
      'transferts.csv',
    )
  }

  return NextResponse.json({
    ...data,
    stores: scopedStoreList(ctx, storeOptions.map((row) => row.name)),
  })
}

export async function POST(request: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })

  const body = await request.json()
  const fromStoreId = Number(body.fromStoreId)
  const toStoreId = Number(body.toStoreId)
  const items = Array.isArray(body.items) ? body.items : []

  if (!Number.isFinite(fromStoreId) || !Number.isFinite(toStoreId) || items.length === 0) {
    return NextResponse.json({ error: 'Champs invalides ou manquants.' }, { status: 400 })
  }

  if (!isAdmin(ctx) && ctx.storeId !== fromStoreId) {
    return NextResponse.json({ error: 'Vous ne pouvez initier un transfert que depuis votre propre magasin.' }, { status: 403 })
  }

  const parsedItems = items.map((item: { productId: unknown; quantity: unknown }) => ({
    productId: Number(item.productId),
    quantity: Number(item.quantity),
  }))

  if (parsedItems.some((item: { productId: number; quantity: number }) => !Number.isFinite(item.productId) || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    return NextResponse.json({ error: 'Lignes d’articles invalides.' }, { status: 400 })
  }

  try {
    const transfer = await createTransfer({ fromStoreId, toStoreId, items: parsedItems })
    return NextResponse.json({ transfer }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
