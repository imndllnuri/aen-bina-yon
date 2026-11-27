import { describe, expect, it } from 'vitest'
import type { LateFeeLine } from './parse'
import { lateLabel, methodLabel, ruleWarnings, selectionTotals, unitName } from './summary'

const line = (id: string, amountKurus: number): LateFeeLine => ({
  chargeId: id, unitId: 'u', block: 'A Blok', door: '3', typeName: 'Aidat', period: null, dueDate: '2026-10-15', tenantVisible: true,
  principalKurus: 0, remainingKurus: 0, days: 1, feeKurus: 0, billedKurus: 0, amountKurus,
})

describe('selectionTotals', () => {
  const lines = [line('a', 6667), line('b', 833), line('c', 1333)]
  it('counts and adds only the ticked lines, in the order of the list', () => {
    expect(selectionTotals(lines, new Set(['c', 'a']))).toEqual({ ids: ['a', 'c'], count: 2, kurus: 8000 })
  })
  it('is empty when nothing is ticked', () => expect(selectionTotals(lines, new Set())).toEqual({ ids: [], count: 0, kurus: 0 }))
  it('ignores ids that are not in the list', () => expect(selectionTotals(lines, new Set(['zzz', 'b']))).toEqual({ ids: ['b'], count: 1, kurus: 833 }))
})

describe('labels', () => {
  it('names a unit by block and door', () => expect(unitName({ block: 'B Blok', door: '12' })).toBe('B Blok · 12'))
  it('shows days for the daily method', () => expect(lateLabel(40, 'daily')).toBe('40 gün'))
  it('shows started months for the monthly method (30 days = 1, 31 = 2)', () => {
    expect(lateLabel(30, 'monthly')).toBe('1 ay (30 gün)')
    expect(lateLabel(31, 'monthly')).toBe('2 ay (31 gün)')
    expect(lateLabel(1, 'monthly')).toBe('1 ay (1 gün)')
  })
  it('says how each method counts', () => {
    expect(methodLabel('daily')).toMatch(/Günlük/)
    expect(methodLabel('monthly')).toMatch(/Başlanan her ay/)
  })
})

describe('ruleWarnings', () => {
  it('has no warning for the legal rate with the daily method', () => {
    expect(ruleWarnings({ rate: 5, method: 'daily' })).toEqual([])
    expect(ruleWarnings({ rate: 3.5, method: 'daily' })).toEqual([])
  })
  it('warns above 5 %, with the rate written the Turkish way', () => {
    const [w] = ruleWarnings({ rate: 7.5, method: 'daily' })
    expect(w).toMatch(/%7,5/)
    expect(w).toMatch(/md\. 20/)
  })
  it('warns for any rate above 5, even 5.5 (the law says 5)', () => {
    expect(ruleWarnings({ rate: 5.5, method: 'daily' })).toHaveLength(1)
    expect(ruleWarnings({ rate: 5.01, method: 'daily' })).toHaveLength(1)
  })
  it('warns about the started-month method', () => {
    const warnings = ruleWarnings({ rate: 5, method: 'monthly' })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/ilk günü bile tam ay/)
  })
  it('gives both warnings when both apply', () => expect(ruleWarnings({ rate: 10, method: 'monthly' })).toHaveLength(2))
})
