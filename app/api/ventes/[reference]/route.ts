import { NextResponse } from 'next/server'
import { getSaleDetail } from '@/lib/db/queries'
import { updateSale } from '@/lib/db/mutations'
import { toApiErrorMessage } from '@/lib/api-error'
import { getSessionContext, isAdmin } from '@/lib/session'

export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const { reference } = await params
  const sale = await getSaleDetail(reference)
  if (!sale) return NextResponse.json({ error: 'Vente introuvable.' }, { status: 404 })
  return NextResponse.json({ sale })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const { reference } = await params
  const body = await request.json()
  const paymentStatus = body.paymentStatus as 'paid' | 'partial' | 'credit'
  const method = body.method as 'cash' | 'mobile_money' | 'bank_transfer' | 'check' | undefined
  const items = Array.isArray(body.items) ? body.items : []

  if (
    !['paid', 'partial', 'credit'].includes(paymentStatus) ||
    (method !== undefined && !['cash', 'mobile_money', 'bank_transfer', 'check'].includes(method)) ||
    items.length === 0
  ) {
    return NextResponse.json({ error: 'Champs invalides ou manquants.' }, { status: 400 })
  }

  const parsedItems = items.map((item: { productId: unknown; quantity: unknown; unit?: unknown; tonnage?: unknown }) => ({
    productId: Number(item.productId),
    quantity: Number(item.quantity),
    unit: item.unit === 'tonne' ? ('tonne' as const) : ('sack' as const),
    tonnage: item.tonnage !== undefined && item.tonnage !== null ? Number(item.tonnage) : undefined,
  }))

  if (
    parsedItems.some(
      (item: { productId: number; quantity: number; unit: 'sack' | 'tonne'; tonnage: number | undefined }) =>
        !Number.isFinite(item.productId) ||
        (item.unit === 'tonne' ? !Number.isFinite(item.tonnage) || (item.tonnage as number) <= 0 : !Number.isFinite(item.quantity) || item.quantity <= 0),
    )
  ) {
    return NextResponse.json({ error: 'Lignes d’articles invalides.' }, { status: 400 })
  }

  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : undefined

  try {
    const sale = await updateSale(
      reference,
      {
        clientId: body.clientId ? Number(body.clientId) : null,
        paymentStatus,
        paidNow: Number(body.paidNow ?? 0),
        method,
        dueInDays: Number(body.dueInDays ?? 15),
        items: parsedItems,
      },
      { userId: ctx.userId, userName: ctx.userName },
      reason,
    )
    return NextResponse.json({ sale })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
