import { useCallback, useEffect, useState } from 'react'

/**
 * Dark by default. Choosing light is remembered on this device only, as a
 * display preference (no study state is kept anywhere).
 */
export type Theme = 'light' | 'dark'
const KEY = 'apuntes:theme'

function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f7f4ee' : '#14161d')
    try {
      if (theme === 'light') localStorage.setItem(KEY, 'light')
      else localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, setTheme, toggle }
}
