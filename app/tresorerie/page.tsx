import { notFound } from 'next/navigation'
import { getSessionContext, isAdmin } from '@/lib/session'
import { TreasuryView } from '@/components/treasury-view'

export default async function Page() {
  const ctx = await getSessionContext()
  if (!ctx || !isAdmin(ctx)) notFound()
  return <TreasuryView />
}
