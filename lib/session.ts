import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { auth } from './auth'
import { db } from './db/client'
import { stores } from './db/schema'

export type SessionContext = {
  userId: string
  role: string
  storeId: number | null
  storeName: string | null
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null

  const storeId = (session.user as { storeId?: number | null }).storeId ?? null
  let storeName: string | null = null
  if (storeId) {
    const [row] = await db.select({ name: stores.name }).from(stores).where(eq(stores.id, storeId))
    storeName = row?.name ?? null
  }

  return {
    userId: session.user.id,
    role: (session.user as { role?: string }).role ?? 'gestionnaire',
    storeId,
    storeName,
  }
}

export function isAdmin(ctx: SessionContext) {
  return ctx.role === 'admin'
}

export function assertStoreAccess(ctx: SessionContext, storeId: number) {
  if (!isAdmin(ctx) && ctx.storeId !== storeId) {
    throw new Error('Accès refusé : ce magasin n’est pas le vôtre.')
  }
}

/** The store name to actually query with: the requested one for admins, always the user's own for a gestionnaire. */
export function effectiveStoreParam(ctx: SessionContext, requestedStore: string | null): string | null {
  return isAdmin(ctx) ? requestedStore : ctx.storeName
}

/** The store dropdown options to expose in a list response. */
export function scopedStoreList(ctx: SessionContext, allStoreNames: string[]): string[] {
  return isAdmin(ctx) ? ['Tous les magasins', ...allStoreNames] : ctx.storeName ? [ctx.storeName] : []
}
