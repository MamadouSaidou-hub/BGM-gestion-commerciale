import { NextRequest, NextResponse } from 'next/server'
import { getDiscountHistory, getDiscountScale } from '@/lib/db/queries'
import { setDiscountTiers, type PartyType } from '@/lib/db/mutations'
import { toApiErrorMessage } from '@/lib/api-error'
import { getSessionContext, isAdmin } from '@/lib/session'

function parseParty(partyType: string, partyId: string): PartyType | null {
  if (partyType !== 'client' && partyType !== 'supplier') return null
  if (!Number.isFinite(Number(partyId))) return null
  return partyType
}

export async function GET(_request: Request, { params }: { params: Promise<{ partyType: string; partyId: string }> }) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const { partyType, partyId } = await params
  const type = parseParty(partyType, partyId)
  if (!type) return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 })

  const [scale, history] = await Promise.all([getDiscountScale(type, Number(partyId)), getDiscountHistory(type, Number(partyId))])
  return NextResponse.json({ ...scale, history })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ partyType: string; partyId: string }> }) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const { partyType, partyId } = await params
  const type = parseParty(partyType, partyId)
  if (!type) return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 })

  const body = await request.json()
  const tiers = Array.isArray(body.tiers) ? body.tiers : []
  const parsedTiers = tiers.map((tier: { thresholdSacks: unknown; discountPerSack: unknown }) => ({
    thresholdSacks: Number(tier.thresholdSacks),
    discountPerSack: Number(tier.discountPerSack),
  }))

  if (parsedTiers.some((tier: { thresholdSacks: number; discountPerSack: number }) => !Number.isFinite(tier.thresholdSacks) || tier.thresholdSacks <= 0 || !Number.isFinite(tier.discountPerSack) || tier.discountPerSack < 0)) {
    return NextResponse.json({ error: 'Paliers invalides.' }, { status: 400 })
  }

  try {
    await setDiscountTiers(type, Number(partyId), parsedTiers)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
