'use client'

import { useEffect, useState } from 'react'
import { Check, Laptop, Moon, Palette, Sun } from 'lucide-react'
import { ACCENT_STORAGE_KEY, accentColors, applyAccentColor } from '@/lib/accent-colors'
import { applyTheme, THEME_STORAGE_KEY, type ThemeMode } from '@/lib/theme'

const themeOptions: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: 'light', label: 'Clair', icon: Sun },
  { mode: 'dark', label: 'Sombre', icon: Moon },
  { mode: 'system', label: 'Système', icon: Laptop },
]

export function AppearanceMenu({ variant = 'sidebar' }: { variant?: 'sidebar' | 'topbar' }) {
  const [open, setOpen] = useState(false)
  const [accent, setAccent] = useState<string>('')
  const [theme, setTheme] = useState<ThemeMode>('system')

  useEffect(() => {
    try {
      setAccent(localStorage.getItem(ACCENT_STORAGE_KEY) ?? accentColors[0].value)
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
      setTheme(storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'system')
    } catch {
      setAccent(accentColors[0].value)
    }
  }, [])

  function chooseAccent(value: string) {
    setAccent(value)
    applyAccentColor(value)
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, value)
    } catch {
      // localStorage unavailable (private browsing, etc.) — the color still applies for this session
    }
  }

  function chooseTheme(mode: ThemeMode) {
    setTheme(mode)
    applyTheme(mode)
    try {
      if (mode === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
      else localStorage.setItem(THEME_STORAGE_KEY, mode)
    } catch {
      // localStorage unavailable — theme still applies for this session
    }
  }

  const isTopbar = variant === 'topbar'

  return (
    <div style={{ position: 'relative' }}>
      {isTopbar ? (
        <button type="button" className="icon-button" onClick={() => setOpen((value) => !value)} aria-label="Apparence">
          <Palette />
        </button>
      ) : (
        <button
          type="button"
          className="nav-link"
          style={{ width: '100%', border: 0, background: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
          onClick={() => setOpen((value) => !value)}
        >
          <Palette />Apparence
        </button>
      )}
      {open && (
        <div
          style={{
            position: 'absolute',
            ...(isTopbar
              ? { top: '100%', right: 0, marginTop: 6, width: 220 }
              : { bottom: '100%', left: 0, right: 0, marginBottom: 6 }),
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            boxShadow: '0 4px 14px rgba(16,25,41,.25)',
            zIndex: 20,
          }}
        >
          <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--faint)', letterSpacing: '.06em', textTransform: 'uppercase', margin: '0 0 8px' }}>Thème</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {themeOptions.map((option) => {
              const Icon = option.icon
              const active = theme === option.mode
              return (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => chooseTheme(option.mode)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    padding: '8px 4px',
                    borderRadius: 6,
                    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                    background: active ? 'var(--tint-primary)' : 'transparent',
                    color: active ? 'var(--primary)' : 'var(--muted)',
                    fontSize: 9,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Icon size={14} />
                  {option.label}
                </button>
              )
            })}
          </div>

          <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--faint)', letterSpacing: '.06em', textTransform: 'uppercase', margin: '0 0 10px' }}>Couleur d’accent</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {accentColors.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => chooseAccent(color.value)}
                aria-label={color.name}
                title={color.name}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: color.value,
                  border: accent === color.value ? '2px solid var(--ink)' : '2px solid transparent',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {accent === color.value && <Check size={14} color="white" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
