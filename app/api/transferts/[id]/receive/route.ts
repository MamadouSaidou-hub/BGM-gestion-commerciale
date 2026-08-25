import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { transfers } from '@/lib/db/schema'
import { receiveTransfer } from '@/lib/db/mutations'
import { toApiErrorMessage } from '@/lib/api-error'
import { getSessionContext, isAdmin } from '@/lib/session'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })

  const { id } = await params
  const transferId = Number(id)

  if (!Number.isFinite(transferId)) {
    return NextResponse.json({ error: 'Identifiant de transfert invalide.' }, { status: 400 })
  }

  const [transfer] = await db.select().from(transfers).where(eq(transfers.id, transferId))
  if (!transfer) {
    return NextResponse.json({ error: 'Transfert introuvable.' }, { status: 404 })
  }

  if (!isAdmin(ctx) && ctx.storeId !== transfer.toStoreId) {
    return NextResponse.json({ error: 'Seul le magasin destinataire peut confirmer la réception.' }, { status: 403 })
  }

  try {
    await receiveTransfer(transferId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
