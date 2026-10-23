import { Suspense } from 'react'
import { FournisseursView } from '@/components/fournisseurs-view'

export default function Page() {
  return (
    <Suspense>
      <FournisseursView />
    </Suspense>
  )
}
