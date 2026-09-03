import { NextResponse } from 'next/server'
import { checkAndGrantSupplierCycle, computeDiscount, currentPeriod } from '@/lib/db/mutations'
import { getSessionContext, isAdmin } from '@/lib/session'

export async function POST(_request: Request, { params }: { params: Promise<{ partyType: string; partyId: string }> }) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const { partyType, partyId } = await params
  if ((partyType !== 'client' && partyType !== 'supplier') || !Number.isFinite(Number(partyId))) {
    return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 })
  }

  if (partyType === 'client') {
    const result = await computeDiscount('client', Number(partyId), currentPeriod())
    return NextResponse.json({ result })
  }

  // Supplier: no calendar period — checks whether the current cycle has crossed a tier, grants it and
  // resets the cycle if so. Returns null (no grant yet) rather than a zeroed-out result.
  const grant = await checkAndGrantSupplierCycle(Number(partyId))
  return NextResponse.json({ result: grant })
}
