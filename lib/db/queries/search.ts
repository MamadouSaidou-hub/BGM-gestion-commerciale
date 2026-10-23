import { and, eq, ilike, or } from 'drizzle-orm'
import { db } from '../client'
import { clients, products, sales, stores, suppliers } from '../schema'
import { formatFcfa } from '@/lib/format'
import type { SessionContext } from '@/lib/session'

export type SearchResult = { type: 'product' | 'client' | 'sale' | 'supplier' | 'store'; label: string; subtitle: string; href: string }

const LIMIT = 5

export async function getGlobalSearch(query: string, ctx: SessionContext): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const pattern = `%${q}%`
  const isAdmin = ctx.role === 'admin'

  const [productRows, clientRows, saleRows, supplierRows, storeRows] = await Promise.all([
    db
      .select({ name: products.name, sku: products.sku })
      .from(products)
      .where(or(ilike(products.name, pattern), ilike(products.sku, pattern)))
      .limit(LIMIT),
    db
      .select({ id: clients.id, name: clients.name, phone: clients.phone })
      .from(clients)
      .where(and(or(ilike(clients.name, pattern), ilike(clients.phone, pattern)), ctx.storeId && !isAdmin ? eq(clients.storeId, ctx.storeId) : undefined))
      .limit(LIMIT),
    db
      .select({ reference: sales.reference, totalAmount: sales.totalAmount, storeId: sales.storeId })
      .from(sales)
      .where(and(ilike(sales.reference, pattern), ctx.storeId && !isAdmin ? eq(sales.storeId, ctx.storeId) : undefined))
      .limit(LIMIT),
    isAdmin
      ? db.select({ name: suppliers.name, phone: suppliers.phone }).from(suppliers).where(ilike(suppliers.name, pattern)).limit(LIMIT)
      : Promise.resolve([]),
    isAdmin
      ? db.select({ name: stores.name, city: stores.city }).from(stores).where(or(ilike(stores.name, pattern), ilike(stores.city, pattern))).limit(LIMIT)
      : Promise.resolve([]),
  ])

  const results: SearchResult[] = []
  for (const row of productRows) results.push({ type: 'product', label: row.name, subtitle: `Article · ${row.sku}`, href: `/stock?q=${encodeURIComponent(row.name)}` })
  for (const row of clientRows) results.push({ type: 'client', label: row.name, subtitle: `Client${row.phone ? ` · ${row.phone}` : ''}`, href: `/clients?q=${encodeURIComponent(row.name)}` })
  for (const row of saleRows) results.push({ type: 'sale', label: `Vente #${row.reference}`, subtitle: `${formatFcfa(row.totalAmount)}`, href: `/ventes/${row.reference}/facture` })
  for (const row of supplierRows) results.push({ type: 'supplier', label: row.name, subtitle: `Fournisseur${row.phone ? ` · ${row.phone}` : ''}`, href: `/fournisseurs?q=${encodeURIComponent(row.name)}` })
  for (const row of storeRows) results.push({ type: 'store', label: row.name, subtitle: `Magasin · ${row.city}`, href: '/magasins' })

  return results
}
