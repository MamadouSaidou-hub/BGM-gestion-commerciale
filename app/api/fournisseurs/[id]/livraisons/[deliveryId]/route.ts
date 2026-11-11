import { NextResponse } from 'next/server'
import { deleteSupplierDelivery, updateSupplierDelivery } from '@/lib/db/mutations'
import { toApiErrorMessage } from '@/lib/api-error'
import { getSessionContext, isAdmin } from '@/lib/session'

export async function PATCH(request: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const { deliveryId } = await params
  const id = Number(deliveryId)
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Livraison introuvable.' }, { status: 400 })

  const body = await request.json()
  const sackCount = Number(body.sackCount)
  const paymentStatus = body.paymentStatus as 'paid' | 'partial' | 'credit'

  if (!Number.isFinite(sackCount) || sackCount <= 0 || !['paid', 'partial', 'credit'].includes(paymentStatus)) {
    return NextResponse.json({ error: 'Champs invalides ou manquants.' }, { status: 400 })
  }

  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : undefined

  try {
    const delivery = await updateSupplierDelivery(
      id,
      {
        sackCount,
        tonnage: body.tonnage ? Number(body.tonnage) : null,
        reference: body.reference ? String(body.reference) : undefined,
        paymentStatus,
        paidNow: Number(body.paidNow ?? 0),
        dueInDays: Number(body.dueInDays ?? 30),
      },
      { userId: ctx.userId, userName: ctx.userName },
      reason,
    )
    return NextResponse.json({ delivery })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const { deliveryId } = await params
  const id = Number(deliveryId)
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Livraison introuvable.' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : undefined

  try {
    await deleteSupplierDelivery(id, { userId: ctx.userId, userName: ctx.userName }, reason)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
