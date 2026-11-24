import { describe, expect, it } from 'vitest'
import { axisLabel, barPercent, monthTick, niceMax, ticksFor } from './chart'

describe('niceMax (the round top of the scale)', () => {
  it('rounds up to 1, 2, 4, 8 or 10 times a power of ten, never below the biggest value', () => {
    expect(niceMax(100_00)).toBe(100_00)
    expect(niceMax(101_00)).toBe(200_00)
    expect(niceMax(230_00)).toBe(400_00)
    expect(niceMax(401_00)).toBe(800_00)
    expect(niceMax(801_00)).toBe(1000_00)
    expect(niceMax(4950_25)).toBe(8000_00)
    for (const v of [101, 7_00, 99_00, 123456, 987654321, 1_500_000_00]) expect(niceMax(v)).toBeGreaterThanOrEqual(v)
  })
  it('makes all four quarter marks clean numbers of whole TL', () => {
    for (const v of [100_00, 150_00, 300_00, 999_00, 1234_56, 4950_25, 25_000_00, 1_234_567_00]) {
      for (const tick of ticksFor(niceMax(v))) expect(Number.isInteger(tick / 100)).toBe(true)
    }
  })
  it('keeps a value that is exactly a step (no needless jump to the next step)', () => {
    for (const v of [200_00, 400_00, 800_00, 1000_00, 2000_00, 40_000_00]) expect(niceMax(v)).toBe(v)
  })
  it('gives an empty chart (or a tiny one) a scale of 100 TL', () => {
    expect(niceMax(0)).toBe(100_00)
    expect(niceMax(-5)).toBe(100_00)
    expect(niceMax(Number.NaN)).toBe(100_00)
    expect(niceMax(1)).toBe(100_00)
    expect(niceMax(50_00)).toBe(100_00)
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
  it('writes the axis in full under 10.000 TL (a quarter of 5.000 is ₺1.250, not "₺1,3 B")', () => {
    expect(axisLabel(0)).toBe('₺0')
    expect(axisLabel(25_00)).toBe('₺25')
    expect(axisLabel(1250_00)).toBe('₺1.250')
    expect(axisLabel(9999_00)).toBe('₺9.999')
  })
  it('writes it short from 10.000 TL on, with the unit in words', () => {
    const plain = (text: string) => text.replace(/\u00a0/g, ' ')
    expect(plain(axisLabel(10_000_00))).toBe('₺10 bin')
    expect(plain(axisLabel(250_000_00))).toBe('₺250 bin')
    expect(plain(axisLabel(1_500_000_00))).toBe('₺1,5 milyon')
  })
  it('writes the month in three letters, with the year for the first column and for January', () => {
    expect(monthTick('2026-11-01', false)).toBe('Kas')
    expect(monthTick('2026-01-01', true)).toBe('Oca ’26')
    expect(monthTick('2026-03-01', false)).toBe('Mar')
  })
})
