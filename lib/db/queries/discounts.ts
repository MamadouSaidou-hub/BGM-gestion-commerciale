import { and, desc, eq } from 'drizzle-orm'
import { db } from '../client'
import { discountApplications, discountScales, discountTiers } from '../schema'
import { formatFcfa } from '@/lib/format'
import { computeDiscount, currentPeriod, type PartyType } from '../mutations/discounts'

export async function getDiscountScale(partyType: PartyType, partyId: number) {
  const live = await computeDiscount(partyType, partyId, currentPeriod())

  const [scale] = await db.select().from(discountScales).where(and(eq(discountScales.partyType, partyType), eq(discountScales.partyId, partyId)))
  const tiers = scale
    ? await db.select().from(discountTiers).where(eq(discountTiers.scaleId, scale.id)).orderBy(discountTiers.thresholdSacks)
    : []

  return {
    tiers: tiers.map((tier) => ({ id: tier.id, thresholdSacks: tier.thresholdSacks, discountPerSack: tier.discountPerSack })),
    current: {
      period: live.period,
      sackCount: live.sackCount,
      tierReached: live.tierReached,
      discountPerSack: live.discountPerSack,
      totalDiscount: live.totalDiscount,
      totalDiscountFormatted: formatFcfa(live.totalDiscount),
      nextTier: live.nextTier,
    },
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
