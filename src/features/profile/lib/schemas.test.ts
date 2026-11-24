import { describe, expect, it } from 'vitest'
import { contactSchema, passwordChangeSchema } from './schemas'

const messages = (schema: typeof passwordChangeSchema | typeof contactSchema, value: unknown) => {
  const r = schema.safeParse(value)
  return r.success ? [] : r.error.issues.map((i) => i.message)
}

describe('contactSchema (the same rule as the admin uses for a resident)', () => {
  it('accepts a name with an empty or a normal phone', () => {
    expect(contactSchema.safeParse({ fullName: 'Ayşe Kaya', phone: '' }).success).toBe(true)
    expect(contactSchema.safeParse({ fullName: 'Ayşe Kaya', phone: '0532 000 00 00' }).success).toBe(true)
    expect(contactSchema.safeParse({ fullName: '  Ayşe Kaya  ', phone: '+90 532 000 00 00' }).success).toBe(true)
  })
  it('wants a name of 2 to 200 characters', () => {
    expect(messages(contactSchema, { fullName: '', phone: '' })).toEqual(['Ad soyad en az 2 karakter olmalı.'])
    expect(messages(contactSchema, { fullName: 'A', phone: '' })).toEqual(['Ad soyad en az 2 karakter olmalı.'])
    expect(messages(contactSchema, { fullName: '   ', phone: '' })).toEqual(['Ad soyad en az 2 karakter olmalı.'])
    expect(contactSchema.safeParse({ fullName: 'A'.repeat(200), phone: '' }).success).toBe(true)
    expect(messages(contactSchema, { fullName: 'A'.repeat(201), phone: '' })).toEqual(['En fazla 200 karakter yazabilirsiniz.'])
  })
  it('refuses a phone that is not a phone number', () => {
    for (const bad of ['abc', '12', '0532-abc', '<script>']) expect(contactSchema.safeParse({ fullName: 'Ayşe Kaya', phone: bad }).success).toBe(false)
  })
})

describe('passwordChangeSchema', () => {
  const ok = { current: 'eski-sifre-1', password: 'yeni-sifre-2', confirm: 'yeni-sifre-2' }
  it('accepts a good change', () => {
    expect(passwordChangeSchema.safeParse(ok).success).toBe(true)
  })
  it('wants the current password', () => {
    expect(messages(passwordChangeSchema, { ...ok, current: '' })).toEqual(['Mevcut şifrenizi yazın.'])
  })
  it('wants a new password of 8 to 72 bytes (Turkish letters take 2 bytes)', () => {
    expect(messages(passwordChangeSchema, { ...ok, password: 'kisa', confirm: 'kisa' })).toEqual(['Şifre en az 8 karakter olmalı.'])
    expect(passwordChangeSchema.safeParse({ ...ok, password: 'a'.repeat(72), confirm: 'a'.repeat(72) }).success).toBe(true)
    expect(messages(passwordChangeSchema, { ...ok, password: 'a'.repeat(73), confirm: 'a'.repeat(73) })).toEqual(['Şifre çok uzun. Daha kısa bir şifre seçin.'])
    expect(messages(passwordChangeSchema, { ...ok, password: 'ş'.repeat(37), confirm: 'ş'.repeat(37) })).toEqual(['Şifre çok uzun. Daha kısa bir şifre seçin.'])
  })
  it('wants the repeat to match', () => {
    expect(messages(passwordChangeSchema, { ...ok, confirm: 'baska-sifre-3' })).toEqual(['Şifreler aynı değil.'])
  })
  it('does not accept the old password as the new one', () => {
    expect(messages(passwordChangeSchema, { current: 'ayni-sifre-1', password: 'ayni-sifre-1', confirm: 'ayni-sifre-1' })).toEqual(['Yeni şifre, mevcut şifrenizle aynı olamaz.'])
  })
})
