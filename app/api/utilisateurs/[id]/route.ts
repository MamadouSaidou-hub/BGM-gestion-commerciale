import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { user } from '@/lib/db/auth-schema'
import { toApiErrorMessage } from '@/lib/api-error'
import { getSessionContext, isAdmin } from '@/lib/session'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const role = body.role === 'admin' ? 'admin' : 'gestionnaire'
  const storeId = body.storeId ? Number(body.storeId) : null

  if (role === 'gestionnaire' && !storeId) {
    return NextResponse.json({ error: 'Un magasin est requis pour un gestionnaire.' }, { status: 400 })
  }
  if (id === ctx.userId && role !== 'admin') {
    return NextResponse.json({ error: 'Vous ne pouvez pas retirer votre propre rôle administrateur.' }, { status: 400 })
  }

  try {
    // better-auth's admin plugin owns the `role` column (keeps its session cache consistent); `storeId`
    // is a plain app-level field it doesn't know about, so it's updated directly — same pattern as
    // lib/db/seed-admin.ts.
    await auth.api.setRole({ body: { userId: id, role: role as 'admin' }, headers: await headers() })
    await db.update(user).set({ storeId: role === 'admin' ? null : storeId }).where(eq(user.id, id))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const { id } = await params
  if (id === ctx.userId) {
    return NextResponse.json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' }, { status: 400 })
  }

  try {
    await auth.api.removeUser({ body: { userId: id }, headers: await headers() })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
