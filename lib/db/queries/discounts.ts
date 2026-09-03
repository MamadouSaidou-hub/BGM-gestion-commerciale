import { and, desc, eq } from 'drizzle-orm'
import { db } from '../client'
import { discountApplications, discountScales, discountTiers } from '../schema'
import { formatFcfa } from '@/lib/format'
import { computeDiscount, currentPeriod, getSupplierCycleProgress, type PartyType } from '../mutations/discounts'

export async function getDiscountScale(partyType: PartyType, partyId: number) {
  // Client scales: monthly, recomputed (and upserted) live on every read — cheap and idempotent per period.
  // Supplier scales: no calendar period — read-only progress since the last granted cycle. Granting only
  // happens explicitly (a delivery crossing a tier, or the "Calculer" button), never as a GET side effect.
  const current =
    partyType === 'client'
      ? await (async () => {
          const live = await computeDiscount('client', partyId, currentPeriod())
          return {
            period: live.period as string | null,
            sackCount: live.sackCount,
            tierReached: live.tierReached,
            discountPerSack: live.discountPerSack,
            totalDiscount: live.totalDiscount,
            totalDiscountFormatted: formatFcfa(live.totalDiscount),
            nextTier: live.nextTier,
          }
        })()
      : await (async () => {
          const progress = await getSupplierCycleProgress(partyId)
          return {
            period: null as string | null,
            sackCount: progress.sackCount,
            tierReached: null,
            discountPerSack: 0,
            totalDiscount: 0,
            totalDiscountFormatted: formatFcfa(0),
            nextTier: progress.nextTier,
          }
        })()

  const [scale] = await db.select().from(discountScales).where(and(eq(discountScales.partyType, partyType), eq(discountScales.partyId, partyId)))
  const tiers = scale
    ? await db.select().from(discountTiers).where(eq(discountTiers.scaleId, scale.id)).orderBy(discountTiers.thresholdSacks)
    : []

  return {
    tiers: tiers.map((tier) => ({ id: tier.id, thresholdSacks: tier.thresholdSacks, discountPerSack: tier.discountPerSack })),
    current,
  }
}

export async function getDiscountHistory(partyType: PartyType, partyId: number) {
  const [scale] = await db.select().from(discountScales).where(and(eq(discountScales.partyType, partyType), eq(discountScales.partyId, partyId)))
  if (!scale) return []

  const rows = await db
    .select()
    .from(discountApplications)
    .where(eq(discountApplications.scaleId, scale.id))
    .orderBy(desc(discountApplications.period))

  return rows.map((row) => ({
    period: row.period,
    sackCount: row.sackCount,
    tierReached: row.tierReached,
    totalDiscount: row.totalDiscount,
    totalDiscountFormatted: formatFcfa(row.totalDiscount),
  }))
}
