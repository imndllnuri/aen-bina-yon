import { describe, expect, it } from 'vitest'
import { adminInviteSchema } from './schemas'

const messages = (value: unknown) => {
  const r = adminInviteSchema.safeParse(value)
  return r.success ? [] : r.error.issues.map((i) => i.message)
}
const ok = { fullName: 'Ayşe Admin', email: 'ayse@ornek.com', phone: '' }

describe('adminInviteSchema (the same three rules as the resident invite)', () => {
  it('accepts a name and an e-mail, with or without a phone', () => {
    expect(adminInviteSchema.safeParse(ok).success).toBe(true)
    expect(adminInviteSchema.safeParse({ ...ok, phone: '0532 000 00 00' }).success).toBe(true)
  })
  it('wants a name of 2 to 200 characters', () => {
    expect(messages({ ...ok, fullName: 'A' })).toEqual(['Ad soyad en az 2 karakter olmalı.'])
    expect(messages({ ...ok, fullName: 'A'.repeat(201) })).toEqual(['En fazla 200 karakter yazabilirsiniz.'])
  })
  it('wants a real e-mail', () => {
    expect(messages({ ...ok, email: 'abc' })).toEqual(['Geçerli bir e-posta adresi yazın.'])
    expect(messages({ ...ok, email: '' })).toEqual(['Geçerli bir e-posta adresi yazın.'])
  })
  it('refuses a phone that is not a phone number', () => {
    expect(messages({ ...ok, phone: 'abc' })).toEqual(['Geçerli bir telefon numarası yazın. Örnek: 0532 000 00 00'])
  })
  it('knows no unit or relation (an admin is not tied to a unit)', () => {
    expect(Object.keys(adminInviteSchema.shape).sort()).toEqual(['email', 'fullName', 'phone'])
  })
})
