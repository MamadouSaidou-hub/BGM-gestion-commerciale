'use client'

import { RefreshCw } from 'lucide-react'

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="form-error" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span>{message}</span>
      <button type="button" className="btn-secondary" onClick={onRetry} style={{ height: 28, padding: '0 10px', flexShrink: 0 }}>
        <RefreshCw size={12} /> Réessayer
      </button>
    </div>
  )
}
