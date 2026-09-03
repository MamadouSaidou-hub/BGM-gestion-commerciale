import { and, eq, gt, gte, lt } from 'drizzle-orm'
import { db } from '../client'
import { discountApplications, discountScales, discountTiers, saleItems, sales, supplierDeliveries } from '../schema'

export type PartyType = 'client' | 'supplier'

export function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function periodRange(period: string) {
  const [year, month] = period.split('-').map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)
  return { start, end }
}

async function getOrCreateScale(partyType: PartyType, partyId: number) {
  const [existing] = await db.select().from(discountScales).where(and(eq(discountScales.partyType, partyType), eq(discountScales.partyId, partyId)))
  if (existing) return existing
  const [created] = await db.insert(discountScales).values({ partyType, partyId }).returning()
  return created
}

async function sacksMovedInPeriod(partyType: PartyType, partyId: number, period: string) {
  const { start, end } = periodRange(period)

  if (partyType === 'client') {
    const rows = await db
      .select({ quantity: saleItems.quantity })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(and(eq(sales.clientId, partyId), gte(sales.createdAt, start.toISOString()), lt(sales.createdAt, end.toISOString())))
    return rows.reduce((sum, row) => sum + row.quantity, 0)
  }

  const rows = await db
    .select({ sackCount: supplierDeliveries.sackCount })
    .from(supplierDeliveries)
    .where(and(eq(supplierDeliveries.supplierId, partyId), gte(supplierDeliveries.createdAt, start.toISOString()), lt(supplierDeliveries.createdAt, end.toISOString())))
  return rows.reduce((sum, row) => sum + row.sackCount, 0)
}

export async function computeDiscount(partyType: PartyType, partyId: number, period: string = currentPeriod()) {
  const scale = await getOrCreateScale(partyType, partyId)
  const tiers = await db.select().from(discountTiers).where(eq(discountTiers.scaleId, scale.id)).orderBy(discountTiers.thresholdSacks)

  const sackCount = await sacksMovedInPeriod(partyType, partyId, period)

  const descendingTiers = [...tiers].sort((a, b) => b.thresholdSacks - a.thresholdSacks)
  const tierReached = descendingTiers.find((tier) => sackCount >= tier.thresholdSacks) ?? null
  const totalDiscount = tierReached ? sackCount * tierReached.discountPerSack : 0

  const nextTier = [...tiers].sort((a, b) => a.thresholdSacks - b.thresholdSacks).find((tier) => tier.thresholdSacks > sackCount) ?? null

  const [existingApplication] = await db
    .select()
    .from(discountApplications)
    .where(and(eq(discountApplications.scaleId, scale.id), eq(discountApplications.period, period)))

  if (existingApplication) {
    await db
      .update(discountApplications)
      .set({ tierReached: tierReached?.thresholdSacks ?? null, sackCount, totalDiscount })
      .where(eq(discountApplications.id, existingApplication.id))
  } else {
    await db.insert(discountApplications).values({
      scaleId: scale.id,
      period,
      tierReached: tierReached?.thresholdSacks ?? null,
      sackCount,
      totalDiscount,
    })
  }

  return {
    scaleId: scale.id,
    period,
    sackCount,
    tierReached: tierReached?.thresholdSacks ?? null,
    discountPerSack: tierReached?.discountPerSack ?? 0,
    totalDiscount,
    nextTier: nextTier ? { thresholdSacks: nextTier.thresholdSacks, sacksRemaining: nextTier.thresholdSacks - sackCount } : null,
  }
}

async function sacksSinceCycleStart(supplierId: number, cycleStartAt: string | null) {
  // Strict `>`, not `>=` — SQLite's CURRENT_TIMESTAMP has 1-second resolution, so the delivery that
  // triggers a grant and the cycleStartAt reset that follows it can land in the very same second. An
  // inclusive bound would re-count that delivery into the very next cycle it just closed out.
  const rows = await db
    .select({ sackCount: supplierDeliveries.sackCount })
    .from(supplierDeliveries)
    .where(and(eq(supplierDeliveries.supplierId, supplierId), cycleStartAt ? gt(supplierDeliveries.createdAt, cycleStartAt) : undefined))
  return rows.reduce((sum, row) => sum + row.sackCount, 0)
}

/**
 * Read-only progress for a supplier's discount cycle — no calendar period, no side effects.
 * Sacks are counted since the last granted cycle (or since the scale was created, if none yet).
 */
export async function getSupplierCycleProgress(supplierId: number) {
  const scale = await getOrCreateScale('supplier', supplierId)
  const tiers = await db.select().from(discountTiers).where(eq(discountTiers.scaleId, scale.id)).orderBy(discountTiers.thresholdSacks)

  const sackCount = await sacksSinceCycleStart(supplierId, scale.cycleStartAt)
  const nextTier = [...tiers].sort((a, b) => a.thresholdSacks - b.thresholdSacks).find((tier) => tier.thresholdSacks > sackCount) ?? null

  return {
    scaleId: scale.id,
    sackCount,
    nextTier: nextTier ? { thresholdSacks: nextTier.thresholdSacks, sacksRemaining: nextTier.thresholdSacks - sackCount } : null,
  }
}

/**
 * Checks whether the supplier has crossed the highest configured tier since the current cycle
 * started; if so, grants that tier's discount (recorded in discountApplications, keyed by the grant
 * date instead of a calendar period), resets the cycle to start over from now, and returns the grant.
 * Returns null if no tier has been reached yet — no write happens in that case.
 */
export async function checkAndGrantSupplierCycle(supplierId: number) {
  const scale = await getOrCreateScale('supplier', supplierId)
  const tiers = await db.select().from(discountTiers).where(eq(discountTiers.scaleId, scale.id)).orderBy(discountTiers.thresholdSacks)
  if (tiers.length === 0) return null

  const sackCount = await sacksSinceCycleStart(supplierId, scale.cycleStartAt)
  const descendingTiers = [...tiers].sort((a, b) => b.thresholdSacks - a.thresholdSacks)
  const tierReached = descendingTiers.find((tier) => sackCount >= tier.thresholdSacks)
  if (!tierReached) return null

  const totalDiscount = sackCount * tierReached.discountPerSack
  const now = new Date()
  const nowIso = now.toISOString()
  // `supplierDeliveries.createdAt` (like every other `timestamps` column) is populated by SQLite's
  // `CURRENT_TIMESTAMP`, formatted "YYYY-MM-DD HH:MM:SS" (space, UTC, no fractional seconds) — NOT
  // `Date#toISOString()`'s "YYYY-MM-DDTHH:MM:SS.sssZ". String-compared with `gte()`, those two formats
  // sort inconsistently for timestamps on the same day (' ' < 'T' in ASCII), which silently excluded
  // same-day deliveries from a freshly reset cycle. `cycleStartAt` must be stored in the SQLite-matching
  // format so `sacksSinceCycleStart`'s comparison stays correct.
  const cycleStartAt = nowIso.slice(0, 19).replace('T', ' ')

  await db.insert(discountApplications).values({
    scaleId: scale.id,
    period: nowIso,
    tierReached: tierReached.thresholdSacks,
    sackCount,
    totalDiscount,
  })
  await db.update(discountScales).set({ cycleStartAt }).where(eq(discountScales.id, scale.id))

  return { scaleId: scale.id, sackCount, tierReached: tierReached.thresholdSacks, discountPerSack: tierReached.discountPerSack, totalDiscount, grantedAt: nowIso }
}

export async function setDiscountTiers(partyType: PartyType, partyId: number, tiers: { thresholdSacks: number; discountPerSack: number }[]) {
  const scale = await getOrCreateScale(partyType, partyId)
  await db.delete(discountTiers).where(eq(discountTiers.scaleId, scale.id))
  if (tiers.length > 0) {
    await db.insert(discountTiers).values(tiers.map((tier) => ({ scaleId: scale.id, thresholdSacks: tier.thresholdSacks, discountPerSack: tier.discountPerSack })))
  }
  return scale
}
