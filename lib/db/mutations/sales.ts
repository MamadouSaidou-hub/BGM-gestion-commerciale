import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../client'
import { auditLog, cashMovements, payments, paymentMethod, products, receivables, saleItems, sales, stockLevels, stockMovements } from '../schema'
import { getQuantity } from './shared'
import { businessConfig } from '@/lib/business-config'
import { recordAutoCashMovement } from './cash-accounts'

type SaleActor = { userId: string; userName: string }

type SaleInput = {
  storeId: number
  clientId?: number | null
  paymentStatus: 'paid' | 'partial' | 'credit'
  paidNow: number
  method?: (typeof paymentMethod)[number]
  dueInDays: number
  items: { productId: number; quantity: number; unit?: 'sack' | 'tonne'; tonnage?: number }[]
}

/**
 * Prices every item from the product catalog (never trusting client-supplied prices), converts
 * tonnage to sack counts where needed, and checks stock sufficiency against whatever is in
 * `stockLevels` *right now* — shared by `createSale` and `updateSale`, since an edit's stock check
 * must run only after the old items' quantities have already been returned to stock (see
 * `updateSale`), at which point this is exactly the same check a fresh sale would do.
 */
async function resolveAndPriceItems(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], input: SaleInput) {
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

  return { items, totalAmount, costAmount }
}

export async function createSale(input: SaleInput) {
  if (input.items.length === 0) {
    throw new Error('Une vente doit contenir au moins un article.')
  }
  const method = input.method ?? 'cash'

  const sale = await db.transaction(async (tx) => {
    const { items, totalAmount, costAmount } = await resolveAndPriceItems(tx, input)

    // A Postgres sequence (not a count of existing rows) — counting breaks the moment a sale is
    // ever deleted (reused number) or two sales are created at nearly the same instant (both read
    // the same count before either inserts, both compute the same reference, the second insert
    // fails on the unique constraint). nextval() is atomic and never hands out the same value twice.
    const seqResult = await tx.execute<{ next: string }>(sql`SELECT nextval('sales_reference_seq') AS next`)
    const reference = `BG-${seqResult.rows[0].next}`

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

/**
 * Undoes exactly what `createSale` did for one sale: restores the stock it deducted (logged as
 * an `adjustment` movement, not a deletion of the original `sale` movement — same reasoning as
 * everywhere else in this file, the history should show what actually happened), finds how much
 * cash it put in the caisse, and removes the payment/receivable it created. Shared by `cancelSale`
 * (reverse, then soft-delete) and `updateSale` (reverse, then re-apply with the new input) so the
 * two don't drift into slightly different reversal logic over time.
 *
 * Deliberately does NOT touch anything from a *later*, separate client payment
 * (`recordPayment`, `payments.saleId === null`) even if it happened to settle this sale's
 * receivable — that money was real cash already recorded as its own "Encaissement client" cash
 * movement, independent of which specific debt it was applied to; reversing this sale just removes
 * the (now meaningless) obligation it tracked, it doesn't un-receive cash the business already has.
 */
async function reverseSaleEffects(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], sale: typeof sales.$inferSelect) {
  const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id))
  for (const item of items) {
    const currentQuantity = await getQuantity(tx, item.productId, sale.storeId)
    await tx
      .update(stockLevels)
      .set({ quantity: currentQuantity + item.quantity })
      .where(and(eq(stockLevels.productId, item.productId), eq(stockLevels.storeId, sale.storeId)))
    await tx.insert(stockMovements).values({
      type: 'adjustment',
      productId: item.productId,
      storeId: sale.storeId,
      quantity: item.quantity,
      reference: `Annulation vente #${sale.reference}`,
    })
  }

  // How much cash this sale actually put in the caisse at creation time — read from the cash
  // movement itself (matched by the exact description createSale gave it), not from `payments`:
  // a walk-in sale with no client never gets a `payments` row (clientId is required there) even
  // when fully paid in cash, so that table alone would under-count the reversal for those sales.
  const [cashMovement] = await tx
    .select()
    .from(cashMovements)
    .where(and(eq(cashMovements.category, 'Vente'), eq(cashMovements.description, `Vente #${sale.reference}`), isNull(cashMovements.deletedAt)))
    .orderBy(desc(cashMovements.createdAt))
    .limit(1)
  const reversedAmount = cashMovement?.amount ?? 0

  await tx.delete(payments).where(eq(payments.saleId, sale.id))
  await tx.delete(receivables).where(eq(receivables.saleId, sale.id))
  await tx.delete(saleItems).where(eq(saleItems.saleId, sale.id))

  return { items, reversedAmount }
}

/**
 * Reverses a sale recorded by mistake — restores the stock, removes the payment/receivable it
 * created, and soft-deletes the sale (kept in the database with `deletedAt` set, not erased) so an
 * admin can later see that it existed and who removed it. Admin-only (enforced by the API route),
 * meant for genuine input errors, not a general-purpose "returns" feature.
 */
export async function cancelSale(reference: string, actor: SaleActor, reason?: string) {
  const { sale, items, reversedAmount } = await db.transaction(async (tx) => {
    const [sale] = await tx.select().from(sales).where(and(eq(sales.reference, reference), isNull(sales.deletedAt)))
    if (!sale) {
      throw new Error('Vente introuvable.')
    }

    const { items, reversedAmount } = await reverseSaleEffects(tx, sale)
    const deletedAt = new Date().toISOString()
    await tx.update(sales).set({ deletedAt }).where(eq(sales.id, sale.id))
    await tx.insert(auditLog).values({
      entityType: 'sale',
      entityId: sale.id,
      action: 'delete',
      actorId: actor.userId,
      actorName: actor.userName,
      reason: reason ?? null,
      beforeData: { sale, items },
    })

    return { sale, items, reversedAmount }
  })

  // Outside the transaction, same reasoning as createSale's own cash movement: never delete the
  // original "money came in" record, add an equal-and-opposite one instead — the caisse's history
  // should show that a sale happened and was later cancelled, not pretend it never did.
  if (reversedAmount > 0) {
    await recordAutoCashMovement({
      direction: 'out',
      amount: reversedAmount,
      storeId: sale.storeId,
      category: 'Annulation vente',
      description: `Annulation vente #${sale.reference}`,
    })
  }

  return { sale, itemsRestored: items.length }
}

/**
 * Corrects a sale entered by mistake (wrong article, quantity, price tier, or client) without
 * losing its reference/id — reverses its stock/payment/receivable effects exactly like
 * `cancelSale`, then re-applies them with the corrected input, as if it had been entered
 * correctly the first time. The store cannot be changed here: moving a sale to a different store
 * mixes up which store's stock to reverse/apply and is rare enough that cancel-and-recreate is the
 * right tool for that case instead.
 */
export async function updateSale(reference: string, input: Omit<SaleInput, 'storeId'>, actor: SaleActor, reason?: string) {
  if (input.items.length === 0) {
    throw new Error('Une vente doit contenir au moins un article.')
  }
  const method = input.method ?? 'cash'

  const { before, after, reversedAmount } = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(sales).where(and(eq(sales.reference, reference), isNull(sales.deletedAt)))
    if (!existing) {
      throw new Error('Vente introuvable.')
    }

    const { items: oldItems, reversedAmount } = await reverseSaleEffects(tx, existing)
    const before = { sale: existing, items: oldItems }

    // Stock is back to what it was before this sale existed — resolving the new items against it
    // now is exactly the same check/pricing createSale does for a brand new sale.
    const { items, totalAmount, costAmount } = await resolveAndPriceItems(tx, { ...input, storeId: existing.storeId })

    const [sale] = await tx
      .update(sales)
      .set({ clientId: input.clientId ?? null, totalAmount, costAmount, paymentStatus: input.paymentStatus })
      .where(eq(sales.id, existing.id))
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
      const currentQuantity = await getQuantity(tx, item.productId, existing.storeId)
      await tx
        .update(stockLevels)
        .set({ quantity: currentQuantity - item.quantity })
        .where(and(eq(stockLevels.productId, item.productId), eq(stockLevels.storeId, existing.storeId)))
      await tx.insert(stockMovements).values({
        type: 'sale',
        productId: item.productId,
        storeId: existing.storeId,
        quantity: -item.quantity,
        reference: sale.reference,
      })
    }

    if (input.clientId) {
      const paidAtSale = input.paymentStatus === 'paid' ? totalAmount : input.paymentStatus === 'partial' ? input.paidNow : 0
      if (paidAtSale > 0) {
        await tx.insert(payments).values({ clientId: input.clientId, saleId: sale.id, storeId: existing.storeId, amount: paidAtSale, method })
      }
    }

    if ((input.paymentStatus === 'credit' || input.paymentStatus === 'partial') && input.clientId) {
      const remaining = totalAmount - input.paidNow
      if (remaining > 0) {
        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + input.dueInDays)
        await tx.insert(receivables).values({ clientId: input.clientId, saleId: sale.id, amount: remaining, dueDate: dueDate.toISOString(), status: 'pending' })
      }
    }

    const after = { sale, items }
    await tx.insert(auditLog).values({
      entityType: 'sale',
      entityId: sale.id,
      action: 'update',
      actorId: actor.userId,
      actorName: actor.userName,
      reason: reason ?? null,
      beforeData: before,
      afterData: after,
    })

    return { before, after, reversedAmount }
  })

  // Outside the transaction, mirroring createSale/cancelSale: never edit a historical cash entry
  // in place, append a compensating pair instead — an "out" for whatever the old version put in
  // the caisse, an "in" for whatever the corrected version actually puts in. Two entries rather
  // than one netted figure keeps the caisse's own history legible (a correction happened here).
  if (reversedAmount > 0) {
    await recordAutoCashMovement({
      direction: 'out',
      amount: reversedAmount,
      storeId: after.sale.storeId,
      category: 'Correction vente',
      description: `Correction vente #${after.sale.reference} (ancien montant)`,
    })
  }
  const receivedNow = input.paymentStatus === 'paid' ? after.sale.totalAmount : input.paymentStatus === 'partial' ? input.paidNow : 0
  if (receivedNow > 0) {
    await recordAutoCashMovement({
      direction: 'in',
      amount: receivedNow,
      storeId: after.sale.storeId,
      category: 'Correction vente',
      description: `Correction vente #${after.sale.reference} (nouveau montant)`,
    })
  }

  return after.sale
}
