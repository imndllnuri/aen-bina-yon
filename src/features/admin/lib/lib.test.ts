import { describe, expect, it } from 'vitest'
import { findDoorConflicts, generateUnits, MAX_BULK_UNITS, nextDoorNumber, validateBulk, type BulkOptions } from './bulk-units'
import { compareDoorNo } from './door-no'
import { inviteMessage, toWhatsAppNumber, whatsappUrl } from './invite-message'
import {
  blockSchema,
  bulkSchema,
  emptyUnitForm,
  inviteSchema,
  parseDecimal,
  residentContactSchema,
  toUnitRow,
  unitSchema,
  type UnitFormValues,
} from './schemas'

const base: BulkOptions = { floors: 10, perFloor: 4, startNumber: 1, startFloor: 1 }

describe('generateUnits ("A Blok, 10 kat, katta 4 daire")', () => {
  it('makes floors x perFloor units with door numbers counting up without gaps', () => {
    const units = generateUnits(base)
    expect(units).toHaveLength(40)
    expect(units[0]).toEqual({ door_no: '1', floor: 1 })
    expect(units[3]).toEqual({ door_no: '4', floor: 1 })
    expect(units[4]).toEqual({ door_no: '5', floor: 2 })
    expect(units[39]).toEqual({ door_no: '40', floor: 10 })
    expect(new Set(units.map((u) => u.door_no)).size).toBe(40) // all different
  })

  it('can start at another number and floor (zemin kat = 0, bodrum = -1)', () => {
    const units = generateUnits({ floors: 2, perFloor: 2, startNumber: 17, startFloor: -1 })
    expect(units).toEqual([
      { door_no: '17', floor: -1 },
      { door_no: '18', floor: -1 },
      { door_no: '19', floor: 0 },
      { door_no: '20', floor: 0 },
    ])
  })

  it('returns nothing for invalid options (it never makes a half list)', () => {
    expect(generateUnits({ ...base, floors: 0 })).toEqual([])
    expect(generateUnits({ ...base, perFloor: 1.5 })).toEqual([])
    expect(generateUnits({ ...base, floors: Number.NaN })).toEqual([])
  })
})

describe('validateBulk', () => {
  it('accepts normal options', () => expect(validateBulk(base)).toBeNull())

  it.each([
    [{ ...base, floors: 0 }, /Kat sayısı/],
    [{ ...base, floors: 101 }, /Kat sayısı/],
    [{ ...base, perFloor: 0 }, /Katta daire/],
    [{ ...base, perFloor: 51 }, /Katta daire/],
    [{ ...base, startNumber: 0 }, /kapı numarası/],
    [{ ...base, startNumber: 100000 }, /kapı numarası/],
    [{ ...base, startFloor: -11 }, /Başlangıç katı/],
    [{ ...base, floors: 2.5 }, /tam sayı/],
  ])('rejects %j', (options, message) => expect(validateBulk(options)).toMatch(message))

  it(`stops at ${MAX_BULK_UNITS} units in one run`, () => {
    expect(validateBulk({ ...base, floors: 30, perFloor: 10 })).toBeNull() // exactly 300
    expect(validateBulk({ ...base, floors: 31, perFloor: 10 })).toMatch(/en fazla 300/)
    expect(generateUnits({ ...base, floors: 100, perFloor: 50 })).toEqual([])
  })
})

describe('findDoorConflicts', () => {
  it('lists door numbers already used in the block (case and spaces do not matter)', () => {
    const units = generateUnits({ floors: 1, perFloor: 4, startNumber: 1, startFloor: 1 })
    expect(findDoorConflicts(units, ['2', ' 4 ', '9'])).toEqual(['2', '4'])
    expect(findDoorConflicts(units, [])).toEqual([])
    expect(findDoorConflicts([{ door_no: '10A', floor: 1 }], ['10a'])).toEqual(['10A'])
  })
})

describe('nextDoorNumber', () => {
  it('continues after the highest number', () => {
    expect(nextDoorNumber([])).toBe(1)
    expect(nextDoorNumber(['1', '2', '16'])).toBe(17)
    expect(nextDoorNumber(['5', '10A', 'Dükkan'])).toBe(11) // "10A" counts as 10; text is ignored
  })
})

describe('compareDoorNo', () => {
  it('sorts numbers the way people expect', () => {
    expect(['10', '2', '1', '10A', '9'].sort(compareDoorNo)).toEqual(['1', '2', '9', '10', '10A'])
  })
})

describe('WhatsApp helpers', () => {
  it.each([
    ['0532 123 45 67', '905321234567'],
    ['532 123 45 67', '905321234567'],
    ['+90 532 123 45 67', '905321234567'],
    ['0090 532 123 45 67', '905321234567'],
    ['+49 170 1234567', '491701234567'],
    ['12345', null],
    ['', null],
    [null, null],
    ['abc', null],
  ])('%s -> %s', (phone, expected) => expect(toWhatsAppNumber(phone)).toBe(expected))

  it('builds the message with the first name and a one-time warning', () => {
    const message = inviteMessage({ name: 'Ahmet Yılmaz', link: 'https://x.test/l', firmName: '[FİRMA]' })
    expect(message).toContain('Merhaba Ahmet,')
    expect(message).toContain('https://x.test/l')
    expect(message).toMatch(/yalnızca bir kez/)
  })

  it('opens a chat with the person, or lets the admin pick a contact when there is no phone', () => {
    const message = 'Merhaba & hoş geldiniz'
    expect(whatsappUrl({ phone: '0532 123 45 67', message })).toBe(`https://wa.me/905321234567?text=${encodeURIComponent(message)}`)
    expect(whatsappUrl({ phone: null, message })).toBe(`https://wa.me/?text=${encodeURIComponent(message)}`)
  })
})

describe('parseDecimal', () => {
  it('reads dot and comma, and tells empty from wrong', () => {
    expect(parseDecimal('95.5')).toBe(95.5)
    expect(parseDecimal('95,5')).toBe(95.5)
    expect(parseDecimal(' 120 ')).toBe(120)
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('abc')).toBeNaN()
    expect(parseDecimal('-5')).toBeNaN()
  })
})

const validUnit: UnitFormValues = { ...emptyUnitForm, blockId: 'b1', doorNo: '12', floor: '3', grossM2: '95,5', landShare: '100' }
const unitErrors = (values: Partial<UnitFormValues>) => {
  const result = unitSchema.safeParse({ ...validUnit, ...values })
  return result.success ? {} : Object.fromEntries(result.error.issues.map((i) => [String(i.path[0]), i.message]))
}

describe('unitSchema and toUnitRow', () => {
  it('accepts a normal unit and builds the table row (comma decimals, empty -> null)', () => {
    expect(unitErrors({})).toEqual({})
    expect(toUnitRow(unitSchema.parse(validUnit))).toEqual({
      block_id: 'b1', door_no: '12', floor: 3, type: 'konut', gross_m2: 95.5, land_share: 100, status: 'occupied',
    })
    expect(toUnitRow(unitSchema.parse({ ...validUnit, floor: '', grossM2: '', landShare: '' }))).toMatchObject({
      floor: null, gross_m2: null, land_share: null,
    })
  })

  it('needs a block and a door number', () => {
    expect(unitErrors({ blockId: '' }).blockId).toBe('Bloğu seçin.')
    expect(unitErrors({ doorNo: '  ' }).doorNo).toBe('Kapı numarasını yazın.')
    expect(unitErrors({ doorNo: 'x'.repeat(21) }).doorNo).toMatch(/En fazla 20/)
  })

  it('allows basement floors but not nonsense', () => {
    expect(unitErrors({ floor: '-1' })).toEqual({})
    expect(unitErrors({ floor: '0' })).toEqual({})
    for (const bad of ['-11', '201', '1.5', 'abc']) expect(unitErrors({ floor: bad }).floor).toMatch(/Kat/)
  })

  it('checks sizes: positive, at most 2 decimals for m², at most 4 for arsa payı', () => {
    expect(unitErrors({ grossM2: '0' }).grossM2).toMatch(/Brüt m²/)
    expect(unitErrors({ grossM2: '-3' }).grossM2).toBeDefined()
    expect(unitErrors({ grossM2: '95.555' }).grossM2).toBeDefined()
    expect(unitErrors({ grossM2: '100000' }).grossM2).toBeDefined()
    expect(unitErrors({ landShare: '12.34567' }).landShare).toMatch(/Arsa payı/)
    expect(unitErrors({ landShare: '12.3456' })).toEqual({})
  })

  it('only knows the listed types and statuses', () => {
    expect(unitErrors({ type: 'villa' }).type).toBeDefined()
    expect(unitErrors({ status: 'x' }).status).toBeDefined()
  })
})

describe('blockSchema, bulkSchema', () => {
  it('needs a block name', () => {
    expect(blockSchema.safeParse({ name: 'A Blok' }).success).toBe(true)
    expect(blockSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(blockSchema.safeParse({ name: 'x'.repeat(101) }).success).toBe(false)
  })

  it('checks the bulk form fields', () => {
    const ok = { blockId: 'b1', floors: '10', perFloor: '4', startNumber: '1', startFloor: '1', type: 'konut', grossM2: '', landShare: '' }
    expect(bulkSchema.safeParse(ok).success).toBe(true)
    expect(bulkSchema.safeParse({ ...ok, floors: '0' }).success).toBe(false)
    expect(bulkSchema.safeParse({ ...ok, perFloor: '51' }).success).toBe(false)
    expect(bulkSchema.safeParse({ ...ok, blockId: '' }).success).toBe(false)
  })
})

describe('inviteSchema, residentContactSchema', () => {
  const ok = { fullName: 'Ahmet Yılmaz', email: 'ahmet@ornek.com', phone: '', unitId: 'u1', relation: 'owner', startDate: '' }

  it('accepts a normal invite (phone and date are optional)', () => {
    expect(inviteSchema.safeParse(ok).success).toBe(true)
    expect(inviteSchema.safeParse({ ...ok, phone: '0532 000 00 00', startDate: '2026-11-08' }).success).toBe(true)
  })

  it('rejects bad input', () => {
    expect(inviteSchema.safeParse({ ...ok, email: 'ahmet@' }).success).toBe(false)
    expect(inviteSchema.safeParse({ ...ok, fullName: 'A' }).success).toBe(false)
    expect(inviteSchema.safeParse({ ...ok, phone: 'abc' }).success).toBe(false)
    expect(inviteSchema.safeParse({ ...ok, unitId: '' }).success).toBe(false)
    expect(inviteSchema.safeParse({ ...ok, relation: 'admin' }).success).toBe(false)
    expect(inviteSchema.safeParse({ ...ok, startDate: '08.11.2026' }).success).toBe(false)
  })

  it('checks the contact form', () => {
    expect(residentContactSchema.safeParse({ fullName: 'Ayşe Kaya', phone: '' }).success).toBe(true)
    expect(residentContactSchema.safeParse({ fullName: 'A', phone: '' }).success).toBe(false)
    expect(residentContactSchema.safeParse({ fullName: 'Ayşe Kaya', phone: '12' }).success).toBe(false)
  })
})
