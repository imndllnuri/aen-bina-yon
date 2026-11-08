import { describe, expect, it } from 'vitest'
import { emptyQuoteForm, quoteSchema, toQuoteRow, type QuoteFormValues } from './quote-schema'

const valid: QuoteFormValues = {
  ...emptyQuoteForm,
  name: 'Ahmet Yılmaz',
  phone: '0532 000 00 00',
  buildingType: 'apartman',
  unitCount: '16',
  il: 'Kayseri',
  kvkk: true,
}

/** Map of field name -> first error message. */
function errorsFor(values: Partial<QuoteFormValues>): Record<string, string> {
  const result = quoteSchema.safeParse({ ...valid, ...values })
  if (result.success) return {}
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0])
    if (!(key in errors)) errors[key] = issue.message
  }
  return errors
}

describe('quoteSchema', () => {
  it('accepts a form with a phone only, an e-mail only, or both', () => {
    expect(errorsFor({})).toEqual({})
    expect(errorsFor({ phone: '', email: 'ahmet@ornek.com' })).toEqual({})
    expect(errorsFor({ email: 'ahmet@ornek.com' })).toEqual({})
  })

  it('needs a phone or an e-mail (the table has the same rule)', () => {
    expect(errorsFor({ phone: '', email: '' }).phone).toBe('Telefon veya e-posta alanlarından en az birini doldurun.')
  })

  it('checks the phone number', () => {
    expect(errorsFor({ phone: '+90 (532) 000 00 00' })).toEqual({})
    expect(errorsFor({ phone: '532 000 00 00' })).toEqual({})
    expect(errorsFor({ phone: '12345' }).phone).toMatch(/Geçerli bir telefon/)
    expect(errorsFor({ phone: '0532 abc 00 00' }).phone).toMatch(/Geçerli bir telefon/)
    expect(errorsFor({ phone: '0'.repeat(14) }).phone).toMatch(/Geçerli bir telefon/)
  })

  it('checks the e-mail address', () => {
    expect(errorsFor({ email: 'ahmet@' }).email).toBe('Geçerli bir e-posta adresi yazın.')
    expect(errorsFor({ email: 'ahmet ornek.com' }).email).toBe('Geçerli bir e-posta adresi yazın.')
    expect(errorsFor({ email: `${'a'.repeat(200)}@ornek.com` }).email).toBe('Geçerli bir e-posta adresi yazın.')
  })

  it('keeps the unit count between 1 and 100.000', () => {
    for (const ok of ['1', '16', '100000']) expect(errorsFor({ unitCount: ok })).toEqual({})
    for (const bad of ['', '0', '100001', '12.5', '-3', 'abc', '1234567']) {
      expect(errorsFor({ unitCount: bad }).unitCount).toBe('1 ile 100.000 arasında bir sayı yazın.')
    }
  })

  it('needs one of the listed building types', () => {
    expect(errorsFor({ buildingType: '' }).buildingType).toBe('Lütfen yapı tipini seçin.')
    expect(errorsFor({ buildingType: 'kale' }).buildingType).toBe('Lütfen yapı tipini seçin.')
    for (const type of ['apartman', 'site', 'is_merkezi', 'diger']) expect(errorsFor({ buildingType: type })).toEqual({})
  })

  it('needs a real name (at least 2 letters after trimming spaces)', () => {
    expect(errorsFor({ name: '' }).name).toBe('Lütfen adınızı ve soyadınızı yazın.')
    expect(errorsFor({ name: '  A ' }).name).toBe('Lütfen adınızı ve soyadınızı yazın.')
    expect(errorsFor({ name: 'x'.repeat(121) }).name).toMatch(/En fazla 120/)
  })

  it('needs the KVKK notice to be ticked', () => {
    expect(errorsFor({ kvkk: false }).kvkk).toMatch(/aydınlatma metnini/)
  })

  it('limits the message to 2000 characters', () => {
    expect(errorsFor({ message: 'x'.repeat(2000) })).toEqual({})
    expect(errorsFor({ message: 'x'.repeat(2001) }).message).toMatch(/en fazla 2000/)
  })
})

describe('toQuoteRow', () => {
  it('trims text, turns empty optional fields into null and the unit count into a number', () => {
    const parsed = quoteSchema.parse({ ...valid, name: '  Ahmet Yılmaz  ', il: ' Kayseri ' })
    expect(toQuoteRow(parsed)).toEqual({
      name: 'Ahmet Yılmaz',
      phone: '0532 000 00 00',
      email: null,
      building_type: 'apartman',
      unit_count: 16,
      il: 'Kayseri',
      ilce: null,
      message: null,
    })
  })

  it('never sets columns that visitors may not write (id, status, created_at)', () => {
    const row = toQuoteRow(quoteSchema.parse(valid))
    expect(Object.keys(row).sort()).toEqual(
      ['building_type', 'email', 'il', 'ilce', 'message', 'name', 'phone', 'unit_count'].sort(),
    )
  })

  it('does not send the honeypot or the KVKK tick to the database', () => {
    const row = toQuoteRow(quoteSchema.parse({ ...valid, website: '' }))
    expect(row).not.toHaveProperty('website')
    expect(row).not.toHaveProperty('kvkk')
  })
})
