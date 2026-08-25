import { db } from '../client'
import { clients } from '../schema'

export async function createClient(input: { name: string; phone?: string; storeId?: number | null }) {
  const [client] = await db
    .insert(clients)
    .values({ name: input.name, phone: input.phone ?? null, storeId: input.storeId ?? null })
    .returning()
  return client
}
