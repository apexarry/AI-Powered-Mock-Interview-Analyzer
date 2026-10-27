'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type ThemeContextValue = {
  isNight: boolean
  toggleNight: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const THEME_KEY = 'signal-theme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isNight, setIsNight] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem(THEME_KEY) === 'night')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isNight)
    document.documentElement.classList.toggle('light', !isNight)
    window.localStorage.setItem(THEME_KEY, isNight ? 'night' : 'day')
  }, [isNight])

  return <ThemeContext.Provider value={{ isNight, toggleNight: () => setIsNight((value) => !value) }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
