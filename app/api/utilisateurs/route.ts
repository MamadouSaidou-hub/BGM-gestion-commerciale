import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { user } from '@/lib/db/auth-schema'
import { stores } from '@/lib/db/schema'
import { toApiErrorMessage } from '@/lib/api-error'
import { getSessionContext, isAdmin } from '@/lib/session'

export async function GET() {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const userRows = await db.select({ id: user.id, name: user.name, email: user.email, role: user.role, storeId: user.storeId }).from(user)
  const storeRows = await db.select({ id: stores.id, name: stores.name }).from(stores)
  const storeMap = new Map(storeRows.map((row) => [row.id, row.name]))

  return NextResponse.json({
    users: userRows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      storeId: row.storeId,
      store: row.storeId ? storeMap.get(row.storeId) ?? '—' : '—',
    })),
  })
}

export async function POST(request: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isAdmin(ctx)) return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

  const body = await request.json()
  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim()
  const password = String(body.password ?? '')
  const role = body.role === 'admin' ? 'admin' : 'gestionnaire'
  const storeId = body.storeId ? Number(body.storeId) : null

  if (!name || !email || password.length < 8) {
    return NextResponse.json({ error: 'Nom, e-mail et mot de passe (8 caractères min.) sont requis.' }, { status: 400 })
  }
  if (role === 'gestionnaire' && !storeId) {
    return NextResponse.json({ error: 'Un magasin est requis pour un gestionnaire.' }, { status: 400 })
  }

  try {
    // Uses the admin plugin's create-user endpoint (not signUpEmail) so the calling admin's own
    // session cookie isn't overwritten by the newly created user's session.
    await auth.api.createUser({
      // better-auth's admin plugin types `role` as 'user' | 'admin' by default (no custom access-control
      // roles configured, since we don't need permission granularity — just the isAdmin() checks above).
      // 'gestionnaire' is accepted at runtime (role is a free-text column), hence the cast.
      body: { name, email, password, role: role as 'admin', data: { storeId } },
      headers: await headers(),
    })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: toApiErrorMessage(error) }, { status: 400 })
  }
}
