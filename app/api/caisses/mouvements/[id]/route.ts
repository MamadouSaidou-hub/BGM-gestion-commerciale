import { NextRequest, NextResponse } from 'next/server'
import { deleteCashMovement, updateCashMovement } from '@/lib/db/mutations'
import { cashMovementType } from '@/lib/db/schema'
import { toApiErrorMessage } from '@/lib/api-error'
import { isExpenseCategory } from '@/lib/expense-categories'
import { getSessionContext, isAdmin } from '@/lib/session'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const { id } = await params
  const movementId = Number(id)
  if (!Number.isFinite(movementId)) return NextResponse.json({ error: 'Mouvement introuvable.' }, { status: 400 })

  const body = await request.json()
  const type = body.type as (typeof cashMovementType)[number]
  const category = String(body.category ?? '').trim()
  const description = body.description ? String(body.description).trim() : null
  const amount = Number(body.amount)
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : undefined

  if (!cashMovementType.includes(type) || !category || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Champs invalides ou manquants.' }, { status: 400 })
  }
  if (type === 'expense' && !isExpenseCategory(category)) {
    return NextResponse.json({ error: 'Catégorie de dépense invalide.' }, { status: 400 })
  }

  try {
    const movement = await updateCashMovement(movementId, { type, category, description, amount }, { userId: ctx.userId, userName: ctx.userName }, reason)
    return NextResponse.json({ movement })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const { id } = await params
  const movementId = Number(id)
  if (!Number.isFinite(movementId)) return NextResponse.json({ error: 'Mouvement introuvable.' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : undefined

  try {
    await deleteCashMovement(movementId, { userId: ctx.userId, userName: ctx.userName }, reason)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
