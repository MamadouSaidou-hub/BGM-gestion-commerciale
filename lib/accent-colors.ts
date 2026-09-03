export const ACCENT_STORAGE_KEY = 'bgm-accent-color'

export const accentColors = [
  { name: 'Marine', value: '#0b2e5c' },
  { name: 'Forêt', value: '#1f7a4d' },
  { name: 'Bordeaux', value: '#8c2f39' },
  { name: 'Violet', value: '#5b3a8e' },
  { name: 'Sarcelle', value: '#0f7a72' },
  { name: 'Ambre', value: '#b35a1f' },
] as const

export function applyAccentColor(value: string) {
  document.documentElement.style.setProperty('--primary', value)
}
