import { NextResponse } from 'next/server'
import { recordSupplierPayment } from '@/lib/db/mutations'
import { toApiErrorMessage } from '@/lib/api-error'
import { getSessionContext, isAdmin } from '@/lib/session'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const { id } = await params
  const supplierId = Number(id)
  const body = await request.json()
  const amount = Number(body.amount)
  const method = body.method as 'cash' | 'mobile_money' | 'bank_transfer' | 'check'

  if (!Number.isFinite(supplierId) || !Number.isFinite(amount) || amount <= 0 || !['cash', 'mobile_money', 'bank_transfer', 'check'].includes(method)) {
    return NextResponse.json({ error: 'Champs invalides ou manquants.' }, { status: 400 })
  }

  try {
    await recordSupplierPayment({ supplierId, amount, method })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
