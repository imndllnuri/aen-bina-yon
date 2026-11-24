import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, stubQuery } from '@/test/query-stub'
import { changeMyPassword, fetchMyProfile, saveMyContact, saveMyNotificationPrefs, signOutOtherSessions } from './api'

const client = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  auth: { signInWithPassword: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() },
}))
vi.mock('@/lib/supabase', () => ({ supabase: client }))

beforeEach(() => {
  client.from.mockReset()
  client.rpc.mockReset()
  client.auth.signInWithPassword.mockReset()
  client.auth.updateUser.mockReset()
  client.auth.signOut.mockReset()
})

describe('fetchMyProfile', () => {
  it('reads only the own row, with the fields the page shows', async () => {
    const q = stubQuery({ data: { full_name: 'Ayşe Kaya', phone: '0532', email: 'a@b.com', kvkk_consent_at: '2026-11-12T08:00:00Z', kvkk_consent_version: 'v1', notify_prefs: { email_finance: false, sms: true } } })
    client.from.mockReturnValue(q.query)
    expect(await fetchMyProfile('u1')).toEqual({
      fullName: 'Ayşe Kaya', phone: '0532', email: 'a@b.com', kvkkAt: '2026-11-12T08:00:00Z', kvkkVersion: 'v1', prefs: { email_finance: false },
    })
    expect(client.from).toHaveBeenCalledWith('profiles')
    expect(callsTo(q.calls, 'eq')).toEqual([['id', 'u1']])
    expect(String(callsTo(q.calls, 'select')[0]?.[0])).toBe('full_name, phone, email, kvkk_consent_at, kvkk_consent_version, notify_prefs')
  })
  it('throws when there is no row, or the database refuses', async () => {
    client.from.mockReturnValue(stubQuery({ data: null }).query)
    await expect(fetchMyProfile('u1')).rejects.toThrow('profile not found')
    client.from.mockReturnValue(stubQuery({ error: { code: '42501' } }).query)
    await expect(fetchMyProfile('u1')).rejects.toMatchObject({ code: '42501' })
  })
})

describe('saveMyContact', () => {
  it('trims, writes an empty phone as null, and touches only the own row', async () => {
    const q = stubQuery({ data: [{ id: 'u1' }] })
    client.from.mockReturnValue(q.query)
    await saveMyContact('u1', { fullName: '  Ayşe Kaya ', phone: '   ' })
    expect(callsTo(q.calls, 'update')).toEqual([[{ full_name: 'Ayşe Kaya', phone: null }]])
    expect(callsTo(q.calls, 'eq')).toEqual([['id', 'u1']])
  })
  it('writes a phone as typed (trimmed)', async () => {
    const q = stubQuery({ data: [{ id: 'u1' }] })
    client.from.mockReturnValue(q.query)
    await saveMyContact('u1', { fullName: 'Ayşe Kaya', phone: ' 0532 000 00 00 ' })
    expect(callsTo(q.calls, 'update')).toEqual([[{ full_name: 'Ayşe Kaya', phone: '0532 000 00 00' }]])
  })
  it('never sends the e-mail, the active flag or the choices', async () => {
    const q = stubQuery({ data: [{ id: 'u1' }] })
    client.from.mockReturnValue(q.query)
    await saveMyContact('u1', { fullName: 'Ayşe Kaya', phone: '' })
    expect(Object.keys((callsTo(q.calls, 'update')[0]?.[0] ?? {}) as object).sort()).toEqual(['full_name', 'phone'])
  })
  it('says "not allowed" when row security changed nothing, and throws what the database says', async () => {
    client.from.mockReturnValue(stubQuery({ data: [] }).query)
    await expect(saveMyContact('u1', { fullName: 'Ayşe Kaya', phone: '' })).rejects.toMatchObject({ code: '42501', message: 'not allowed' })
    client.from.mockReturnValue(stubQuery({ error: { code: '23514', message: 'check' } }).query)
    await expect(saveMyContact('u1', { fullName: 'Ayşe Kaya', phone: '' })).rejects.toMatchObject({ code: '23514' })
  })
})

describe('saveMyNotificationPrefs', () => {
  it('calls the checked function and returns the choices as stored (clean)', async () => {
    client.rpc.mockResolvedValue({ data: { email_finance: false, email_requests: true, junk: 1 }, error: null })
    expect(await saveMyNotificationPrefs({ email_finance: false, email_requests: true })).toEqual({ email_finance: false, email_requests: true })
    expect(client.rpc).toHaveBeenCalledWith('save_my_notification_prefs', { p_prefs: { email_finance: false, email_requests: true } })
  })
  it('throws what the database says', async () => {
    client.rpc.mockResolvedValue({ data: null, error: { message: 'prefs_invalid' } })
    await expect(saveMyNotificationPrefs({ email_finance: true })).rejects.toMatchObject({ message: 'prefs_invalid' })
  })
})

describe('changeMyPassword', () => {
  const ok = { error: null }
  it('checks the current password, saves the new one, then closes the other sessions (in this order)', async () => {
    const order: string[] = []
    client.auth.signInWithPassword.mockImplementation(async () => (order.push('check'), ok))
    client.auth.updateUser.mockImplementation(async () => (order.push('save'), ok))
    client.auth.signOut.mockImplementation(async () => (order.push('others'), ok))
    expect(await changeMyPassword('a@b.com', 'eski', 'yeni-sifre-1')).toEqual({ ok: true, othersClosed: true })
    expect(order).toEqual(['check', 'save', 'others'])
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'eski' })
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'yeni-sifre-1' })
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
  })
  it('stops at a wrong current password: nothing is saved and no session is closed', async () => {
    client.auth.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials' } })
    expect(await changeMyPassword('a@b.com', 'yanlis', 'yeni-sifre-1')).toEqual({ ok: false, reason: 'wrong-current' })
    expect(client.auth.updateUser).not.toHaveBeenCalled()
    expect(client.auth.signOut).not.toHaveBeenCalled()
  })
  it('passes other login problems through (they are not "wrong password")', async () => {
    client.auth.signInWithPassword.mockResolvedValue({ error: { code: 'over_request_rate_limit' } })
    expect(await changeMyPassword('a@b.com', 'eski', 'yeni-sifre-1')).toEqual({ ok: false, reason: 'rate-limited' })
    client.auth.signInWithPassword.mockResolvedValue({ error: { code: 'user_banned' } })
    expect(await changeMyPassword('a@b.com', 'eski', 'yeni-sifre-1')).toEqual({ ok: false, reason: 'banned' })
    expect(client.auth.updateUser).not.toHaveBeenCalled()
  })
  it('reports a refused new password and does not close the other sessions', async () => {
    client.auth.signInWithPassword.mockResolvedValue(ok)
    client.auth.updateUser.mockResolvedValue({ error: { code: 'weak_password' } })
    expect(await changeMyPassword('a@b.com', 'eski', 'yeni-sifre-1')).toEqual({ ok: false, reason: 'weak-password' })
    expect(client.auth.signOut).not.toHaveBeenCalled()
  })
  it('says the password changed even when closing the other sessions failed', async () => {
    client.auth.signInWithPassword.mockResolvedValue(ok)
    client.auth.updateUser.mockResolvedValue(ok)
    client.auth.signOut.mockResolvedValue({ error: { code: 'unexpected_failure' } })
    expect(await changeMyPassword('a@b.com', 'eski', 'yeni-sifre-1')).toEqual({ ok: true, othersClosed: false })
    client.auth.signOut.mockRejectedValue(new Error('network'))
    expect(await changeMyPassword('a@b.com', 'eski', 'yeni-sifre-1')).toEqual({ ok: true, othersClosed: false })
  })
})

describe('signOutOtherSessions', () => {
  it('closes the sessions of the other devices only', async () => {
    client.auth.signOut.mockResolvedValue({ error: null })
    expect(await signOutOtherSessions()).toEqual({ ok: true })
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
  })
  it('says no when it did not work', async () => {
    client.auth.signOut.mockResolvedValue({ error: { code: 'x' } })
    expect(await signOutOtherSessions()).toEqual({ ok: false })
    client.auth.signOut.mockRejectedValue(new Error('network'))
    expect(await signOutOtherSessions()).toEqual({ ok: false })
  })
})
