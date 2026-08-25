import { and, eq, sql } from 'drizzle-orm'
import { db } from '../client'
import { products, stockLevels, stockMovements, transferItems, transfers } from '../schema'
import { getQuantity } from './shared'

export async function createTransfer(input: {
  fromStoreId: number
  toStoreId: number
  items: { productId: number; quantity: number }[]
}) {
  if (input.items.length === 0) {
    throw new Error('Un transfert doit contenir au moins un article.')
  }
  if (input.fromStoreId === input.toStoreId) {
    throw new Error('Le magasin de destination doit être différent du magasin d’origine.')
  }

  return db.transaction(async (tx) => {
    const productRows = await tx.select().from(products)
    const productMap = new Map(productRows.map((product) => [product.id, product]))

    for (const item of input.items) {
      const available = await getQuantity(tx, item.productId, input.fromStoreId)
      if (available < item.quantity) {
        const product = productMap.get(item.productId)
        throw new Error(`Stock insuffisant pour ${product?.name ?? 'cet article'} (disponible : ${available}).`)
      }
    }

    const [{ count }] = await tx.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(transfers)
    const reference = `TR-${1000 + count + 1}`

    const [transfer] = await tx
      .insert(transfers)
      .values({
        reference,
        fromStoreId: input.fromStoreId,
        toStoreId: input.toStoreId,
        status: 'in_transit',
      })
      .returning()

    await tx.insert(transferItems).values(
      input.items.map((item) => ({ transferId: transfer.id, productId: item.productId, quantity: item.quantity })),
    )

    for (const item of input.items) {
      const currentQuantity = await getQuantity(tx, item.productId, input.fromStoreId)
      await tx
        .update(stockLevels)
        .set({ quantity: currentQuantity - item.quantity })
        .where(and(eq(stockLevels.productId, item.productId), eq(stockLevels.storeId, input.fromStoreId)))
      await tx.insert(stockMovements).values({
        type: 'transfer_out',
        productId: item.productId,
        storeId: input.fromStoreId,
        quantity: -item.quantity,
        reference: transfer.reference,
      })
    }

    return transfer
  })
}

export async function receiveTransfer(transferId: number) {
  return db.transaction(async (tx) => {
    const [transfer] = await tx.select().from(transfers).where(eq(transfers.id, transferId))
    if (!transfer) {
      throw new Error('Transfert introuvable.')
    }
    if (transfer.status === 'completed') {
      throw new Error('Ce transfert a déjà été marqué comme reçu.')
    }

    const items = await tx.select().from(transferItems).where(eq(transferItems.transferId, transferId))

    for (const item of items) {
      const [existing] = await tx
        .select({ id: stockLevels.id, quantity: stockLevels.quantity })
        .from(stockLevels)
        .where(and(eq(stockLevels.productId, item.productId), eq(stockLevels.storeId, transfer.toStoreId)))

      if (existing) {
        await tx
          .update(stockLevels)
          .set({ quantity: existing.quantity + item.quantity })
          .where(eq(stockLevels.id, existing.id))
      } else {
        await tx.insert(stockLevels).values({
          productId: item.productId,
          storeId: transfer.toStoreId,
          quantity: item.quantity,
        })
      }

      await tx.insert(stockMovements).values({
        type: 'transfer_in',
        productId: item.productId,
        storeId: transfer.toStoreId,
        quantity: item.quantity,
        reference: transfer.reference,
      })
    }

    const [updated] = await tx
      .update(transfers)
      .set({ status: 'completed' })
      .where(eq(transfers.id, transferId))
      .returning()

    return updated
  })
}
