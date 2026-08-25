import { db } from '../client'
import { products, stockLevels, stores } from '../schema'

export async function createStore(input: { name: string; city: string }) {
  const [store] = await db.insert(stores).values({ name: input.name, city: input.city }).returning()

  const productRows = await db.select({ id: products.id }).from(products)
  if (productRows.length > 0) {
    await db.insert(stockLevels).values(productRows.map((product) => ({ productId: product.id, storeId: store.id, quantity: 0 })))
  }

  return store
}
