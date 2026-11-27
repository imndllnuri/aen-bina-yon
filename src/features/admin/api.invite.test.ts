import { FunctionsHttpError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inviteAdmin, inviteErrorMessage, inviteResident, requestAdminLink, requestSignInLink } from './api'

const client = vi.hoisted(() => ({ functions: { invoke: vi.fn() } }))
vi.mock('@/lib/supabase', () => ({ supabase: client }))
beforeEach(() => {
  client.functions.invoke.mockReset()
})

const httpError = (status: number, body: unknown) => new FunctionsHttpError(new Response(JSON.stringify(body), { status }))

describe('the calls to the invite function', () => {
  it('inviteResident sends the "invite" action with every field', async () => {
    client.functions.invoke.mockResolvedValue({ data: { ok: true, status: 'invited', profileId: 'p1', link: 'https://x.test/l' }, error: null })
    const input = { email: 'a@b.com', fullName: 'Ali', phone: '0532', unitId: 'u1', relation: 'owner' as const, startDate: '2026-01-01' }
    expect(await inviteResident(input)).toEqual({ ok: true, status: 'invited', profileId: 'p1', link: 'https://x.test/l' })
    expect(client.functions.invoke).toHaveBeenCalledWith('invite-resident', { body: { action: 'invite', ...input } })
  })
  it('requestSignInLink sends the "link" action', async () => {
    client.functions.invoke.mockResolvedValue({ data: { ok: true, status: 'link', profileId: 'p1', link: 'https://x.test/l' }, error: null })
    await requestSignInLink('p1')
    expect(client.functions.invoke).toHaveBeenCalledWith('invite-resident', { body: { action: 'link', profileId: 'p1' } })
  })
  it('inviteAdmin sends the "invite-admin" action with the site, never a unit or a role', async () => {
    client.functions.invoke.mockResolvedValue({ data: { ok: true, status: 'invited', profileId: 'p9', link: 'https://x.test/a' }, error: null })
    const input = { siteId: 's1', email: 'a@b.com', fullName: 'Berk Admin', phone: '' }
    expect(await inviteAdmin(input)).toMatchObject({ ok: true, status: 'invited' })
    expect(client.functions.invoke).toHaveBeenCalledWith('invite-resident', { body: { action: 'invite-admin', siteId: 's1', email: 'a@b.com', fullName: 'Berk Admin', phone: '' } })
  })
  it('requestAdminLink sends the "admin-link" action with the site and the person', async () => {
    client.functions.invoke.mockResolvedValue({ data: { ok: true, status: 'link', profileId: 'p9', link: 'https://x.test/a' }, error: null })
    await requestAdminLink('s1', 'p9')
    expect(client.functions.invoke).toHaveBeenCalledWith('invite-resident', { body: { action: 'admin-link', siteId: 's1', profileId: 'p9' } })
  })
  it('turns the JSON error of the function into { ok: false, error: <code> }', async () => {
    client.functions.invoke.mockResolvedValue({ data: null, error: httpError(409, { ok: false, error: 'already_linked' }) })
    expect(await inviteAdmin({ siteId: 's1', email: 'a@b.com', fullName: 'Berk', phone: '' })).toEqual({ ok: false, error: 'already_linked' })
  })
  it('says "failed" when the HTTP answer has no code', async () => {
    client.functions.invoke.mockResolvedValue({ data: null, error: httpError(500, 'not json') })
    expect(await requestAdminLink('s1', 'p9')).toEqual({ ok: false, error: 'failed' })
  })
  it('says "failed" when the error is not an HTTP answer', async () => {
    client.functions.invoke.mockResolvedValue({ data: null, error: new Error('network') })
    expect(await requestAdminLink('s1', 'p9')).toEqual({ ok: false, error: 'failed' })
  })
  it('says "failed" when the call itself throws (no network)', async () => {
    client.functions.invoke.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await requestAdminLink('s1', 'p9')).toEqual({ ok: false, error: 'failed' })
  })
  it('has the Turkish messages for the resident invite codes too', () => {
    expect(inviteErrorMessage('already_linked')).toMatch(/dairede zaten/)
    expect(inviteErrorMessage('zzz')).toMatch(/şu anda yapılamadı/)
  })
})
