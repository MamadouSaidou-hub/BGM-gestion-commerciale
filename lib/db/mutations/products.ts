import { and, eq } from 'drizzle-orm'
import { db } from '../client'
import { products, stockLevels, stockMovements, stores } from '../schema'
import { getQuantity } from './shared'

export async function createProduct(input: {
  name: string
  sku: string
  category: string
  unitPrice: number
  costPrice: number
  reorderThreshold: number
  storeId: number
  initialQuantity: number
}) {
  const [product] = await db
    .insert(products)
    .values({
      name: input.name,
      sku: input.sku,
      category: input.category,
      unitPrice: input.unitPrice,
      costPrice: input.costPrice,
      reorderThreshold: input.reorderThreshold,
    })
    .returning()

  const storeRows = await db.select({ id: stores.id }).from(stores)
  await db.insert(stockLevels).values(
    storeRows.map((store) => ({
      productId: product.id,
      storeId: store.id,
      quantity: store.id === input.storeId ? input.initialQuantity : 0,
    })),
  )

  if (input.initialQuantity > 0) {
    await db.insert(stockMovements).values({
      type: 'reception',
      productId: product.id,
      storeId: input.storeId,
      quantity: input.initialQuantity,
      reference: 'Création article',
    })
  }

  return product
}

export async function addStockReception(input: { productId: number; storeId: number; quantity: number; reference?: string }) {
  const currentQuantity = await getQuantity(db, input.productId, input.storeId)

  await db
    .update(stockLevels)
    .set({ quantity: currentQuantity + input.quantity })
    .where(and(eq(stockLevels.productId, input.productId), eq(stockLevels.storeId, input.storeId)))

  await db.insert(stockMovements).values({
    type: 'reception',
    productId: input.productId,
    storeId: input.storeId,
    quantity: input.quantity,
    reference: input.reference ?? null,
  })
}
