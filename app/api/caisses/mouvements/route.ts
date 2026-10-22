import { NextRequest, NextResponse } from 'next/server'
import { recordCashMovement } from '@/lib/db/mutations'
import { cashMovementType } from '@/lib/db/schema'
import { toApiErrorMessage } from '@/lib/api-error'
import { getSessionContext, isAdmin } from '@/lib/session'

export async function POST(request: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const body = await request.json()
  const cashAccountId = Number(body.cashAccountId)
  const type = body.type as (typeof cashMovementType)[number]
  const category = String(body.category ?? '').trim()
  const description = body.description ? String(body.description).trim() : null
  const amount = Number(body.amount)
  const storeId = body.storeId ? Number(body.storeId) : null

  if (!Number.isFinite(cashAccountId) || !cashMovementType.includes(type) || !category || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Champs invalides ou manquants.' }, { status: 400 })
  }

  try {
    const movement = await recordCashMovement({ cashAccountId, type, category, description, amount, storeId })
    return NextResponse.json({ movement }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
