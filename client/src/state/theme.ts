import { useSyncExternalStore } from 'react'

export type Theme = 'day' | 'night'

const KEY = 'theme'
const listeners = new Set<() => void>()
const systemNight = window.matchMedia('(prefers-color-scheme: dark)')

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'day' || value === 'night' ? value : null
  } catch {
    return null
  }
}

let current: Theme = stored() ?? (systemNight.matches ? 'night' : 'day')

function apply(theme: Theme) {
  current = theme
  document.documentElement.dataset.theme = theme
  listeners.forEach((notify) => notify())
}

apply(current)
systemNight.addEventListener('change', () => {
  if (!stored()) apply(systemNight.matches ? 'night' : 'day')
})

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Private windows can refuse storage; the choice then lasts until reload.
  }
  apply(theme)
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => current,
  )
}
