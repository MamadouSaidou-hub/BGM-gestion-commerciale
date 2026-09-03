import { and, eq } from 'drizzle-orm'
import { db } from '../client'
import { products, stockLevels, stockMovements, supplierDeliveries, supplierPayables, suppliers } from '../schema'
import { getQuantity } from './shared'
import { checkAndGrantSupplierCycle } from './discounts'

export async function createSupplier(input: { name: string; phone?: string }) {
  const [supplier] = await db.insert(suppliers).values({ name: input.name, phone: input.phone ?? null }).returning()
  return supplier
}

export async function recordSupplierDelivery(input: {
  supplierId: number
  storeId: number
  productId: number
  sackCount: number
  tonnage?: number | null
  reference?: string
  paymentStatus: 'paid' | 'partial' | 'credit'
  paidNow: number
  dueInDays: number
}) {
  if (input.sackCount <= 0) {
    throw new Error('Le nombre de sacs doit être supérieur à zéro.')
  }

  return db.transaction(async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.id, input.productId))
    if (!product) {
      throw new Error('Produit introuvable.')
    }

    const totalAmount = input.sackCount * product.costPrice

    const [delivery] = await tx
      .insert(supplierDeliveries)
      .values({
        supplierId: input.supplierId,
        storeId: input.storeId,
        productId: input.productId,
        reference: input.reference ?? null,
        sackCount: input.sackCount,
        tonnage: input.tonnage ?? null,
        totalAmount,
      })
      .returning()

    const currentQuantity = await getQuantity(tx, input.productId, input.storeId)
    await tx
      .update(stockLevels)
      .set({ quantity: currentQuantity + input.sackCount })
      .where(and(eq(stockLevels.productId, input.productId), eq(stockLevels.storeId, input.storeId)))
    await tx.insert(stockMovements).values({
      type: 'reception',
      productId: input.productId,
      storeId: input.storeId,
      quantity: input.sackCount,
      reference: delivery.reference ?? `Livraison fournisseur #${delivery.id}`,
    })

    if (input.paymentStatus !== 'paid') {
      const remaining = totalAmount - input.paidNow
      if (remaining > 0) {
        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + input.dueInDays)
        await tx.insert(supplierPayables).values({
          supplierId: input.supplierId,
          deliveryId: delivery.id,
          amount: remaining,
          dueDate: dueDate.toISOString(),
          status: 'pending',
        })
      }
    }

    return delivery
  }).then(async (delivery) => {
    // Best-effort: check whether this delivery crosses a discount-tier threshold and, if so, grant it.
    // Done after the transaction commits (so the delivery is visible), and never allowed to fail the
    // delivery itself — a discount-check glitch shouldn't block recording a real stock reception.
    try {
      await checkAndGrantSupplierCycle(input.supplierId)
    } catch (error) {
      console.error('checkAndGrantSupplierCycle failed after recordSupplierDelivery', error)
    }
    return delivery
  })
}
