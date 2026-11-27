import { describe, expect, it } from 'vitest'
import { adminInviteMessage, adminInviteMessages, adminsErrorMessage } from './messages'

describe('adminInviteMessage (the answers of the invite function)', () => {
  it('has its own Turkish sentence for every code the function can answer with', () => {
    const codes = ['forbidden', 'already_linked', 'email_in_use_elsewhere', 'account_inactive', 'already_active', 'invalid_request', 'origin_not_allowed']
    const messages = codes.map(adminInviteMessage)
    expect(new Set(messages).size).toBe(codes.length)
    for (const m of messages) expect(m).not.toMatch(/_/)
    expect(Object.keys(adminInviteMessages)).toContain('failed')
  })
  it('says that another company\'s account cannot be used', () => {
    expect(adminInviteMessage('email_in_use_elsewhere')).toMatch(/başka bir firmanın hesabında kullanılıyor/)
  })
  it('says "already an admin" for already_linked (not "already in this unit")', () => {
    expect(adminInviteMessage('already_linked')).toBe('Bu kişi zaten bu sitenin yöneticisi.')
  })
  it('is calm for a code it does not know', () => {
    expect(adminInviteMessage('zzz')).toMatch(/şu anda yapılamadı/)
    expect(adminInviteMessage('failed')).toMatch(/şu anda yapılamadı/)
  })
})

describe('adminsErrorMessage (the answers of the database)', () => {
  it('explains "you cannot remove yourself" and "not an admin"', () => {
    expect(adminsErrorMessage({ message: 'cannot_remove_self' })).toMatch(/Kendinizi yönetici listesinden çıkaramazsınız/)
    expect(adminsErrorMessage({ message: 'not_admin' })).toMatch(/yöneticisi değil/)
  })
  it('says "no permission" for a refusal, and something calm for anything else', () => {
    expect(adminsErrorMessage({ code: '42501' })).toBe('Bu işlem için yetkiniz yok.')
    expect(adminsErrorMessage({ message: 'not allowed' })).toBe('Bu işlem için yetkiniz yok.')
    for (const odd of [null, undefined, {}, { message: 'boom' }]) expect(adminsErrorMessage(odd)).toMatch(/şu anda yapılamadı/)
  })
})
