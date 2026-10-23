import { Suspense } from 'react'
import { ClientsView } from '@/components/clients-view'

export default function Page() {
  return (
    <Suspense>
      <ClientsView />
    </Suspense>
  )
}
