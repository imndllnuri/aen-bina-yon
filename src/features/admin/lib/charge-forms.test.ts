import { describe, expect, it } from 'vitest'
import {
  bulkChargeSchema,
  chargeEditSchema,
  isRealDate,
  kurusOf,
  planSchema,
  reasonSchema,
  singleChargeSchema,
} from './charge-schemas'
import { createRequestIds } from './request-ids'

const goodBulk = {
  typeId: 't1',
  split: 'land_share',
  amount: '10.000,00',
  period: '2026-11-01',
  dueDate: '2026-11-15',
  description: '',
  tenantVisible: true,
  kararNo: '',
  kararDate: '',
}

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) => (result.error?.issues ?? []).map((i) => i.message)

describe('isRealDate', () => {
  it('accepts real dates and refuses impossible ones', () => {
    expect(isRealDate('2026-11-09')).toBe(true)
    expect(isRealDate('2028-02-29')).toBe(true)
    expect(isRealDate('2026-02-29')).toBe(false)
    expect(isRealDate('2026-02-30')).toBe(false)
    expect(isRealDate('2026-13-01')).toBe(false)
    expect(isRealDate('09.11.2026')).toBe(false)
    expect(isRealDate('')).toBe(false)
  })
})

describe('bulk charge form', () => {
  it('accepts a normal bulk charge', () => {
    expect(bulkChargeSchema.safeParse(goodBulk).success).toBe(true)
  })

  it('says exactly what is wrong with the amount', () => {
    expect(messages(bulkChargeSchema.safeParse({ ...goodBulk, amount: '1.5' }))).toEqual([
      'Binler için nokta, kuruş için virgül kullanın. Örnek: 1.500,50',
    ])
    expect(messages(bulkChargeSchema.safeParse({ ...goodBulk, amount: '' }))).toEqual(['Tutarı yazın.'])
    expect(messages(bulkChargeSchema.safeParse({ ...goodBulk, amount: '0' }))).toEqual(["Tutar 0'dan büyük olmalı."])
  })

  it('refuses an unknown split method, a mid-month period and an impossible due date', () => {
    expect(bulkChargeSchema.safeParse({ ...goodBulk, split: 'bogus' }).success).toBe(false)
    expect(bulkChargeSchema.safeParse({ ...goodBulk, split: 'toString' }).success).toBe(false)
    expect(bulkChargeSchema.safeParse({ ...goodBulk, period: '2026-11-15' }).success).toBe(false)
    expect(bulkChargeSchema.safeParse({ ...goodBulk, dueDate: '2026-02-30' }).success).toBe(false)
    expect(bulkChargeSchema.safeParse({ ...goodBulk, typeId: '' }).success).toBe(false)
  })

  it('wants karar number and karar date together', () => {
    expect(bulkChargeSchema.safeParse({ ...goodBulk, kararNo: '2026/5', kararDate: '2026-11-02' }).success).toBe(true)
    const onlyNo = bulkChargeSchema.safeParse({ ...goodBulk, kararNo: '2026/5' })
    expect(onlyNo.success).toBe(false)
    expect(onlyNo.error?.issues[0].path).toEqual(['kararDate'])
    const onlyDate = bulkChargeSchema.safeParse({ ...goodBulk, kararDate: '2026-11-02' })
    expect(onlyDate.error?.issues[0].path).toEqual(['kararNo'])
  })

  it('limits the description to 200 characters', () => {
    expect(bulkChargeSchema.safeParse({ ...goodBulk, description: 'x'.repeat(200) }).success).toBe(true)
    expect(bulkChargeSchema.safeParse({ ...goodBulk, description: 'x'.repeat(201) }).success).toBe(false)
  })
})

describe('single charge, edit and plan forms', () => {
  it('needs a unit for a single charge', () => {
    const good = { unitId: 'u1', typeId: 't1', amount: '1.500', period: '2026-11-01', dueDate: '2026-11-15', description: '', tenantVisible: false }
    expect(singleChargeSchema.safeParse(good).success).toBe(true)
    expect(singleChargeSchema.safeParse({ ...good, unitId: '' }).success).toBe(false)
  })

  it('checks an edit', () => {
    expect(chargeEditSchema.safeParse({ amount: '650,00', dueDate: '2026-11-20', description: '', tenantVisible: true }).success).toBe(true)
    expect(chargeEditSchema.safeParse({ amount: 'abc', dueDate: '2026-11-20', description: '', tenantVisible: true }).success).toBe(false)
  })

  it('checks a plan: due day 1-28', () => {
    const good = { name: 'Aylık aidat', typeId: 't1', split: 'per_unit', amount: '1.500', day: '5', tenantVisible: true, description: '', kararNo: '', kararDate: '' }
    expect(planSchema.safeParse(good).success).toBe(true)
    for (const day of ['0', '29', '', 'abc', '5.5', '-1']) expect(planSchema.safeParse({ ...good, day }).success, day).toBe(false)
    expect(planSchema.safeParse({ ...good, name: '   ' }).success).toBe(false)
  })

  it('needs a reason of 3 to 300 characters', () => {
    expect(reasonSchema.safeParse({ reason: 'ab' }).success).toBe(false)
    expect(reasonSchema.safeParse({ reason: '  ab  ' }).success).toBe(false)
    expect(reasonSchema.safeParse({ reason: 'Yanlış dönem' }).success).toBe(true)
    expect(reasonSchema.safeParse({ reason: 'x'.repeat(301) }).success).toBe(false)
  })

  it('turns a checked amount into kuruş, and throws on an unchecked one', () => {
    expect(kurusOf('1.500,50')).toBe(150050)
    expect(() => kurusOf('abc')).toThrow()
  })
})

describe('createRequestIds (a double click must not charge twice)', () => {
  const counter = () => {
    let n = 0
    return () => `id-${++n}`
  }

  it('gives the same id while nothing changed (double click, retry)', () => {
    const keyFor = createRequestIds(counter())
    expect(keyFor({ amount: 100 })).toBe('id-1')
    expect(keyFor({ amount: 100 })).toBe('id-1')
    expect(keyFor({ amount: 100 })).toBe('id-1')
  })

  it('gives a NEW id as soon as anything differs', () => {
    const keyFor = createRequestIds(counter())
    expect(keyFor({ amount: 100, units: ['a'] })).toBe('id-1')
    expect(keyFor({ amount: 101, units: ['a'] })).toBe('id-2')
    expect(keyFor({ amount: 101, units: ['a', 'b'] })).toBe('id-3')
  })

  it('treats going back to an earlier payload as a different request too', () => {
    const keyFor = createRequestIds(counter())
    keyFor({ amount: 1 })
    keyFor({ amount: 2 })
    expect(keyFor({ amount: 1 })).toBe('id-3')
  })

  it('makes real random uuids by default', () => {
    const keyFor = createRequestIds()
    expect(keyFor('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})
