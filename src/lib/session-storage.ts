// "Beni hatırla" (remember me).
// Supabase keeps the login session in a storage of our choice:
//   remember ON  (default) -> localStorage:   survives closing the browser
//   remember OFF           -> sessionStorage: gone when the tab is closed (shared computers)
// The choice is kept in one small flag. Storage can be blocked (private windows, strict
// settings), so every access is wrapped: the site must keep working without it.

const FLAG_KEY = 'aen-remember-me'

export function setRememberMe(remember: boolean): void {
  try {
    localStorage.setItem(FLAG_KEY, remember ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function getRememberMe(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) !== '0'
  } catch {
    return true
  }
}

/** The storage object handed to supabase-js (see src/lib/supabase.ts). */
export const authStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key) ?? sessionStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    try {
      const keep = getRememberMe() ? localStorage : sessionStorage
      const other = keep === localStorage ? sessionStorage : localStorage
      keep.setItem(key, value)
      other.removeItem(key) // never leave a copy in the other place
    } catch {
      /* ignore */
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}
