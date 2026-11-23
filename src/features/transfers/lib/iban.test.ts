import { describe, expect, it } from 'vitest'
import { formatIban, isValidTrIban, normalizeIban } from './iban'

describe('Turkish IBAN', () => {
  it('accepts valid numbers, also in lower case and with spaces', () => {
    expect(isValidTrIban('TR330006100519786457841326')).toBe(true)
    expect(isValidTrIban('tr33 0006 1005 1978 6457 8413 26')).toBe(true)
    expect(isValidTrIban('TR820006200000012345678901')).toBe(true)
    expect(isValidTrIban('TR850001000000000012345678')).toBe(true)
  })
  it('refuses a wrong check digit, a wrong length, another country, letters and nothing', () => {
    expect(isValidTrIban('TR340006100519786457841326')).toBe(false)
    expect(isValidTrIban('TR33000610051978645784132')).toBe(false)
    expect(isValidTrIban('TR3300061005197864578413260')).toBe(false)
    expect(isValidTrIban('DE89370400440532013000')).toBe(false)
    expect(isValidTrIban('TR33000610051978645784132A')).toBe(false)
    expect(isValidTrIban('')).toBe(false)
  })
  it('catches a single mistyped digit anywhere', () => {
    const good = 'TR330006100519786457841326'
    for (let i = 4; i < good.length; i++) {
      const wrong = good.slice(0, i) + String((Number(good[i]) + 1) % 10) + good.slice(i + 1)
      expect(isValidTrIban(wrong), `digit ${i}`).toBe(false)
    }
  })
  it('writes an IBAN in groups of four, the way a bank app shows it', () => {
    expect(formatIban('TR330006100519786457841326')).toBe('TR33 0006 1005 1978 6457 8413 26')
    expect(formatIban(' tr33 0006 1005 1978 6457 8413 26 ')).toBe('TR33 0006 1005 1978 6457 8413 26')
    expect(normalizeIban(' tr33 0006 ')).toBe('TR330006')
  })
})
