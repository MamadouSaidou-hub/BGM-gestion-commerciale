import { NextRequest, NextResponse } from 'next/server'
import { transferBetweenCashAccounts } from '@/lib/db/mutations'
import { toApiErrorMessage } from '@/lib/api-error'
import { getSessionContext, isAdmin } from '@/lib/session'

export async function POST(request: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const body = await request.json()
  const fromId = Number(body.fromId)
  const toId = Number(body.toId)
  const amount = Number(body.amount)
  const description = body.description ? String(body.description).trim() : undefined

  if (!Number.isFinite(fromId) || !Number.isFinite(toId) || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Champs invalides ou manquants.' }, { status: 400 })
  }

  try {
    const result = await transferBetweenCashAccounts({ fromId, toId, amount, description })
    return NextResponse.json({ ok: true, ...result }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
