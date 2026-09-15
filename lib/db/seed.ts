import { db } from './client'
import {
  clients,
  discountApplications,
  discountScales,
  discountTiers,
  payments,
  products,
  receivables,
  saleItems,
  sales,
  stockCounts,
  stockLevels,
  stockMovements,
  stores,
  supplierDeliveries,
  supplierPayables,
  supplierPayments,
  suppliers,
  transferItems,
  transfers,
} from './schema'

function daysAgo(days: number, hours = 0, minutes = 0) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(date.getHours() - hours, date.getMinutes() - minutes)
  return date.toISOString()
}

async function seed() {
  console.log('Seeding database...')

  await db.delete(transferItems)
  await db.delete(transfers)
  await db.delete(receivables)
  await db.delete(payments)
  await db.delete(saleItems)
  await db.delete(sales)
  await db.delete(discountApplications)
  await db.delete(discountTiers)
  await db.delete(discountScales)
  await db.delete(supplierPayables)
  await db.delete(supplierDeliveries)
  await db.delete(supplierPayments)
  await db.delete(suppliers)
  await db.delete(stockCounts)
  await db.delete(stockMovements)
  await db.delete(stockLevels)
  await db.delete(clients)
  await db.delete(products)
  await db.delete(stores)

  const [akwa, bonapriso, bastos] = await db
    .insert(stores)
    .values([
      { name: 'BGM Akwa', city: 'Douala' },
      { name: 'BGM Bonapriso', city: 'Douala' },
      { name: 'BGM Bastos', city: 'Yaoundé' },
    ])
    .returning()

  const productRows = await db
    .insert(products)
    .values([
      { name: 'Farine de blé T55 25kg', sku: 'FAR-T55-25', category: 'Farine de blé', unitPrice: 18500, costPrice: 15500, reorderThreshold: 30, sackWeightKg: 25 },
      { name: 'Farine de blé T55 50kg', sku: 'FAR-T55-50', category: 'Farine de blé', unitPrice: 36000, costPrice: 30500, reorderThreshold: 20, sackWeightKg: 50 },
      { name: 'Farine complète 25kg', sku: 'FAR-CPL-25', category: 'Farine complète', unitPrice: 19500, costPrice: 16500, reorderThreshold: 25, sackWeightKg: 25 },
      { name: 'Farine complète 50kg', sku: 'FAR-CPL-50', category: 'Farine complète', unitPrice: 38000, costPrice: 32000, reorderThreshold: 15, sackWeightKg: 50 },
      { name: 'Farine boulangère 50kg', sku: 'FAR-BLG-50', category: 'Farine boulangère', unitPrice: 37000, costPrice: 31000, reorderThreshold: 20, sackWeightKg: 50 },
      { name: 'Farine pâtissière 25kg', sku: 'FAR-PAT-25', category: 'Farine pâtissière', unitPrice: 20500, costPrice: 17500, reorderThreshold: 15, sackWeightKg: 25 },
    ])
    .returning()

  const [fT5525, fT5550, fCpl25, fCpl50, fBlg50, fPat25] = productRows

  const storeList = [akwa, bonapriso, bastos]
  const stockRows: { productId: number; storeId: number; quantity: number }[] = []
  for (const store of storeList) {
    for (const product of productRows) {
      const base = Math.floor(Math.random() * 60) + 5
      stockRows.push({ productId: product.id, storeId: store.id, quantity: base })
    }
  }
  stockRows.find((row) => row.productId === fCpl50.id && row.storeId === akwa.id)!.quantity = 6
  stockRows.find((row) => row.productId === fPat25.id && row.storeId === bonapriso.id)!.quantity = 4
  stockRows.find((row) => row.productId === fBlg50.id && row.storeId === bastos.id)!.quantity = 8
  await db.insert(stockLevels).values(stockRows)

  const clientRows = await db
    .insert(clients)
    .values([
      { name: 'Noura Market', phone: '699 12 34 56', storeId: akwa.id },
      { name: 'Épicerie Chantal', phone: '677 98 76 54', storeId: bonapriso.id },
      { name: 'Superette Le Bon Coin', phone: '655 44 33 22', storeId: bastos.id },
      { name: 'Boutique Fatima', phone: '691 22 11 00', storeId: akwa.id },
      { name: 'Dépôt Emmanuel', phone: '676 55 66 77', storeId: bonapriso.id },
    ])
    .returning()

  const salesPlan = [
    { store: akwa, ref: 'BG-1048', daysAgo: 0, hours: 0, minutes: 8, status: 'paid' as const, client: null },
    { store: akwa, ref: 'BG-1047', daysAgo: 0, hours: 3, minutes: 0, status: 'paid' as const, client: null },
    { store: bonapriso, ref: 'BG-1046', daysAgo: 1, hours: 2, minutes: 0, status: 'credit' as const, client: clientRows[1] },
    { store: bastos, ref: 'BG-1045', daysAgo: 1, hours: 6, minutes: 0, status: 'paid' as const, client: null },
    { store: akwa, ref: 'BG-1044', daysAgo: 2, hours: 1, minutes: 0, status: 'partial' as const, client: clientRows[0] },
    { store: bonapriso, ref: 'BG-1043', daysAgo: 2, hours: 5, minutes: 0, status: 'paid' as const, client: null },
    { store: bastos, ref: 'BG-1042', daysAgo: 3, hours: 0, minutes: 0, status: 'paid' as const, client: null },
    { store: akwa, ref: 'BG-1041', daysAgo: 4, hours: 0, minutes: 0, status: 'credit' as const, client: clientRows[3] },
    { store: bonapriso, ref: 'BG-1040', daysAgo: 5, hours: 0, minutes: 0, status: 'paid' as const, client: null },
    { store: bastos, ref: 'BG-1039', daysAgo: 6, hours: 0, minutes: 0, status: 'paid' as const, client: null },
    { store: akwa, ref: 'BG-1038', daysAgo: 6, hours: 4, minutes: 0, status: 'paid' as const, client: null },
    { store: bonapriso, ref: 'BG-1037', daysAgo: 7, hours: 0, minutes: 0, status: 'partial' as const, client: clientRows[4] },
  ]

  const catalog = [fT5525, fT5550, fCpl25, fCpl50, fBlg50, fPat25]

  for (const plan of salesPlan) {
    const itemCount = Math.floor(Math.random() * 3) + 1
    const chosen = [...catalog].sort(() => Math.random() - 0.5).slice(0, itemCount)
    const items = chosen.map((product) => {
      const quantity = Math.floor(Math.random() * 8) + 1
      return { productId: product.id, quantity, unitPrice: product.unitPrice, costPrice: product.costPrice }
    })
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const costAmount = items.reduce((sum, item) => sum + item.quantity * item.costPrice, 0)

    const [sale] = await db
      .insert(sales)
      .values({
        reference: plan.ref,
        storeId: plan.store.id,
        clientId: plan.client?.id ?? null,
        totalAmount,
        costAmount,
        paymentStatus: plan.status,
        createdAt: daysAgo(plan.daysAgo, plan.hours, plan.minutes),
      })
      .returning()

    await db.insert(saleItems).values(
      items.map((item) => ({ saleId: sale.id, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice })),
    )

    for (const item of items) {
      await db.insert(stockMovements).values({
        type: 'sale',
        productId: item.productId,
        storeId: plan.store.id,
        quantity: -item.quantity,
        reference: sale.reference,
        createdAt: sale.createdAt,
      })
    }

    if (plan.status === 'credit' || plan.status === 'partial') {
      const paidPortion = plan.status === 'partial' ? Math.round(totalAmount * 0.4) : 0
      if (paidPortion > 0 && plan.client) {
        await db.insert(payments).values({
          clientId: plan.client.id,
          saleId: sale.id,
          storeId: plan.store.id,
          amount: paidPortion,
          method: 'cash',
          createdAt: sale.createdAt,
        })
      }
      if (plan.client) {
        const due = new Date(sale.createdAt)
        due.setDate(due.getDate() + 15)
        const overdue = due.getTime() < Date.now()
        await db.insert(receivables).values({
          clientId: plan.client.id,
          saleId: sale.id,
          amount: totalAmount - paidPortion,
          dueDate: due.toISOString(),
          status: overdue ? 'overdue' : 'pending',
        })
      }
    }
  }

  await db.insert(payments).values({
    clientId: clientRows[0].id,
    saleId: null,
    storeId: akwa.id,
    amount: 150000,
    method: 'cash',
    createdAt: daysAgo(0, 1, 0),
  })

  await db.insert(stockMovements).values({
    type: 'reception',
    productId: fT5525.id,
    storeId: bonapriso.id,
    quantity: 84,
    reference: 'RCP-3312',
    createdAt: daysAgo(0, 0, 24),
  })

  const [transfer] = await db
    .insert(transfers)
    .values({
      reference: 'TR-028',
      fromStoreId: akwa.id,
      toStoreId: bastos.id,
      status: 'in_transit',
      createdAt: daysAgo(0, 2, 0),
    })
    .returning()

  await db.insert(transferItems).values([
    { transferId: transfer.id, productId: fT5550.id, quantity: 20 },
    { transferId: transfer.id, productId: fCpl25.id, quantity: 40 },
  ])

  console.log('Database seeded successfully.')
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
