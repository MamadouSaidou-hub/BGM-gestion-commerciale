import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { products } from '@/lib/db/schema'
import { createProduct } from '@/lib/db/mutations'
import { toApiErrorMessage } from '@/lib/api-error'

export async function GET() {
  const rows = await db.select().from(products).orderBy(products.name)
  return NextResponse.json({ products: rows })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const name = String(body.name ?? '').trim()
  const sku = String(body.sku ?? '').trim()
  const category = String(body.category ?? '').trim()
  const unitPrice = Number(body.unitPrice)
  const costPrice = Number(body.costPrice)
  const storeId = Number(body.storeId)

  if (!name || !sku || !category || !Number.isFinite(unitPrice) || !Number.isFinite(costPrice) || !Number.isFinite(storeId)) {
    return NextResponse.json({ error: 'Champs invalides ou manquants.' }, { status: 400 })
  }

  try {
    const product = await createProduct({
      name,
      sku,
      category,
      unitPrice,
      costPrice,
      reorderThreshold: Number(body.reorderThreshold ?? 10),
      storeId,
      initialQuantity: Number(body.initialQuantity ?? 0),
    })
    return NextResponse.json({ product }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
