import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getSessionContext, isAdmin } from '@/lib/session'
import { FournisseursView } from '@/components/fournisseurs-view'

export default async function Page() {
  const ctx = await getSessionContext()
  if (!ctx || !isAdmin(ctx)) notFound()

  return (
    <Suspense>
      <FournisseursView />
    </Suspense>
  )
}
