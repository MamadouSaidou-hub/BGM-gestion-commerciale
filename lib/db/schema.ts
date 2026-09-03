import { relations, sql } from 'drizzle-orm'
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const timestamps = {
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
}

export const stores = sqliteTable('stores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  city: text('city').notNull(),
  ...timestamps,
})

export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  sku: text('sku').notNull().unique(),
  category: text('category').notNull(),
  unitPrice: real('unit_price').notNull(),
  costPrice: real('cost_price').notNull(),
  reorderThreshold: integer('reorder_threshold').notNull().default(10),
  ...timestamps,
})

export const stockLevels = sqliteTable('stock_levels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  storeId: integer('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull().default(0),
})

export const stockMovementType = ['reception', 'transfer_out', 'transfer_in', 'adjustment', 'sale'] as const

export const stockMovements = sqliteTable('stock_movements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
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

export const stockCounts = sqliteTable('stock_counts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
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

export const clients = sqliteTable('clients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone'),
  storeId: integer('store_id').references(() => stores.id, { onDelete: 'set null' }),
  ...timestamps,
})

export const salePaymentStatus = ['paid', 'partial', 'credit'] as const

export const sales = sqliteTable('sales', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  reference: text('reference').notNull().unique(),
  storeId: integer('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'set null' }),
  totalAmount: real('total_amount').notNull(),
  costAmount: real('cost_amount').notNull(),
  paymentStatus: text('payment_status', { enum: salePaymentStatus }).notNull().default('paid'),
  ...timestamps,
})

export const saleItems = sqliteTable('sale_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  saleId: integer('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  quantity: integer('quantity').notNull(),
  unitPrice: real('unit_price').notNull(),
})

export const paymentMethod = ['cash', 'mobile_money', 'bank_transfer', 'check'] as const

export const payments = sqliteTable('payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  saleId: integer('sale_id').references(() => sales.id, { onDelete: 'set null' }),
  storeId: integer('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  method: text('method', { enum: paymentMethod }).notNull().default('cash'),
  ...timestamps,
})

export const receivableStatus = ['pending', 'paid', 'overdue'] as const

export const receivables = sqliteTable('receivables', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  saleId: integer('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  dueDate: text('due_date').notNull(),
  status: text('status', { enum: receivableStatus }).notNull().default('pending'),
  ...timestamps,
})

export const transferStatus = ['pending', 'in_transit', 'completed'] as const

export const transfers = sqliteTable('transfers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
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

export const transferItems = sqliteTable('transfer_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  transferId: integer('transfer_id')
    .notNull()
    .references(() => transfers.id, { onDelete: 'cascade' }),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  quantity: integer('quantity').notNull(),
})

export const suppliers = sqliteTable('suppliers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone'),
  ...timestamps,
})

export const supplierDeliveries = sqliteTable('supplier_deliveries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
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
  tonnage: real('tonnage'),
  totalAmount: real('total_amount').notNull(),
  ...timestamps,
})

export const supplierPayableStatus = ['pending', 'paid', 'overdue'] as const

export const supplierPayables = sqliteTable('supplier_payables', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  supplierId: integer('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'cascade' }),
  deliveryId: integer('delivery_id')
    .notNull()
    .references(() => supplierDeliveries.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  dueDate: text('due_date').notNull(),
  status: text('status', { enum: supplierPayableStatus }).notNull().default('pending'),
  ...timestamps,
})

export const supplierPayments = sqliteTable('supplier_payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  supplierId: integer('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  method: text('method', { enum: paymentMethod }).notNull().default('cash'),
  ...timestamps,
})

export const discountPartyType = ['supplier', 'client'] as const

export const discountScales = sqliteTable('discount_scales', {
  id: integer('id').primaryKey({ autoIncrement: true }),
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

export const discountTiers = sqliteTable('discount_tiers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scaleId: integer('scale_id')
    .notNull()
    .references(() => discountScales.id, { onDelete: 'cascade' }),
  thresholdSacks: integer('threshold_sacks').notNull(),
  discountPerSack: real('discount_per_sack').notNull(),
})

export const discountApplications = sqliteTable('discount_applications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scaleId: integer('scale_id')
    .notNull()
    .references(() => discountScales.id, { onDelete: 'cascade' }),
  period: text('period').notNull(),
  tierReached: integer('tier_reached'),
  sackCount: integer('sack_count').notNull(),
  totalDiscount: real('total_discount').notNull(),
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
