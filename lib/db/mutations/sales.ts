import { and, eq, sql } from 'drizzle-orm'
import { db } from '../client'
import { payments, products, receivables, saleItems, sales, stockLevels, stockMovements } from '../schema'
import { getQuantity } from './shared'

export async function createSale(input: {
  storeId: number
  clientId?: number | null
  paymentStatus: 'paid' | 'partial' | 'credit'
  paidNow: number
  dueInDays: number
  items: { productId: number; quantity: number; unitPrice: number; unit?: 'sack' | 'tonne'; tonnage?: number }[]
}) {
  if (input.items.length === 0) {
    throw new Error('Une vente doit contenir au moins un article.')
  }

  return db.transaction(async (tx) => {
    const productRows = await tx.select().from(products)
    const productMap = new Map(productRows.map((product) => [product.id, product]))

    const items = input.items.map((item) => {
      if (item.unit === 'tonne') {
        const product = productMap.get(item.productId)
        if (!product?.sackWeightKg) {
          throw new Error('Ce produit n\'a pas de poids de sac configuré, vente en tonnes impossible.')
        }
        const tonnage = item.tonnage ?? 0
        const quantity = Math.round((tonnage * 1000) / product.sackWeightKg)
        return { ...item, quantity, unit: 'tonne' as const, tonnage }
      }
      return { ...item, unit: 'sack' as const, tonnage: null }
    })

    for (const item of items) {
      const available = await getQuantity(tx, item.productId, input.storeId)
      if (available < item.quantity) {
        const product = productMap.get(item.productId)
        throw new Error(`Stock insuffisant pour ${product?.name ?? 'cet article'} (disponible : ${available}).`)
      }
    }

    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const costAmount = items.reduce((sum, item) => {
      const product = productMap.get(item.productId)
      return sum + item.quantity * (product?.costPrice ?? 0)
    }, 0)

    const [{ count }] = await tx.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(sales)
    const reference = `BG-${1000 + count + 1}`

    const [sale] = await tx
      .insert(sales)
      .values({
        reference,
        storeId: input.storeId,
        clientId: input.clientId ?? null,
        totalAmount,
        costAmount,
        paymentStatus: input.paymentStatus,
      })
      .returning()

    await tx.insert(saleItems).values(
      items.map((item) => ({
        saleId: sale.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unit: item.unit,
        tonnage: item.tonnage,
      })),
    )

    for (const item of items) {
      const currentQuantity = await getQuantity(tx, item.productId, input.storeId)
      await tx
        .update(stockLevels)
        .set({ quantity: currentQuantity - item.quantity })
        .where(and(eq(stockLevels.productId, item.productId), eq(stockLevels.storeId, input.storeId)))
      await tx.insert(stockMovements).values({
        type: 'sale',
        productId: item.productId,
        storeId: input.storeId,
        quantity: -item.quantity,
        reference: sale.reference,
      })
    }

    if (input.paymentStatus === 'partial' && input.paidNow > 0 && input.clientId) {
      await tx.insert(payments).values({
        clientId: input.clientId,
        saleId: sale.id,
        storeId: input.storeId,
        amount: input.paidNow,
        method: 'cash',
      })
    }

    if ((input.paymentStatus === 'credit' || input.paymentStatus === 'partial') && input.clientId) {
      const remaining = totalAmount - input.paidNow
      if (remaining > 0) {
        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + input.dueInDays)
        await tx.insert(receivables).values({
          clientId: input.clientId,
          saleId: sale.id,
          amount: remaining,
          dueDate: dueDate.toISOString(),
          status: 'pending',
        })
      }
    }

    return sale
  })
}
