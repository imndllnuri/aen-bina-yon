import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from './theme-context'
import type { Theme } from './theme-context'

const NEXT: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' }
const LABEL: Record<Theme, string> = {
  light: 'Açık tema (değiştirmek için tıklayın)',
  dark: 'Koyu tema (değiştirmek için tıklayın)',
  system: 'Sistem teması (değiştirmek için tıklayın)',
}

/** One button that cycles: light -> dark -> system. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={LABEL[theme]}
      title={LABEL[theme]}
      onClick={() => setTheme(NEXT[theme])}
    >
      <Icon />
    </Button>
  )
}
