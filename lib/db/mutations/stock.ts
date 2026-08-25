import { and, eq } from 'drizzle-orm'
import { db } from '../client'
import { stockCounts, stockLevels, stockMovements } from '../schema'
import { getQuantity } from './shared'

export async function recordStockCount(input: { storeId: number; productId: number; countedQty: number; countedBy: string }) {
  if (input.countedQty < 0) {
    throw new Error('La quantité comptée ne peut pas être négative.')
  }

  return db.transaction(async (tx) => {
    const theoreticalQty = await getQuantity(tx, input.productId, input.storeId)
    const variance = input.countedQty - theoreticalQty

    await tx.insert(stockCounts).values({
      storeId: input.storeId,
      productId: input.productId,
      theoreticalQty,
      countedQty: input.countedQty,
      variance,
      countedBy: input.countedBy,
    })

    await tx
      .update(stockLevels)
      .set({ quantity: input.countedQty })
      .where(and(eq(stockLevels.productId, input.productId), eq(stockLevels.storeId, input.storeId)))

    if (variance !== 0) {
      await tx.insert(stockMovements).values({
        type: 'adjustment',
        productId: input.productId,
        storeId: input.storeId,
        quantity: variance,
        note: 'Comptage physique',
      })
    }

    return { theoreticalQty, countedQty: input.countedQty, variance }
  })
}
