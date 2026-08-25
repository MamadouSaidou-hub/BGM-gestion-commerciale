import { NextResponse } from 'next/server'
import { recordSupplierDelivery } from '@/lib/db/mutations'
import { toApiErrorMessage } from '@/lib/api-error'
import { getSessionContext, isAdmin } from '@/lib/session'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const { id } = await params
  const supplierId = Number(id)
  const body = await request.json()

  const storeId = Number(body.storeId)
  const productId = Number(body.productId)
  const sackCount = Number(body.sackCount)
  const paymentStatus = body.paymentStatus as 'paid' | 'partial' | 'credit'

  if (
    !Number.isFinite(supplierId) ||
    !Number.isFinite(storeId) ||
    !Number.isFinite(productId) ||
    !Number.isFinite(sackCount) ||
    sackCount <= 0 ||
    !['paid', 'partial', 'credit'].includes(paymentStatus)
  ) {
    return NextResponse.json({ error: 'Champs invalides ou manquants.' }, { status: 400 })
  }

  try {
    const delivery = await recordSupplierDelivery({
      supplierId,
      storeId,
      productId,
      sackCount,
      tonnage: body.tonnage ? Number(body.tonnage) : null,
      reference: body.reference ? String(body.reference) : undefined,
      paymentStatus,
      paidNow: Number(body.paidNow ?? 0),
      dueInDays: Number(body.dueInDays ?? 30),
    })
    return NextResponse.json({ delivery }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
