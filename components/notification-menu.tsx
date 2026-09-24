'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'

type NotificationItem = {
  id: string
  tone: 'red' | 'orange' | 'blue'
  title: string
  subtitle: string
  href: string
}

const toneColor: Record<NotificationItem['tone'], string> = {
  red: 'var(--red)',
  orange: 'var(--orange)',
  blue: 'var(--blue)',
}

export function NotificationMenu() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    function load() {
      fetch('/api/notifications')
        .then((res) => (res.ok ? res.json() : { items: [] }))
        .then((json: { items: NotificationItem[] }) => {
          if (!cancelled) setItems(json.items ?? [])
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="icon-button notification-button" onClick={() => setOpen((value) => !value)} aria-label={`Notifications${items.length ? ` (${items.length})` : ''}`}>
        <Bell />
        {items.length > 0 && <span />}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            width: 320,
            maxHeight: 400,
            overflowY: 'auto',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 4px 14px rgba(16,25,41,.25)',
            zIndex: 20,
          }}
        >
          <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--faint)', letterSpacing: '.06em', textTransform: 'uppercase', margin: 0, padding: '12px 14px 8px' }}>
            Notifications{items.length > 0 ? ` (${items.length})` : ''}
          </p>
          {loading && <p style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 14px 14px' }}>Chargement...</p>}
          {!loading && items.length === 0 && <p style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 14px 14px' }}>Rien à signaler pour le moment.</p>}
          {!loading &&
            items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setOpen(false)}
                style={{ display: 'flex', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--divider)', textDecoration: 'none', color: 'inherit' }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: toneColor[item.tone], marginTop: 5, flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>{item.title}</span>
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--faint)', marginTop: 2 }}>{item.subtitle}</span>
                </span>
              </Link>
            ))}
        </div>
      )}
    </div>
  )
}
