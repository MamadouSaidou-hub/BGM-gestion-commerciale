import { and, eq, sql } from 'drizzle-orm'
import { db } from '../client'
import { payments, paymentMethod, products, receivables, saleItems, sales, stockLevels, stockMovements } from '../schema'
import { getQuantity } from './shared'
import { businessConfig } from '@/lib/business-config'
import { recordAutoCashMovement } from './cash-accounts'

export async function createSale(input: {
  storeId: number
  clientId?: number | null
  paymentStatus: 'paid' | 'partial' | 'credit'
  paidNow: number
  method?: (typeof paymentMethod)[number]
  dueInDays: number
  items: { productId: number; quantity: number; unit?: 'sack' | 'tonne'; tonnage?: number }[]
}) {
  if (input.items.length === 0) {
    throw new Error('Une vente doit contenir au moins un article.')
  }
  const method = input.method ?? 'cash'

  const sale = await db.transaction(async (tx) => {
    const productRows = await tx.select().from(products)
    const productMap = new Map(productRows.map((product) => [product.id, product]))

    const items = input.items.map((item) => {
      const product = productMap.get(item.productId)
      if (!product) {
        throw new Error('Article introuvable.')
      }
      // The sale price always comes from the product catalog, never from client input — a seller
      // cannot under- or over-charge by tampering with the request.
      const unitPrice = product.unitPrice

      if (item.unit === 'tonne') {
        if (!product.sackWeightKg) {
          throw new Error(
            `Ce produit n'a pas de poids de ${businessConfig.unit.baseSingularLower} configuré, vente en ${businessConfig.unit.bulkLabel.toLowerCase()}s impossible.`,
          )
        }
        const tonnage = item.tonnage ?? 0
        const quantity = Math.round((tonnage * businessConfig.unit.bulkConversionFactor) / product.sackWeightKg)
        return { ...item, quantity, unitPrice, unit: 'tonne' as const, tonnage }
      }
      return { ...item, unitPrice, unit: 'sack' as const, tonnage: null }
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

    // Recorded whenever money actually changes hands at the point of sale, and the sale has a
    // client to attribute it to (payments.clientId is required) — fixes a client's "totalPaid"
    // previously only counting partial top-ups, never a sale paid in full on the spot.
    if (input.clientId) {
      const paidAtSale = input.paymentStatus === 'paid' ? totalAmount : input.paymentStatus === 'partial' ? input.paidNow : 0
      if (paidAtSale > 0) {
        await tx.insert(payments).values({
          clientId: input.clientId,
          saleId: sale.id,
          storeId: input.storeId,
          amount: paidAtSale,
          method,
        })
      }
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

  // Outside the transaction: recordAutoCashMovement uses its own connection, and only runs once
  // the sale has actually committed (never want a cash entry for a sale that got rolled back).
  const receivedNow = input.paymentStatus === 'paid' ? sale.totalAmount : input.paymentStatus === 'partial' ? input.paidNow : 0
  if (receivedNow > 0) {
    await recordAutoCashMovement({
      direction: 'in',
      amount: receivedNow,
      storeId: input.storeId,
      category: 'Vente',
      description: `Vente #${sale.reference}`,
    })
  }

  return sale
}
