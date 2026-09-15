import { relations } from 'drizzle-orm'
import { doublePrecision, integer, pgTable, serial, text } from 'drizzle-orm/pg-core'

const timestamps = {
  // JS-side default (not a DB-level `now()`/`current_timestamp`) so every timestamp in the app is
  // generated the same way and stays safely string-comparable — see the bgm-sqlite-timestamp-quirk
  // lesson: mixing a DB-generated timestamp format with `Date#toISOString()` elsewhere broke same-day
  // string comparisons. This sidesteps that entirely, regardless of DB engine.
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
}

export const stores = pgTable('stores', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  ...timestamps,
})

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  sku: text('sku').notNull().unique(),
  category: text('category').notNull(),
  unitPrice: doublePrecision('unit_price').notNull(),
  costPrice: doublePrecision('cost_price').notNull(),
  reorderThreshold: integer('reorder_threshold').notNull().default(10),
  ...timestamps,
})

export const stockLevels = pgTable('stock_levels', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  storeId: integer('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull().default(0),
})

export const stockMovementType = ['reception', 'transfer_out', 'transfer_in', 'adjustment', 'sale'] as const

export const stockMovements = pgTable('stock_movements', {
  id: serial('id').primaryKey(),
  type: text('type', { enum: stockMovementType }).notNull(),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  storeId: integer('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull(),
  reference: text('reference'),
  note: text('note'),
  ...timestamps,
})

export const stockCounts = pgTable('stock_counts', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  theoreticalQty: integer('theoretical_qty').notNull(),
  countedQty: integer('counted_qty').notNull(),
  variance: integer('variance').notNull(),
  // Not a DB-level FK to `user` (auth-schema.ts) to avoid a schema.ts <-> auth-schema.ts import cycle —
  // validated at the application layer, same polymorphic-id pattern used by discountScales.partyId.
  countedBy: text('counted_by').notNull(),
  ...timestamps,
})

export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),
  storeId: integer('store_id').references(() => stores.id, { onDelete: 'set null' }),
  ...timestamps,
})

export const salePaymentStatus = ['paid', 'partial', 'credit'] as const

export const sales = pgTable('sales', {
  id: serial('id').primaryKey(),
  reference: text('reference').notNull().unique(),
  storeId: integer('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'set null' }),
  totalAmount: doublePrecision('total_amount').notNull(),
  costAmount: doublePrecision('cost_amount').notNull(),
  paymentStatus: text('payment_status', { enum: salePaymentStatus }).notNull().default('paid'),
  ...timestamps,
})

export const saleItems = pgTable('sale_items', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  quantity: integer('quantity').notNull(),
  unitPrice: doublePrecision('unit_price').notNull(),
})

export const paymentMethod = ['cash', 'mobile_money', 'bank_transfer', 'check'] as const

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  saleId: integer('sale_id').references(() => sales.id, { onDelete: 'set null' }),
  storeId: integer('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  amount: doublePrecision('amount').notNull(),
  method: text('method', { enum: paymentMethod }).notNull().default('cash'),
  ...timestamps,
})

export const receivableStatus = ['pending', 'paid', 'overdue'] as const

export const receivables = pgTable('receivables', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  saleId: integer('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  amount: doublePrecision('amount').notNull(),
  dueDate: text('due_date').notNull(),
  status: text('status', { enum: receivableStatus }).notNull().default('pending'),
  ...timestamps,
})

export const transferStatus = ['pending', 'in_transit', 'completed'] as const

export const transfers = pgTable('transfers', {
  id: serial('id').primaryKey(),
  reference: text('reference').notNull().unique(),
  fromStoreId: integer('from_store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  toStoreId: integer('to_store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  status: text('status', { enum: transferStatus }).notNull().default('pending'),
  ...timestamps,
})

export const transferItems = pgTable('transfer_items', {
  id: serial('id').primaryKey(),
  transferId: integer('transfer_id')
    .notNull()
    .references(() => transfers.id, { onDelete: 'cascade' }),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  quantity: integer('quantity').notNull(),
})

export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),
  ...timestamps,
})

export const supplierDeliveries = pgTable('supplier_deliveries', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'cascade' }),
  storeId: integer('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  reference: text('reference'),
  sackCount: integer('sack_count').notNull(),
  tonnage: doublePrecision('tonnage'),
  totalAmount: doublePrecision('total_amount').notNull(),
  ...timestamps,
})

export const supplierPayableStatus = ['pending', 'paid', 'overdue'] as const

export const supplierPayables = pgTable('supplier_payables', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'cascade' }),
  deliveryId: integer('delivery_id')
    .notNull()
    .references(() => supplierDeliveries.id, { onDelete: 'cascade' }),
  amount: doublePrecision('amount').notNull(),
  dueDate: text('due_date').notNull(),
  status: text('status', { enum: supplierPayableStatus }).notNull().default('pending'),
  ...timestamps,
})

export const supplierPayments = pgTable('supplier_payments', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'cascade' }),
  amount: doublePrecision('amount').notNull(),
  method: text('method', { enum: paymentMethod }).notNull().default('cash'),
  ...timestamps,
})

export const discountPartyType = ['supplier', 'client'] as const

export const discountScales = pgTable('discount_scales', {
  id: serial('id').primaryKey(),
  partyType: text('party_type', { enum: discountPartyType }).notNull(),
  // Not FK-constrained — polymorphic across `clients`/`suppliers`, validated at the application layer,
  // matching the pattern already used by `stockCounts.countedBy`.
  partyId: integer('party_id').notNull(),
  // Supplier scales only: start of the current uncompleted cycle (no calendar-period limit — every
  // `thresholdSacks` sold resets this to "now" and starts counting again). Null = counting from the
  // scale's creation. Client scales stay on the monthly model and never set this.
  cycleStartAt: text('cycle_start_at'),
  ...timestamps,
})

export const discountTiers = pgTable('discount_tiers', {
  id: serial('id').primaryKey(),
  scaleId: integer('scale_id')
    .notNull()
    .references(() => discountScales.id, { onDelete: 'cascade' }),
  thresholdSacks: integer('threshold_sacks').notNull(),
  discountPerSack: doublePrecision('discount_per_sack').notNull(),
})

export const discountApplications = pgTable('discount_applications', {
  id: serial('id').primaryKey(),
  scaleId: integer('scale_id')
    .notNull()
    .references(() => discountScales.id, { onDelete: 'cascade' }),
  period: text('period').notNull(),
  tierReached: integer('tier_reached'),
  sackCount: integer('sack_count').notNull(),
  totalDiscount: doublePrecision('total_discount').notNull(),
  ...timestamps,
})

export const storesRelations = relations(stores, ({ many }) => ({
  stockLevels: many(stockLevels),
  sales: many(sales),
}))

export const productsRelations = relations(products, ({ many }) => ({
  stockLevels: many(stockLevels),
  saleItems: many(saleItems),
}))

export const salesRelations = relations(sales, ({ one, many }) => ({
  store: one(stores, { fields: [sales.storeId], references: [stores.id] }),
  client: one(clients, { fields: [sales.clientId], references: [clients.id] }),
  items: many(saleItems),
}))

export const clientsRelations = relations(clients, ({ many }) => ({
  sales: many(sales),
  receivables: many(receivables),
  payments: many(payments),
}))
