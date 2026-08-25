import { NextRequest, NextResponse } from 'next/server'
import { getStockCountHistory } from '@/lib/db/queries'
import { recordStockCount } from '@/lib/db/mutations'
import { toApiErrorMessage } from '@/lib/api-error'
import { effectiveStoreParam, getSessionContext, isAdmin } from '@/lib/session'

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })

  const store = effectiveStoreParam(ctx, request.nextUrl.searchParams.get('store'))
  const counts = await getStockCountHistory(store)
  return NextResponse.json({ counts })
}

export async function POST(request: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })

  const body = await request.json()
  const productId = Number(body.productId)
  const storeId = Number(body.storeId)
  const countedQty = Number(body.countedQty)

  if (!Number.isFinite(productId) || !Number.isFinite(storeId) || !Number.isFinite(countedQty) || countedQty < 0) {
    return NextResponse.json({ error: 'Champs invalides ou manquants.' }, { status: 400 })
  }

  if (!isAdmin(ctx) && ctx.storeId !== storeId) {
    return NextResponse.json({ error: 'Ce magasin n’est pas le vôtre.' }, { status: 403 })
  }

  try {
    const result = await recordStockCount({ productId, storeId, countedQty, countedBy: ctx.userId })
    return NextResponse.json({ result }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
