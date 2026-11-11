import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../client'
import { auditLog, products, stockLevels, stockMovements, supplierDeliveries, supplierPayables, suppliers } from '../schema'
import { getQuantity } from './shared'
import { checkAndGrantSupplierCycle } from './discounts'

type Actor = { userId: string; userName: string }

type DeliveryInput = {
  sackCount: number
  tonnage?: number | null
  reference?: string
  paymentStatus: 'paid' | 'partial' | 'credit'
  paidNow: number
  dueInDays: number
}

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

/**
 * Undoes what `recordSupplierDelivery` did for one delivery: removes the stock it added back out
 * (logged as an `adjustment` movement, same convention as `reverseSaleEffects`) and deletes the
 * payable it may have created. Throws if the current stock can't cover the removal — meaning some
 * of this delivery's stock has already been sold or transferred elsewhere, so reversing it blindly
 * would take a product/store negative.
 *
 * Deliberately does NOT try to "ungrant" a supplier discount tier this delivery may have helped
 * reach — `checkAndGrantSupplierCycle` only ever grants forward, there is no reversal path for it
 * in this codebase, and retracting an already-granted discount is a business decision, not
 * something to silently infer here. Callers should warn the admin instead (see deleteSupplierDelivery).
 */
async function reverseDeliveryEffects(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], delivery: typeof supplierDeliveries.$inferSelect) {
  const currentQuantity = await getQuantity(tx, delivery.productId, delivery.storeId)
  if (currentQuantity < delivery.sackCount) {
    throw new Error(`Stock insuffisant pour annuler cette livraison (disponible : ${currentQuantity}, à retirer : ${delivery.sackCount}) — une partie a déjà été vendue ou transférée.`)
  }

  await tx
    .update(stockLevels)
    .set({ quantity: currentQuantity - delivery.sackCount })
    .where(and(eq(stockLevels.productId, delivery.productId), eq(stockLevels.storeId, delivery.storeId)))
  await tx.insert(stockMovements).values({
    type: 'adjustment',
    productId: delivery.productId,
    storeId: delivery.storeId,
    quantity: -delivery.sackCount,
    reference: `Annulation livraison #${delivery.id}`,
  })

  await tx.delete(supplierPayables).where(eq(supplierPayables.deliveryId, delivery.id))
}

/**
 * Corrects a delivery entered by mistake (wrong sack count or payment terms) without losing its
 * id — reverses its stock/payable effects then re-applies them with the corrected input, same
 * shape as `updateSale`. The supplier/store/product can't be changed here, same reasoning as
 * `updateSale` not allowing a store change — cancel and re-record instead for that case.
 */
export async function updateSupplierDelivery(id: number, input: DeliveryInput, actor: Actor, reason?: string) {
  if (input.sackCount <= 0) {
    throw new Error('Le nombre de sacs doit être supérieur à zéro.')
  }

  const { before, after } = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(supplierDeliveries).where(and(eq(supplierDeliveries.id, id), isNull(supplierDeliveries.deletedAt)))
    if (!existing) {
      throw new Error('Livraison introuvable.')
    }

    await reverseDeliveryEffects(tx, existing)

    const [product] = await tx.select().from(products).where(eq(products.id, existing.productId))
    if (!product) {
      throw new Error('Produit introuvable.')
    }
    const totalAmount = input.sackCount * product.costPrice

    const [updated] = await tx
      .update(supplierDeliveries)
      .set({ reference: input.reference ?? null, sackCount: input.sackCount, tonnage: input.tonnage ?? null, totalAmount })
      .where(eq(supplierDeliveries.id, id))
      .returning()

    const currentQuantity = await getQuantity(tx, existing.productId, existing.storeId)
    await tx
      .update(stockLevels)
      .set({ quantity: currentQuantity + input.sackCount })
      .where(and(eq(stockLevels.productId, existing.productId), eq(stockLevels.storeId, existing.storeId)))
    await tx.insert(stockMovements).values({
      type: 'reception',
      productId: existing.productId,
      storeId: existing.storeId,
      quantity: input.sackCount,
      reference: updated.reference ?? `Livraison fournisseur #${updated.id}`,
    })

    if (input.paymentStatus !== 'paid') {
      const remaining = totalAmount - input.paidNow
      if (remaining > 0) {
        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + input.dueInDays)
        await tx.insert(supplierPayables).values({
          supplierId: existing.supplierId,
          deliveryId: updated.id,
          amount: remaining,
          dueDate: dueDate.toISOString(),
          status: 'pending',
        })
      }
    }

    const before = existing
    const after = updated
    await tx.insert(auditLog).values({
      entityType: 'supplier_delivery',
      entityId: id,
      action: 'update',
      actorId: actor.userId,
      actorName: actor.userName,
      reason: reason ?? null,
      beforeData: before,
      afterData: after,
    })

    return { before, after }
  })

  try {
    await checkAndGrantSupplierCycle(before.supplierId)
  } catch (error) {
    console.error('checkAndGrantSupplierCycle failed after updateSupplierDelivery', error)
  }

  return after
}

/**
 * Soft-deletes a delivery recorded by mistake — reverses its stock/payable effects and flags
 * `deletedAt`. See reverseDeliveryEffects's docstring for what this deliberately does not do
 * (retract an already-granted discount tier).
 */
export async function deleteSupplierDelivery(id: number, actor: Actor, reason?: string) {
  const existing = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(supplierDeliveries).where(and(eq(supplierDeliveries.id, id), isNull(supplierDeliveries.deletedAt)))
    if (!existing) {
      throw new Error('Livraison introuvable.')
    }

    await reverseDeliveryEffects(tx, existing)
    const deletedAt = new Date().toISOString()
    await tx.update(supplierDeliveries).set({ deletedAt }).where(eq(supplierDeliveries.id, id))

    await tx.insert(auditLog).values({
      entityType: 'supplier_delivery',
      entityId: id,
      action: 'delete',
      actorId: actor.userId,
      actorName: actor.userName,
      reason: reason ?? null,
      beforeData: existing,
    })

    return existing
  })

  return existing
}
