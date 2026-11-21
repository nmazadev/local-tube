import { useSyncExternalStore } from 'react'
import { storage } from './storage'

/** Palettes defined in index.css (`[data-theme="…"]`). Swatches are for the picker only. */
export const THEMES = [
  { id: 'bubblegum', name: 'Bubblegum', swatches: ['#A6EBC9', '#FFC2DD', '#FFEFA3', '#33294F'] },
  { id: 'lavender', name: 'Lavender', swatches: ['#CDB8FF', '#FFD3B6', '#B8F0E0', '#2E2A5A'] },
  { id: 'peach', name: 'Peach Sorbet', swatches: ['#FFC2A3', '#BFE3FF', '#FFF0A3', '#4A2B26'] },
  { id: 'matcha', name: 'Matcha', swatches: ['#B5E8A0', '#F6E3A6', '#FFD8A8', '#24392A'] },
  { id: 'soda', name: 'Soda', swatches: ['#A8DBFF', '#FFC6E5', '#FFF0A8', '#1E2F4D'] },
  { id: 'sunset', name: 'Sunset', swatches: ['#FFB8D0', '#FFD9A0', '#C9B8FF', '#3E2343'] },
] as const

export type ThemeId = (typeof THEMES)[number]['id']
export type Mode = 'light' | 'dark' | 'system'

// Same keys and defaults as the pre-paint script in index.html.
const THEME_KEY = 'theme'
const MODE_KEY = 'mode'

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

interface ThemeState {
  theme: ThemeId
  mode: Mode
  /** What's actually shown once "system" is resolved. */
  resolved: 'light' | 'dark'
}

function read(): ThemeState {
  const saved = storage.get<string>(THEME_KEY, 'bubblegum')
  const theme = (THEMES.some((t) => t.id === saved) ? saved : 'bubblegum') as ThemeId
  const mode = storage.get<Mode>(MODE_KEY, 'system')
  const resolved = mode === 'system' ? (darkQuery.matches ? 'dark' : 'light') : mode
  return { theme, mode, resolved }
}

let state = read()

/** The phone's status bar (and an installed app's title bar) takes the header's colour. */
function syncThemeColor() {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--p-card').trim()
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (color && meta) meta.content = color
}

function apply() {
  state = read()
  const root = document.documentElement
  root.dataset.theme = state.theme
  root.classList.toggle('dark', state.resolved === 'dark')
  syncThemeColor()
  for (const fn of listeners) fn()
}

darkQuery.addEventListener('change', apply)
// After the stylesheet is in (in development it's injected by a later import).
requestAnimationFrame(syncThemeColor)

export function setTheme(theme: ThemeId) {
  storage.set(THEME_KEY, theme)
  apply()
}

export function setMode(mode: Mode) {
  storage.set(MODE_KEY, mode)
  apply()
}

export function useTheme(): ThemeState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => state,
  )
}
