'use client'

import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  wide,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  wide?: boolean
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-panel ${wide ? 'modal-wide' : ''}`} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
          <button className="modal-close" onClick={onClose} aria-label="Fermer"><X size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
