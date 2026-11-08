import { describe, expect, it } from 'vitest'
import { classifyAuthError } from './auth-api'
import { forgotSchema, loginSchema, newPasswordSchema } from './auth-schemas'

function firstErrors(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  const errors: Record<string, string> = {}
  for (const issue of result.error?.issues ?? []) {
    const key = String(issue.path[0])
    if (!(key in errors)) errors[key] = issue.message
  }
  return errors
}

describe('loginSchema', () => {
  it('accepts an e-mail and a password', () => {
    expect(loginSchema.safeParse({ email: ' kisi@ornek.com ', password: 'x', remember: true }).success).toBe(true)
  })

  it('asks for both fields', () => {
    const errors = firstErrors(loginSchema.safeParse({ email: '', password: '', remember: false }))
    expect(errors.email).toBe('E-posta adresinizi yazın.')
    expect(errors.password).toBe('Şifrenizi yazın.')
  })

  it('checks the e-mail shape', () => {
    expect(firstErrors(loginSchema.safeParse({ email: 'kisi@', password: 'x', remember: true })).email).toBe(
      'Geçerli bir e-posta adresi yazın.',
    )
  })
})

describe('forgotSchema', () => {
  it('needs a valid e-mail', () => {
    expect(forgotSchema.safeParse({ email: 'kisi@ornek.com' }).success).toBe(true)
    expect(firstErrors(forgotSchema.safeParse({ email: 'nope' })).email).toBe('Geçerli bir e-posta adresi yazın.')
  })
})

describe('newPasswordSchema', () => {
  const check = (password: string, confirm = password) => firstErrors(newPasswordSchema.safeParse({ password, confirm }))

  it('needs at least 8 characters (the same rule as the Supabase setting)', () => {
    expect(check('1234567').password).toBe('Şifre en az 8 karakter olmalı.')
    expect(check('12345678')).toEqual({})
  })

  it('needs the repeat to match', () => {
    expect(check('12345678', '12345679').confirm).toBe('Şifreler aynı değil.')
  })

  it('counts bytes, not letters: bcrypt only uses the first 72 bytes (ş takes 2 bytes)', () => {
    expect(check('ş'.repeat(36))).toEqual({}) // 72 bytes
    expect(check('ş'.repeat(37)).password).toBe('Şifre çok uzun. Daha kısa bir şifre seçin.') // 74 bytes
    expect(check('a'.repeat(72))).toEqual({})
    expect(check('a'.repeat(73)).password).toBeDefined()
  })
})

describe('classifyAuthError (Supabase error codes -> our reasons)', () => {
  it.each([
    [{ code: 'invalid_credentials' }, 'invalid-credentials'],
    [{ code: 'email_not_confirmed' }, 'email-not-confirmed'],
    [{ code: 'over_request_rate_limit' }, 'rate-limited'],
    [{ code: 'over_email_send_rate_limit' }, 'rate-limited'],
    [{ status: 429 }, 'rate-limited'],
    [{ code: 'weak_password' }, 'weak-password'],
    [{ code: 'same_password' }, 'same-password'],
    [{ code: 'user_banned' }, 'banned'],
    [{ code: 'session_not_found' }, 'no-session'],
    [{ name: 'AuthSessionMissingError' }, 'no-session'],
    [{ name: 'AuthRetryableFetchError', status: 0 }, 'failed'],
    [{}, 'failed'],
  ])('%j -> %s', (error, reason) => {
    expect(classifyAuthError(error)).toBe(reason)
  })
})
