import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authStorage, getRememberMe, setRememberMe } from './session-storage'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => vi.restoreAllMocks())

describe('authStorage ("Beni hatırla")', () => {
  it('remembers by default: the session goes to localStorage', () => {
    expect(getRememberMe()).toBe(true)
    authStorage.setItem('session', 'one')
    expect(localStorage.getItem('session')).toBe('one')
    expect(sessionStorage.getItem('session')).toBeNull()
  })

  it('does not remember when switched off: the session goes to sessionStorage', () => {
    setRememberMe(false)
    expect(getRememberMe()).toBe(false)
    authStorage.setItem('session', 'one')
    expect(sessionStorage.getItem('session')).toBe('one')
    expect(localStorage.getItem('session')).toBeNull()
  })

  it('moves the session when the choice changes and never leaves a copy behind', () => {
    authStorage.setItem('session', 'old')
    setRememberMe(false)
    authStorage.setItem('session', 'new')
    expect(sessionStorage.getItem('session')).toBe('new')
    expect(localStorage.getItem('session')).toBeNull()
  })

  it('reads from either place', () => {
    sessionStorage.setItem('a', '1')
    localStorage.setItem('b', '2')
    expect(authStorage.getItem('a')).toBe('1')
    expect(authStorage.getItem('b')).toBe('2')
    expect(authStorage.getItem('missing')).toBeNull()
  })

  it('removes from both places', () => {
    sessionStorage.setItem('a', '1')
    localStorage.setItem('a', '2')
    authStorage.removeItem('a')
    expect(sessionStorage.getItem('a')).toBeNull()
    expect(localStorage.getItem('a')).toBeNull()
  })

  it('does not crash when the browser blocks storage (private window, strict settings)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => authStorage.setItem('a', '1')).not.toThrow()
    expect(authStorage.getItem('a')).toBeNull()
    expect(() => authStorage.removeItem('a')).not.toThrow()
    expect(() => setRememberMe(false)).not.toThrow()
    expect(getRememberMe()).toBe(true)
  })
})
