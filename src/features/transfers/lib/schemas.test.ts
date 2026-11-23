import { describe, expect, it } from 'vitest'
import { lineLabel, shiftDate } from './lines'
import { bankAccountsSchema, manualPaymentSchema, noticeSchema, PAYER_OTHER } from './schemas'

const TODAY = '2026-11-23'
const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) => (result.error?.issues ?? []).map((i) => i.message)

describe('shiftDate and lineLabel', () => {
  it('moves a date by days without any time zone surprise', () => {
    expect(shiftDate('2026-11-23', -90)).toBe('2026-08-25')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('names a line by its type and month (and description)', () => {
    expect(lineLabel({ typeName: 'Aidat', description: null, period: '2026-11-01', dueDate: '2026-11-15' })).toBe('Aidat · Kasım 2026')
    expect(lineLabel({ typeName: null, description: 'Asansör', period: null, dueDate: '2026-11-15' })).toBe('Borç · 15.11.2026 · Asansör')
  })
})

describe('notice form', () => {
  const good = { amount: '1.500,50', sentOn: '2026-11-20', senderName: 'Ayşe Kaya', note: '' }
  const schema = noticeSchema(TODAY)

  it('accepts a normal notice', () => {
    expect(schema.safeParse(good).success).toBe(true)
  })
  it('wants at least 1 TL, and says exactly what is wrong with an amount', () => {
    expect(messages(schema.safeParse({ ...good, amount: '0,50' }))).toEqual(['En az 1 ₺ yazın.'])
    expect(messages(schema.safeParse({ ...good, amount: '1.5' }))).toEqual(['Binler için nokta, kuruş için virgül kullanın. Örnek: 1.500,50'])
    expect(messages(schema.safeParse({ ...good, amount: '' }))).toEqual(['Tutarı yazın.'])
    expect(schema.safeParse({ ...good, amount: '1' }).success).toBe(true)
  })
  it('allows today and 90 days back, but not tomorrow or 91 days back', () => {
    expect(schema.safeParse({ ...good, sentOn: TODAY }).success).toBe(true)
    expect(schema.safeParse({ ...good, sentOn: shiftDate(TODAY, -90) }).success).toBe(true)
    expect(messages(schema.safeParse({ ...good, sentOn: shiftDate(TODAY, 1) }))).toEqual(['Gelecekteki bir tarih seçilemez.'])
    expect(messages(schema.safeParse({ ...good, sentOn: shiftDate(TODAY, -91) }))).toEqual(['Dekont tarihi en fazla 90 gün öncesi olabilir.'])
    expect(schema.safeParse({ ...good, sentOn: '2026-02-30' }).success).toBe(false)
    expect(schema.safeParse({ ...good, sentOn: '' }).success).toBe(false)
  })
  it('needs the name on the slip and limits the note to 300 characters', () => {
    expect(schema.safeParse({ ...good, senderName: ' A ' }).success).toBe(false)
    expect(schema.safeParse({ ...good, senderName: 'x'.repeat(101) }).success).toBe(false)
    expect(schema.safeParse({ ...good, note: 'x'.repeat(300) }).success).toBe(true)
    expect(schema.safeParse({ ...good, note: 'x'.repeat(301) }).success).toBe(false)
  })
})

describe('manual payment form', () => {
  const good = { unitId: 'u1', payer: 'p1', payerName: '', method: 'cash', amount: '150', paidOn: TODAY, note: '' }
  const schema = manualPaymentSchema(TODAY)

  it('accepts a payment by a resident, and one by "somebody else" with a name', () => {
    expect(schema.safeParse(good).success).toBe(true)
    expect(schema.safeParse({ ...good, payer: PAYER_OTHER, payerName: 'Ali Veli' }).success).toBe(true)
  })
  it('needs the name when the payer is somebody else, and a payer at all', () => {
    const noName = schema.safeParse({ ...good, payer: PAYER_OTHER, payerName: '' })
    expect(noName.error?.issues[0].path).toEqual(['payerName'])
    expect(schema.safeParse({ ...good, payer: '' }).success).toBe(false)
    expect(schema.safeParse({ ...good, unitId: '' }).success).toBe(false)
  })
  it('knows three methods only', () => {
    for (const method of ['cash', 'pos', 'havale']) expect(schema.safeParse({ ...good, method }).success, method).toBe(true)
    expect(schema.safeParse({ ...good, method: 'card' }).success).toBe(false)
    expect(schema.safeParse({ ...good, method: 'bitcoin' }).success).toBe(false)
  })
  it('allows an amount below 1 TL (a few kuruş left on a line) but not zero', () => {
    expect(schema.safeParse({ ...good, amount: '0,33' }).success).toBe(true)
    expect(schema.safeParse({ ...good, amount: '0' }).success).toBe(false)
  })
  it('allows a date from one year back to today', () => {
    expect(schema.safeParse({ ...good, paidOn: shiftDate(TODAY, -365) }).success).toBe(true)
    expect(schema.safeParse({ ...good, paidOn: shiftDate(TODAY, -366) }).success).toBe(false)
    expect(schema.safeParse({ ...good, paidOn: shiftDate(TODAY, 1) }).success).toBe(false)
  })
})

describe('bank accounts form', () => {
  const a = { bank: 'Örnek Banka', holder: 'Site Yönetimi', iban: 'TR33 0006 1005 1978 6457 8413 26' }
  const b = { bank: 'İkinci Banka', holder: 'Site Yönetimi', iban: 'TR820006200000012345678901' }

  it('accepts up to five different valid accounts, and none', () => {
    expect(bankAccountsSchema.safeParse({ accounts: [a, b] }).success).toBe(true)
    expect(bankAccountsSchema.safeParse({ accounts: [] }).success).toBe(true)
  })
  it('refuses a wrong IBAN, a missing bank, and more than five accounts', () => {
    expect(bankAccountsSchema.safeParse({ accounts: [{ ...a, iban: 'TR34 0006 1005 1978 6457 8413 26' }] }).success).toBe(false)
    expect(bankAccountsSchema.safeParse({ accounts: [{ ...a, bank: '' }] }).success).toBe(false)
    const six = Array.from({ length: 6 }, (_, i) => ({ ...b, bank: `Banka ${i}`, iban: i % 2 ? a.iban : b.iban }))
    expect(bankAccountsSchema.safeParse({ accounts: six }).success).toBe(false)
  })
  it('refuses the same IBAN twice, even when it is written differently', () => {
    const result = bankAccountsSchema.safeParse({ accounts: [a, { ...b, iban: 'tr330006100519786457841326' }] })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['accounts', 1, 'iban'])
  })
})
