import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import { db } from '../client'
import { clients, products, saleItems, sales, stores, supplierDeliveries, supplierPayments } from '../schema'
import { formatFcfa } from '@/lib/format'
import { periodRange, periodTrendBuckets, type CustomRange, type PeriodKey } from '@/lib/period'

export async function getReportsOverview(period: PeriodKey, custom?: CustomRange) {
  const { start, end } = periodRange(period, custom)
  const trendBuckets = periodTrendBuckets(start, end)

  const [
    storeRevenueRows,
    itemRows,
    clientRevenueRows,
    salesAggRow,
    paymentStatusRows,
    supplierAggRow,
    supplierPaymentsRow,
    salesTrendRows,
  ] = await Promise.all([
    db
      .select({ storeName: stores.name, total: sql<number>`sum(${sales.totalAmount})`.mapWith(Number) })
      .from(sales)
      .innerJoin(stores, eq(sales.storeId, stores.id))
      .where(and(gte(sales.createdAt, start.toISOString()), isNull(sales.deletedAt)))
      .groupBy(stores.name),
    db
      .select({
        productName: products.name,
        quantity: sql<number>`sum(${saleItems.quantity})`.mapWith(Number),
        revenue: sql<number>`sum(${saleItems.quantity} * ${saleItems.unitPrice})`.mapWith(Number),
        cost: sql<number>`sum(${saleItems.quantity} * ${products.costPrice})`.mapWith(Number),
      })
      .from(saleItems)
      .innerJoin(products, eq(saleItems.productId, products.id))
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(and(gte(sales.createdAt, start.toISOString()), isNull(sales.deletedAt)))
      .groupBy(products.name)
      .orderBy(desc(sql`sum(${saleItems.quantity} * ${saleItems.unitPrice})`))
      .limit(8),
    db
      .select({
        clientName: clients.name,
        revenue: sql<number>`sum(${sales.totalAmount})`.mapWith(Number),
        salesCount: sql<number>`count(*)`.mapWith(Number),
      })
      .from(sales)
      .innerJoin(clients, eq(sales.clientId, clients.id))
      .where(and(gte(sales.createdAt, start.toISOString()), isNull(sales.deletedAt)))
      .groupBy(clients.name)
      .orderBy(desc(sql`sum(${sales.totalAmount})`))
      .limit(8),
    db
      .select({
        total: sql<number>`coalesce(sum(${sales.totalAmount}), 0)`.mapWith(Number),
        cost: sql<number>`coalesce(sum(${sales.costAmount}), 0)`.mapWith(Number),
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(sales)
      .where(and(gte(sales.createdAt, start.toISOString()), isNull(sales.deletedAt))),
    db
      .select({
        status: sales.paymentStatus,
        count: sql<number>`count(*)`.mapWith(Number),
        amount: sql<number>`sum(${sales.totalAmount})`.mapWith(Number),
      })
      .from(sales)
      .where(and(gte(sales.createdAt, start.toISOString()), isNull(sales.deletedAt)))
      .groupBy(sales.paymentStatus),
    db
      .select({
        totalSacks: sql<number>`coalesce(sum(${supplierDeliveries.sackCount}), 0)`.mapWith(Number),
        deliveriesCount: sql<number>`count(*)`.mapWith(Number),
      })
      .from(supplierDeliveries)
      .where(gte(supplierDeliveries.createdAt, start.toISOString())),
    db
      .select({ total: sql<number>`coalesce(sum(${supplierPayments.amount}), 0)`.mapWith(Number) })
      .from(supplierPayments)
      .where(gte(supplierPayments.createdAt, start.toISOString())),
    Promise.all(
      trendBuckets.map(({ bucketStart, bucketEnd, label }) =>
        db
          .select({ total: sql<number>`coalesce(sum(${sales.totalAmount}), 0)`.mapWith(Number) })
          .from(sales)
          .where(and(gte(sales.createdAt, bucketStart.toISOString()), lt(sales.createdAt, bucketEnd.toISOString()), isNull(sales.deletedAt)))
          .then((rows) => ({ label, value: rows[0]?.total ?? 0 })),
      ),
    ),
  ])

  const totalRevenue = storeRevenueRows.reduce((sum, row) => sum + row.total, 0)
  const salesAgg = salesAggRow[0] ?? { total: 0, cost: 0, count: 0 }
  const margin = salesAgg.total - salesAgg.cost
  const marginPct = salesAgg.total > 0 ? (margin / salesAgg.total) * 100 : 0
  const avgBasket = salesAgg.count > 0 ? salesAgg.total / salesAgg.count : 0

  const paymentLabel: Record<string, string> = { paid: 'Payée', partial: 'Partielle', credit: 'À crédit' }
  const totalSupplierPayments = supplierPaymentsRow[0]?.total ?? 0

  return {
    totalRevenue,
    totalRevenueFormatted: formatFcfa(totalRevenue),
    totalMargin: margin,
    totalMarginFormatted: formatFcfa(margin),
    marginPct,
    salesCount: salesAgg.count,
    avgBasket,
    avgBasketFormatted: formatFcfa(avgBasket),
    salesTrend: salesTrendRows,
    storeRevenue: storeRevenueRows.map((row) => ({ name: row.storeName, amount: row.total, formatted: formatFcfa(row.total) })),
    topProducts: itemRows.map((row) => {
      const productMargin = row.revenue - row.cost
      return {
        name: row.productName,
        quantity: row.quantity,
        revenue: row.revenue,
        formatted: formatFcfa(row.revenue),
        margin: productMargin,
        marginFormatted: formatFcfa(productMargin),
      }
    }),
    topClients: clientRevenueRows.map((row) => ({ name: row.clientName, revenue: row.revenue, salesCount: row.salesCount, formatted: formatFcfa(row.revenue) })),
    paymentBreakdown: paymentStatusRows.map((row) => ({
      status: row.status,
      label: paymentLabel[row.status] ?? row.status,
      count: row.count,
      amount: row.amount,
      formatted: formatFcfa(row.amount),
    })),
    supplierSummary: {
      totalSacks: supplierAggRow[0]?.totalSacks ?? 0,
      deliveriesCount: supplierAggRow[0]?.deliveriesCount ?? 0,
      totalPaid: totalSupplierPayments,
      totalPaidFormatted: formatFcfa(totalSupplierPayments),
    },
  }
}
