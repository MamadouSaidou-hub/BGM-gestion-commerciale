export const THEME_STORAGE_KEY = 'bgm-theme'

export type ThemeMode = 'light' | 'dark' | 'system'

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  if (mode === 'system') {
    root.removeAttribute('data-theme')
    root.style.colorScheme = 'light dark'
  } else {
    root.setAttribute('data-theme', mode)
    root.style.colorScheme = mode
  }
}
