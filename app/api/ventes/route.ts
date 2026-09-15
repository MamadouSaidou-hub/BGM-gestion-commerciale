import { NextRequest, NextResponse } from 'next/server'
import { getSalesList, getStoreOptions } from '@/lib/db/queries'
import { createSale } from '@/lib/db/mutations'
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

  const [data, storeOptions] = await Promise.all([getSalesList(period, store), getStoreOptions()])

  if (searchParams.get('format') === 'csv') {
    return csvResponse(
      data.sales,
      [
        { key: 'reference', label: 'Référence' },
        { key: 'date', label: 'Date' },
        { key: 'store', label: 'Magasin' },
        { key: 'client', label: 'Client' },
        { key: 'amount', label: 'Montant' },
        { key: 'status', label: 'Statut' },
      ],
      'ventes.csv',
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
  const storeId = Number(body.storeId)
  const paymentStatus = body.paymentStatus as 'paid' | 'partial' | 'credit'
  const items = Array.isArray(body.items) ? body.items : []

  if (!Number.isFinite(storeId) || !['paid', 'partial', 'credit'].includes(paymentStatus) || items.length === 0) {
    return NextResponse.json({ error: 'Champs invalides ou manquants.' }, { status: 400 })
  }

  if (!isAdmin(ctx) && ctx.storeId !== storeId) {
    return NextResponse.json({ error: 'Ce magasin n’est pas le vôtre.' }, { status: 403 })
  }

  const parsedItems = items.map((item: { productId: unknown; quantity: unknown; unitPrice: unknown; unit?: unknown; tonnage?: unknown }) => ({
    productId: Number(item.productId),
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    unit: item.unit === 'tonne' ? ('tonne' as const) : ('sack' as const),
    tonnage: item.tonnage !== undefined && item.tonnage !== null ? Number(item.tonnage) : undefined,
  }))

  if (
    parsedItems.some(
      (item: { productId: number; quantity: number; unitPrice: number; unit: 'sack' | 'tonne'; tonnage: number | undefined }) =>
        !Number.isFinite(item.productId) ||
        !Number.isFinite(item.unitPrice) ||
        (item.unit === 'tonne' ? !Number.isFinite(item.tonnage) || (item.tonnage as number) <= 0 : !Number.isFinite(item.quantity) || item.quantity <= 0),
    )
  ) {
    return NextResponse.json({ error: 'Lignes d’articles invalides.' }, { status: 400 })
  }

  try {
    const sale = await createSale({
      storeId,
      clientId: body.clientId ? Number(body.clientId) : null,
      paymentStatus,
      paidNow: Number(body.paidNow ?? 0),
      dueInDays: Number(body.dueInDays ?? 15),
      items: parsedItems,
    })
    return NextResponse.json({ sale }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
