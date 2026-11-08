import { describe, expect, it } from 'vitest'
import { formatDate, formatDateLong, formatDateTime, formatTRY, todayIstanbul } from './format'

describe('formatTRY', () => {
  it('uses the lira sign, dot for thousands and comma for decimals', () => {
    expect(formatTRY(1234.5)).toBe('₺1.234,50')
    expect(formatTRY(0)).toBe('₺0,00')
  })

  it('keeps kuruş exact for typical charge amounts', () => {
    expect(formatTRY(1250)).toBe('₺1.250,00')
    expect(formatTRY(99.99)).toBe('₺99,99')
  })
})

describe('formatDate (GG.AA.YYYY)', () => {
  it('formats a date-only string without shifting the day', () => {
    expect(formatDate('2026-11-08')).toBe('08.11.2026')
    expect(formatDate('2026-01-01')).toBe('01.01.2026')
    expect(formatDate('2026-12-31')).toBe('31.12.2026')
  })

  it('converts a timestamp to Istanbul time (UTC+3), even across midnight', () => {
    // 21:30 UTC on 8 Nov is already 00:30 on 9 Nov in Istanbul.
    expect(formatDate('2026-11-08T21:30:00Z')).toBe('09.11.2026')
    expect(formatDateTime('2026-11-08T21:30:00Z')).toBe('09.11.2026 00:30')
  })
})

describe('formatDateLong', () => {
  it('writes the Turkish month name', () => {
    expect(formatDateLong('2026-11-08')).toBe('8 Kasım 2026')
  })
})

describe('todayIstanbul', () => {
  it('returns the Istanbul calendar day as YYYY-MM-DD', () => {
    expect(todayIstanbul(new Date('2026-11-08T12:00:00Z'))).toBe('2026-11-08')
    expect(todayIstanbul(new Date('2026-11-08T22:00:00Z'))).toBe('2026-11-09')
  })
})
