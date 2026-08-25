import { eq } from 'drizzle-orm'
import { db } from '../client'
import { clients, stores } from '../schema'

export async function getStoreOptions() {
  return db.select({ id: stores.id, name: stores.name }).from(stores)
}

export async function getClientOptions() {
  return db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(clients.name)
}

export async function resolveStoreId(storeName: string | null) {
  if (!storeName || storeName === 'Tous les magasins') return null
  const [row] = await db.select({ id: stores.id }).from(stores).where(eq(stores.name, storeName))
  return row?.id ?? null
}
