import { describe, expect, it } from 'vitest'
import { contactSchema, emptyContactForm, toContactRow, type ContactFormValues } from './contact-schema'

const valid: ContactFormValues = { ...emptyContactForm, name: 'Ahmet Yılmaz', phone: '0532 000 00 00', message: 'Merhaba, bilgi almak istiyorum.', kvkk: true }

/** Map of field name -> first error message. */
function errorsFor(values: Partial<ContactFormValues>): Record<string, string> {
  const result = contactSchema.safeParse({ ...valid, ...values })
  if (result.success) return {}
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0])
    if (!(key in errors)) errors[key] = issue.message
  }
  return errors
}

describe('contactSchema (the limits of contact_messages)', () => {
  it('accepts a phone only, an e-mail only, or both', () => {
    expect(errorsFor({})).toEqual({})
    expect(errorsFor({ phone: '', email: 'ahmet@ornek.com' })).toEqual({})
    expect(errorsFor({ email: 'ahmet@ornek.com' })).toEqual({})
  })
  it('asks for a phone or an e-mail', () => {
    expect(errorsFor({ phone: '', email: '' })).toEqual({ phone: 'Telefon veya e-posta alanlarından en az birini doldurun.' })
  })
  it('wants a name of 2 to 120 characters', () => {
    expect(errorsFor({ name: '' }).name).toBe('Lütfen adınızı ve soyadınızı yazın.')
    expect(errorsFor({ name: 'A' }).name).toBe('Lütfen adınızı ve soyadınızı yazın.')
    expect(errorsFor({ name: '  A  ' }).name).toBe('Lütfen adınızı ve soyadınızı yazın.')
    expect(errorsFor({ name: 'Ab' })).toEqual({})
    expect(errorsFor({ name: 'A'.repeat(120) })).toEqual({})
    expect(errorsFor({ name: 'A'.repeat(121) }).name).toBe('En fazla 120 karakter yazabilirsiniz.')
  })
  it('wants a message of 5 to 2000 characters', () => {
    expect(errorsFor({ message: '' }).message).toBe('Lütfen mesajınızı yazın (en az 5 karakter).')
    expect(errorsFor({ message: 'Kısa' }).message).toBe('Lütfen mesajınızı yazın (en az 5 karakter).')
    expect(errorsFor({ message: '   abc   ' }).message).toBe('Lütfen mesajınızı yazın (en az 5 karakter).')
    expect(errorsFor({ message: 'Tamam.' })).toEqual({})
    expect(errorsFor({ message: 'x'.repeat(2000) })).toEqual({})
    expect(errorsFor({ message: 'x'.repeat(2001) }).message).toBe('Mesajınız en fazla 2000 karakter olabilir.')
  })
  it('uses the same phone and e-mail rules as the Teklif Al form', () => {
    expect(errorsFor({ phone: 'abc' }).phone).toBe('Geçerli bir telefon numarası yazın. Örnek: 0532 000 00 00')
    expect(errorsFor({ phone: '12345' }).phone).toBe('Geçerli bir telefon numarası yazın. Örnek: 0532 000 00 00')
    expect(errorsFor({ email: 'not-an-address' }).email).toBe('Geçerli bir e-posta adresi yazın.')
    expect(errorsFor({ email: `${'a'.repeat(188)}@example.com` })).toEqual({}) // 200 characters
    expect(errorsFor({ email: `${'a'.repeat(189)}@example.com` }).email).toBe('Geçerli bir e-posta adresi yazın.') // 201
  })
  it('wants the KVKK tick', () => {
    expect(errorsFor({ kvkk: false }).kvkk).toBe('Devam etmek için aydınlatma metnini okuduğunuzu onaylayın.')
  })
})

describe('toContactRow', () => {
  it('writes empty texts as null and sets only the four columns a visitor may write', () => {
    expect(toContactRow({ ...valid, email: '' })).toEqual({ name: 'Ahmet Yılmaz', phone: '0532 000 00 00', email: null, message: 'Merhaba, bilgi almak istiyorum.' })
    expect(toContactRow({ ...valid, phone: '', email: 'a@b.com' })).toEqual({ name: 'Ahmet Yılmaz', phone: null, email: 'a@b.com', message: 'Merhaba, bilgi almak istiyorum.' })
  })
  it('never sends the honeypot, the tick, the status or the time', () => {
    const row = toContactRow({ ...valid, website: 'spam' })
    expect(Object.keys(row).sort()).toEqual(['email', 'message', 'name', 'phone'])
  })
})
