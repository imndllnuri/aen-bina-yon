import { describe, expect, it } from 'vitest'
import { kindLabel, KIND_LABEL } from './kinds'
import { safeInternalPath } from './links'

describe('safeInternalPath: a notification link is followed only when it is a page of this app', () => {
  it('accepts internal paths', () => {
    for (const ok of ['/borclarim', '/odemelerim', '/yonetim/havale-onaylari', '/duyurular', '/', '/havale-bildirimi']) expect(safeInternalPath(ok), ok).toBe(ok)
  })
  it('refuses addresses, scripts, protocol-relative links and odd characters', () => {
    for (const bad of ['https://evil.example', 'http://x', 'javascript:alert(1)', '//evil.example/x', 'borclarim', '', ' /borclarim', '/borclarim?x=1', '/a b', '/<script>', '/%2e%2e', '//evil', '///', '//', 'data:text/html,x', '/' + 'a'.repeat(100)]) {
      expect(safeInternalPath(bad), bad).toBeNull()
    }
    expect(safeInternalPath(null)).toBeNull()
    expect(safeInternalPath(undefined)).toBeNull()
  })
})

describe('kindLabel', () => {
  it('names every kind in Turkish and shows an unknown kind as a plain notification', () => {
    expect(Object.keys(KIND_LABEL)).toHaveLength(10)
    expect(kindLabel('payment')).toBe('Ödeme')
    expect(kindLabel('havale_new')).toBe('Havale bildirimi')
    expect(kindLabel('request_new')).toBe('Yeni talep')
    expect(kindLabel('request_status')).toBe('Talep durumu')
    expect(kindLabel('request_comment')).toBe('Talep yorumu')
    expect(kindLabel('from_the_future')).toBe('Bildirim')
  })
})
