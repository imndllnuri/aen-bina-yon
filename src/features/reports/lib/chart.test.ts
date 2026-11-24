import { describe, expect, it } from 'vitest'
import { barPercent, compactTRY, monthTick, niceMax, ticksFor } from './chart'

describe('niceMax (the round top of the scale)', () => {
  it('rounds up to 1, 2, 2.5, 5 or 10 times a power of ten, never below the biggest value', () => {
    expect(niceMax(100_00)).toBe(100_00)
    expect(niceMax(101_00)).toBe(200_00)
    expect(niceMax(230_00)).toBe(250_00)
    expect(niceMax(251_00)).toBe(500_00)
    expect(niceMax(501_00)).toBe(1000_00)
    expect(niceMax(1)).toBe(1)
    for (const v of [1, 7, 99, 123456, 987654321, 1_500_000_00]) expect(niceMax(v)).toBeGreaterThanOrEqual(v)
  })
  it('gives an empty chart a scale of 100 TL', () => {
    expect(niceMax(0)).toBe(100_00)
    expect(niceMax(-5)).toBe(100_00)
    expect(niceMax(Number.NaN)).toBe(100_00)
  })
})

describe('barPercent', () => {
  it('is the share of the scale', () => {
    expect(barPercent(50, 200)).toBe(25)
    expect(barPercent(200, 200)).toBe(100)
  })
  it('shows a small value (at least 1 %) but nothing for zero or less, and never above 100', () => {
    expect(barPercent(1, 1_000_000)).toBe(1)
    expect(barPercent(0, 200)).toBe(0)
    expect(barPercent(-5, 200)).toBe(0)
    expect(barPercent(300, 200)).toBe(100)
    expect(barPercent(50, 0)).toBe(0)
  })
})

describe('axis texts', () => {
  it('has five ticks from 0 to the top', () => {
    expect(ticksFor(1000)).toEqual([0, 250, 500, 750, 1000])
  })
  it('writes money short for the axis', () => {
    expect(compactTRY(0)).toBe('₺0')
    // the number and the unit are joined by a non-breaking space
    const plain = (text: string) => text.replace(/\u00a0/g, ' ')
    expect(plain(compactTRY(12_000_00))).toBe('₺12 B')
    expect(plain(compactTRY(1_500_000_00))).toBe('₺1,5 Mn')
  })
  it('writes the month in three letters, with the year for the first column and for January', () => {
    expect(monthTick('2026-11-01', false)).toBe('Kas')
    expect(monthTick('2026-01-01', true)).toBe('Oca ’26')
    expect(monthTick('2026-03-01', false)).toBe('Mar')
  })
})
