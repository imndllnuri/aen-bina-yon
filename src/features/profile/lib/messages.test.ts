import { describe, expect, it } from 'vitest'
import { authMessages } from '@/features/auth/auth-api'
import { passwordChangeMessage, profileErrorMessage } from './messages'

describe('profileErrorMessage', () => {
  it('says "no permission" for a refusal, and something calm for anything else', () => {
    expect(profileErrorMessage({ code: '42501' })).toMatch(/yetkiniz yok/)
    expect(profileErrorMessage({ message: 'not allowed' })).toMatch(/yetkiniz yok/)
    expect(profileErrorMessage({ code: '23514' })).toMatch(/geçersiz/)
    for (const odd of [null, undefined, {}, { message: 'boom' }, { message: 'prefs_invalid' }]) expect(profileErrorMessage(odd)).toMatch(/şu anda yapılamadı/)
  })
})

describe('passwordChangeMessage', () => {
  it('has its own sentence for a wrong current password', () => {
    expect(passwordChangeMessage('wrong-current')).toBe('Mevcut şifre hatalı.')
  })
  it('uses the shared login messages for everything else', () => {
    expect(passwordChangeMessage('rate-limited')).toBe(authMessages['rate-limited'])
    expect(passwordChangeMessage('weak-password')).toBe(authMessages['weak-password'])
    expect(passwordChangeMessage('same-password')).toBe(authMessages['same-password'])
    expect(passwordChangeMessage('failed')).toBe(authMessages.failed)
  })
})
