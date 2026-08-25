import { NextRequest, NextResponse } from 'next/server'
import { getDashboardData, getDueDateAlerts, getStoreOptions } from '@/lib/db/queries'
import { parsePeriodLabel } from '@/lib/period'
import { effectiveStoreParam, getSessionContext, isAdmin, scopedStoreList } from '@/lib/session'

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })

  const searchParams = request.nextUrl.searchParams
  const period = parsePeriodLabel(searchParams.get('period'), 'today')
  const store = effectiveStoreParam(ctx, searchParams.get('store'))

  const [data, storeOptions, dueAlerts] = await Promise.all([
    getDashboardData(period, store),
    getStoreOptions(),
    getDueDateAlerts(isAdmin(ctx) ? null : ctx.storeId, isAdmin(ctx)),
  ])

  return NextResponse.json({
    ...data,
    dueAlerts,
    stores: scopedStoreList(ctx, storeOptions.map((row) => row.name)),
  })
}
