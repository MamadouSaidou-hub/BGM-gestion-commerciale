import { NextResponse } from 'next/server'
import { computeDiscount, currentPeriod, type PartyType } from '@/lib/db/mutations'
import { getSessionContext, isAdmin } from '@/lib/session'

export async function POST(_request: Request, { params }: { params: Promise<{ partyType: string; partyId: string }> }) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const { partyType, partyId } = await params
  if ((partyType !== 'client' && partyType !== 'supplier') || !Number.isFinite(Number(partyId))) {
    return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 })
  }

  const result = await computeDiscount(partyType as PartyType, Number(partyId), currentPeriod())
  return NextResponse.json({ result })
}
