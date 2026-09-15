import { describe, expect, it } from 'vitest'
import { effectiveStoreParam, isAdmin, scopedStoreList, type SessionContext } from '@/lib/session'

function ctx(overrides: Partial<SessionContext> = {}): SessionContext {
  return { userId: 'u1', role: 'gestionnaire', storeId: null, storeName: null, ...overrides }
}

describe('isAdmin', () => {
  it('is true only for the admin role', () => {
    expect(isAdmin(ctx({ role: 'admin' }))).toBe(true)
    expect(isAdmin(ctx({ role: 'gestionnaire' }))).toBe(false)
  })
})

describe('effectiveStoreParam', () => {
  it('lets an admin request any store', () => {
    expect(effectiveStoreParam(ctx({ role: 'admin' }), 'BGM Bastos')).toBe('BGM Bastos')
    expect(effectiveStoreParam(ctx({ role: 'admin' }), null)).toBeNull()
  })

  it('forces a gestionnaire to their own store, ignoring the request', () => {
    const gestionnaire = ctx({ role: 'gestionnaire', storeName: 'BGM Akwa' })
    expect(effectiveStoreParam(gestionnaire, 'BGM Bastos')).toBe('BGM Akwa')
    expect(effectiveStoreParam(gestionnaire, null)).toBe('BGM Akwa')
  })
})

describe('scopedStoreList', () => {
  it('gives an admin every store plus the "all stores" option', () => {
    const admin = ctx({ role: 'admin' })
    expect(scopedStoreList(admin, ['BGM Akwa', 'BGM Bastos'])).toEqual(['Tous les magasins', 'BGM Akwa', 'BGM Bastos'])
  })

  it('restricts a gestionnaire to only their own store', () => {
    const gestionnaire = ctx({ role: 'gestionnaire', storeName: 'BGM Akwa' })
    expect(scopedStoreList(gestionnaire, ['BGM Akwa', 'BGM Bastos'])).toEqual(['BGM Akwa'])
  })

  it('gives a gestionnaire with no assigned store an empty list', () => {
    const gestionnaire = ctx({ role: 'gestionnaire', storeName: null })
    expect(scopedStoreList(gestionnaire, ['BGM Akwa', 'BGM Bastos'])).toEqual([])
  })
})
