import { NextRequest, NextResponse } from 'next/server'
import { updateProduct } from '@/lib/db/mutations'
import { toApiErrorMessage } from '@/lib/api-error'
import { getSessionContext, isAdmin } from '@/lib/session'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const { id } = await params
  const productId = Number(id)
  if (!Number.isFinite(productId)) {
    return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 })
  }

  const body = await request.json()
  const input: { unitPrice?: number; costPrice?: number; reorderThreshold?: number } = {}

  if (body.unitPrice !== undefined) {
    const unitPrice = Number(body.unitPrice)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return NextResponse.json({ error: 'Prix de vente invalide.' }, { status: 400 })
    input.unitPrice = unitPrice
  }
  if (body.costPrice !== undefined) {
    const costPrice = Number(body.costPrice)
    if (!Number.isFinite(costPrice) || costPrice < 0) return NextResponse.json({ error: 'Prix de revient invalide.' }, { status: 400 })
    input.costPrice = costPrice
  }
  if (body.reorderThreshold !== undefined) {
    const reorderThreshold = Number(body.reorderThreshold)
    if (!Number.isFinite(reorderThreshold) || reorderThreshold < 0) return NextResponse.json({ error: 'Seuil invalide.' }, { status: 400 })
    input.reorderThreshold = reorderThreshold
  }

  if (Object.keys(input).length === 0) {
    return NextResponse.json({ error: 'Aucune modification fournie.' }, { status: 400 })
  }

  try {
    const product = await updateProduct(productId, input)
    return NextResponse.json({ product })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
