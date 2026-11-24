import { describe, expect, it } from 'vitest'
import { chargeTypeSchema, companySchema, parseDecimal, rulesSchema, SPLIT_LABEL } from './schemas'

const rules = { dueDay: '15', ydoRate: '25,49', lateFeeRate: '5', lateFeeMethod: 'daily', graceDays: '0', commissionPayer: 'management', fee2: '', fee3: '', fee6: '', fee9: '' }
const messages = (value: unknown) => {
  const r = rulesSchema.safeParse(value)
  return r.success ? [] : r.error.issues.map((i) => i.message)
}

describe('parseDecimal', () => {
  it('reads a comma or a dot, with at most two decimals', () => {
    expect(parseDecimal('25,49')).toBe(25.49)
    expect(parseDecimal('25.49')).toBe(25.49)
    expect(parseDecimal(' 5 ')).toBe(5)
    expect(parseDecimal('0')).toBe(0)
  })
  it('refuses everything else', () => {
    for (const bad of ['', 'abc', '1,234', '25,491', '-1', '1e3', '12345', '1,2,3', '٣']) expect(parseDecimal(bad)).toBeNull()
  })
})

describe('rulesSchema (the limits of the database)', () => {
  it('accepts the usual values', () => {
    expect(rulesSchema.safeParse(rules).success).toBe(true)
    expect(rulesSchema.safeParse({ ...rules, commissionPayer: 'resident', fee2: '2,5', fee3: '3.46', fee6: '0', fee9: '10' }).success).toBe(true)
  })
  it('wants a due day from 1 to 28', () => {
    for (const ok of ['1', '28']) expect(rulesSchema.safeParse({ ...rules, dueDay: ok }).success).toBe(true)
    for (const bad of ['0', '29', '', 'a', '1.5']) expect(messages({ ...rules, dueDay: bad })).toContain('Son ödeme günü 1 ile 28 arasında olmalı.')
  })
  it('wants YDO from 0 to 100 and a late fee from 0 to 10', () => {
    expect(rulesSchema.safeParse({ ...rules, ydoRate: '100' }).success).toBe(true)
    expect(messages({ ...rules, ydoRate: '100,01' })[0]).toMatch(/YDO oranı/)
    expect(messages({ ...rules, ydoRate: 'x' })[0]).toMatch(/sayı yazın/)
    expect(rulesSchema.safeParse({ ...rules, lateFeeRate: '10' }).success).toBe(true)
    expect(messages({ ...rules, lateFeeRate: '10,5' })[0]).toMatch(/Gecikme oranı/)
  })
  it('wants a grace of 0 to 60 days and a known method', () => {
    expect(rulesSchema.safeParse({ ...rules, graceDays: '60' }).success).toBe(true)
    expect(messages({ ...rules, graceDays: '61' })).toContain('Ek süre 0 ile 60 gün arasında olmalı.')
    expect(messages({ ...rules, lateFeeMethod: 'weekly' })).toContain('Yöntemi seçin.')
    expect(messages({ ...rules, commissionPayer: 'x' })).toContain('Seçin.')
  })
  it('lets a fee be empty, or a number from 0 to 10', () => {
    expect(messages({ ...rules, fee2: '10,01' })[0]).toMatch(/0 ile 10/)
    expect(messages({ ...rules, fee9: 'abc' })[0]).toMatch(/0 ile 10/)
    expect(messages({ ...rules, fee3: '-1' })[0]).toMatch(/0 ile 10/)
  })
})

describe('companySchema', () => {
  const ok = { name: 'Firma', phone: '', email: '', address: '', taxNo: '' }
  it('wants a name; the rest may be empty', () => {
    expect(companySchema.safeParse(ok).success).toBe(true)
    expect(companySchema.safeParse({ ...ok, name: '   ' }).success).toBe(false)
  })
  it('has the same limits as the database', () => {
    expect(companySchema.safeParse({ ...ok, name: 'a'.repeat(200) }).success).toBe(true)
    expect(companySchema.safeParse({ ...ok, name: 'a'.repeat(201) }).success).toBe(false)
    expect(companySchema.safeParse({ ...ok, phone: '1'.repeat(30) }).success).toBe(true)
    expect(companySchema.safeParse({ ...ok, phone: '1'.repeat(31) }).success).toBe(false)
    expect(companySchema.safeParse({ ...ok, address: 'a'.repeat(501) }).success).toBe(false)
    expect(companySchema.safeParse({ ...ok, taxNo: '1'.repeat(31) }).success).toBe(false)
  })
  it('wants a real e-mail, or none', () => {
    expect(companySchema.safeParse({ ...ok, email: 'a@b.com' }).success).toBe(true)
    for (const bad of ['abc', 'a@', '@b', 'a b@c.com']) expect(companySchema.safeParse({ ...ok, email: bad }).success).toBe(false)
  })
})

describe('chargeTypeSchema', () => {
  const ok = { name: 'Çatı', split: 'equal', tenantVisible: true, active: true, sort: '5' }
  it('has the same limits as the database', () => {
    expect(chargeTypeSchema.safeParse(ok).success).toBe(true)
    expect(chargeTypeSchema.safeParse({ ...ok, name: ' ' }).success).toBe(false)
    expect(chargeTypeSchema.safeParse({ ...ok, name: 'a'.repeat(101) }).success).toBe(false)
    expect(chargeTypeSchema.safeParse({ ...ok, split: 'weekly' }).success).toBe(false)
    expect(chargeTypeSchema.safeParse({ ...ok, sort: '999' }).success).toBe(true)
    expect(chargeTypeSchema.safeParse({ ...ok, sort: '1000' }).success).toBe(false)
    expect(chargeTypeSchema.safeParse({ ...ok, sort: '-1' }).success).toBe(false)
  })
  it('names all four split methods', () => {
    expect(Object.keys(SPLIT_LABEL).sort()).toEqual(['equal', 'gross_m2', 'land_share', 'per_unit'])
  })
})
