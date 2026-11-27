import { describe, expect, it } from 'vitest'
import type { Json } from '@/lib/database.types'
import { parsePreview } from './parse'

const line = (over: Record<string, Json> = {}): Json => ({
  charge_id: 'c1', unit_id: 'u1', block: 'A Blok', door: '12', type: 'Aidat', period: '2026-10-01', due_date: '2026-10-15', tenant_visible: true,
  principal_kurus: 100000, remaining_kurus: 60000, days: 44, fee_kurus: 4400, billed_kurus: 1500, amount_kurus: 2900, ...over,
})
const answer = (over: Record<string, Json> = {}): Json => ({ as_of: '2026-11-28', rate: 5, method: 'daily', grace_days: 0, type_ready: true, lines: [line()], over: [], ...over })

describe('parsePreview', () => {
  it('reads the answer of preview_late_fees', () => {
    expect(parsePreview(answer())).toEqual({
      asOf: '2026-11-28', rate: 5, method: 'daily', graceDays: 0, typeReady: true, over: [],
      lines: [{ chargeId: 'c1', unitId: 'u1', block: 'A Blok', door: '12', typeName: 'Aidat', period: '2026-10-01', dueDate: '2026-10-15', tenantVisible: true,
        principalKurus: 100000, remainingKurus: 60000, days: 44, feeKurus: 4400, billedKurus: 1500, amountKurus: 2900 }],
    })
  })
  it('keeps a rate with decimals, the monthly method, and a debt without a month', () => {
    const p = parsePreview(answer({ rate: 2.5, method: 'monthly', grace_days: 5, lines: [line({ period: null })] }))
    expect(p).toMatchObject({ rate: 2.5, method: 'monthly', graceDays: 5 })
    expect(p.lines[0]?.period).toBeNull()
  })
  it('reads the "too high" list too, with a negative amount', () => {
    const p = parsePreview(answer({ lines: [], over: [line({ amount_kurus: -4333 })] }))
    expect(p.lines).toEqual([])
    expect(p.over[0]?.amountKurus).toBe(-4333)
  })
  it.each([
    ['not an object', null],
    ['an array', []],
    ['an unknown method', answer({ method: 'weekly' })],
    ['lines that are not a list', answer({ lines: 'x' })],
    ['over that is not a list', answer({ over: null })],
    ['a missing day', answer({ as_of: null })],
    ['a rate that is a string', answer({ rate: '5' })],
    ['a grace that is a fraction', answer({ grace_days: 1.5 })],
    ['type_ready that is not true/false', answer({ type_ready: 'yes' })],
    ['a line that is not an object', answer({ lines: ['x'] })],
    ['a money amount with kuruş fractions', answer({ lines: [line({ amount_kurus: 10.5 })] })],
    ['a money amount that is a string', answer({ lines: [line({ amount_kurus: '2900' })] })],
    ['a missing charge id', answer({ lines: [line({ charge_id: null })] })],
    ['a visibility flag that is not true/false', answer({ lines: [line({ tenant_visible: 1 })] })],
    ['a period that is a number', answer({ lines: [line({ period: 5 })] })],
  ])('refuses %s (the page then shows "could not load" instead of a wrong number)', (_name, json) => {
    expect(() => parsePreview(json as Json)).toThrow(/late fee preview/)
  })
})
