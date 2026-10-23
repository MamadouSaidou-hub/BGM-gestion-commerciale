import { Suspense } from 'react'
import { StockView } from '@/components/stock-view'

export default function Page() {
  return (
    <Suspense>
      <StockView />
    </Suspense>
  )
}
