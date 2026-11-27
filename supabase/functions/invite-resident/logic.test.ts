import { describe, expect, it } from 'vitest'
import {
  corsHeadersFor,
  decideAdminLink,
  decideLink,
  errorCodeForRpc,
  inviteRedirectFor,
  linkTypeFor,
  normalizeEmail,
  parseRequest,
  STATUS_FOR,
  type ErrorCode,
} from './logic'

const UNIT = '40000000-0000-0000-0000-000000000001'
const PROFILE = 'B1000000-0000-0000-0000-000000000001'

const validInvite = {
  action: 'invite',
  email: '  Ahmet@Ornek.COM ',
  fullName: ' Ahmet Yılmaz ',
  phone: '0532 000 00 00',
  unitId: UNIT,
  relation: 'owner',
  startDate: '2026-11-08',
}

describe('parseRequest: invite', () => {
  it('accepts a valid invite and cleans it up', () => {
    expect(parseRequest(validInvite)).toEqual({
      ok: true,
      value: {
        action: 'invite',
        email: 'ahmet@ornek.com',
        fullName: 'Ahmet Yılmaz',
        phone: '0532 000 00 00',
        unitId: UNIT,
        relation: 'owner',
        startDate: '2026-11-08',
      },
    })
  })

  it('treats phone and start date as optional', () => {
    const result = parseRequest({ ...validInvite, phone: '', startDate: undefined })
    expect(result).toMatchObject({ ok: true, value: { phone: null, startDate: null } })
  })

  it.each([
    ['not an object', 'text'],
    ['an array', []],
    ['null', null],
    ['unknown action', { ...validInvite, action: 'delete-everything' }],
    ['no action', { ...validInvite, action: undefined }],
    ['bad e-mail', { ...validInvite, email: 'ahmet@' }],
    ['e-mail with spaces inside', { ...validInvite, email: 'a b@ornek.com' }],
    ['e-mail too long', { ...validInvite, email: `${'a'.repeat(200)}@ornek.com` }],
    ['name too short', { ...validInvite, fullName: 'A' }],
    ['name too long', { ...validInvite, fullName: 'x'.repeat(201) }],
    ['bad phone', { ...validInvite, phone: 'abc' }],
    ['unit id that is not a uuid', { ...validInvite, unitId: '1; drop table units' }],
    ['relation other than owner or tenant', { ...validInvite, relation: 'admin' }],
    ['no relation', { ...validInvite, relation: undefined }],
    ['date in the wrong format', { ...validInvite, startDate: '08.11.2026' }],
    ['a date that does not exist', { ...validInvite, startDate: '2026-02-31' }],
  ])('rejects %s', (_name, body) => {
    expect(parseRequest(body)).toMatchObject({ ok: false })
  })

  it('does not trust a site id or any extra field sent by the browser', () => {
    const result = parseRequest({ ...validInvite, siteId: 'someone-elses-site', role: 'admin' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(Object.keys(result.value).sort()).toEqual(['action', 'email', 'fullName', 'phone', 'relation', 'startDate', 'unitId'])
  })
})

describe('parseRequest: link', () => {
  it('accepts a profile id (any letter case)', () => {
    expect(parseRequest({ action: 'link', profileId: PROFILE })).toEqual({
      ok: true,
      value: { action: 'link', profileId: PROFILE.toLowerCase() },
    })
  })

  it('rejects a missing or malformed profile id', () => {
    expect(parseRequest({ action: 'link' })).toMatchObject({ ok: false })
    expect(parseRequest({ action: 'link', profileId: 'x' })).toMatchObject({ ok: false })
    expect(parseRequest({ action: 'link', profileId: `${PROFILE}'--` })).toMatchObject({ ok: false })
  })
})

const SITE = '20000000-0000-0000-0000-0000000000A1'

describe('parseRequest: invite-admin', () => {
  const valid = { action: 'invite-admin', email: '  Berk@Ornek.COM ', fullName: ' Berk Yılmaz ', phone: '0532 000 00 00', siteId: SITE }
  it('accepts a valid admin invite and cleans it up (e-mail lower case, name trimmed, site id lower case)', () => {
    expect(parseRequest(valid)).toEqual({
      ok: true,
      value: { action: 'invite-admin', email: 'berk@ornek.com', fullName: 'Berk Yılmaz', phone: '0532 000 00 00', siteId: SITE.toLowerCase() },
    })
  })
  it('treats the phone as optional', () => {
    expect(parseRequest({ ...valid, phone: '' })).toMatchObject({ ok: true, value: { phone: null } })
    const withoutPhone: Record<string, unknown> = { ...valid }
    delete withoutPhone.phone
    expect(parseRequest(withoutPhone)).toMatchObject({ ok: true, value: { phone: null } })
  })
  it('rejects a bad e-mail, a short or long name, a bad phone and a missing or malformed site id', () => {
    expect(parseRequest({ ...valid, email: 'not-an-address' })).toMatchObject({ ok: false })
    expect(parseRequest({ ...valid, email: `${'a'.repeat(200)}@b.com` })).toMatchObject({ ok: false })
    expect(parseRequest({ ...valid, fullName: 'A' })).toMatchObject({ ok: false })
    expect(parseRequest({ ...valid, fullName: 'A'.repeat(201) })).toMatchObject({ ok: false })
    expect(parseRequest({ ...valid, phone: 'abc' })).toMatchObject({ ok: false })
    expect(parseRequest({ ...valid, siteId: undefined })).toMatchObject({ ok: false })
    expect(parseRequest({ ...valid, siteId: 'x' })).toMatchObject({ ok: false })
    expect(parseRequest({ ...valid, siteId: `${SITE}'--` })).toMatchObject({ ok: false })
  })
  it('does not trust extra fields (a role or a person id sent by the browser is dropped)', () => {
    const parsed = parseRequest({ ...valid, role: 'owner', profileId: PROFILE, unitId: UNIT })
    expect(parsed).toMatchObject({ ok: true })
    if (parsed.ok) expect(Object.keys(parsed.value).sort()).toEqual(['action', 'email', 'fullName', 'phone', 'siteId'])
  })
})

describe('parseRequest: admin-link', () => {
  it('accepts a site id and a profile id (any letter case)', () => {
    expect(parseRequest({ action: 'admin-link', siteId: SITE, profileId: PROFILE })).toEqual({
      ok: true,
      value: { action: 'admin-link', siteId: SITE.toLowerCase(), profileId: PROFILE.toLowerCase() },
    })
  })
  it('rejects a missing or malformed id', () => {
    expect(parseRequest({ action: 'admin-link', profileId: PROFILE })).toMatchObject({ ok: false })
    expect(parseRequest({ action: 'admin-link', siteId: SITE })).toMatchObject({ ok: false })
    expect(parseRequest({ action: 'admin-link', siteId: 'x', profileId: PROFILE })).toMatchObject({ ok: false })
    expect(parseRequest({ action: 'admin-link', siteId: SITE, profileId: 'x' })).toMatchObject({ ok: false })
  })
})

describe('decideAdminLink: a pending admin may get a fresh link from an admin of the same site', () => {
  const pendingAdmin = { isCaller: false, isActive: true, isAdminOfThisSite: true, kvkkConsentAt: null }
  it('allows an active admin of this site who has not finished the invite page', () => {
    expect(decideAdminLink(pendingAdmin)).toEqual({ allowed: true })
  })
  it('never gives a link for the admin themselves', () => {
    expect(decideAdminLink({ ...pendingAdmin, isCaller: true })).toEqual({ allowed: false, reason: 'self' })
  })
  it('never gives a link for a deactivated person', () => {
    expect(decideAdminLink({ ...pendingAdmin, isActive: false })).toEqual({ allowed: false, reason: 'inactive' })
  })
  it('never gives a link for someone who is no admin of THIS site (a resident, or an admin of another site)', () => {
    expect(decideAdminLink({ ...pendingAdmin, isAdminOfThisSite: false })).toEqual({ allowed: false, reason: 'not_admin' })
  })
  it('never gives a link for someone who finished onboarding (they reset by e-mail)', () => {
    expect(decideAdminLink({ ...pendingAdmin, kvkkConsentAt: '2026-11-08T10:00:00Z' })).toEqual({ allowed: false, reason: 'already_active' })
  })
  it('checks "self" first, then "inactive", then "not an admin", then "already active"', () => {
    expect(decideAdminLink({ isCaller: true, isActive: false, isAdminOfThisSite: false, kvkkConsentAt: 'x' })).toMatchObject({ reason: 'self' })
    expect(decideAdminLink({ isCaller: false, isActive: false, isAdminOfThisSite: false, kvkkConsentAt: 'x' })).toMatchObject({ reason: 'inactive' })
    expect(decideAdminLink({ isCaller: false, isActive: true, isAdminOfThisSite: false, kvkkConsentAt: 'x' })).toMatchObject({ reason: 'not_admin' })
  })
})

describe('errorCodeForRpc: what the answer of add_site_admin means', () => {
  it('turns "not allowed" (42501) into forbidden', () => {
    expect(errorCodeForRpc({ code: '42501', message: 'not allowed' })).toBe('forbidden')
  })
  it('tells every reason a person cannot be made admin in the same way (nothing is revealed)', () => {
    expect(errorCodeForRpc({ code: 'P0001', message: 'person_not_found' })).toBe('email_in_use_elsewhere')
  })
  it('turns "already_member" into already_linked', () => {
    expect(errorCodeForRpc({ code: 'P0001', message: 'already_member' })).toBe('already_linked')
  })
  it('turns anything else, or nothing, into failed', () => {
    for (const odd of [null, undefined, {}, { message: 'boom' }, { code: '23505' }]) expect(errorCodeForRpc(odd)).toBe('failed')
  })
})

describe('normalizeEmail', () => {
  it('lower-cases and trims, like Supabase does', () => {
    expect(normalizeEmail('  Ahmet@Ornek.COM ')).toBe('ahmet@ornek.com')
  })
})

describe('CORS and redirect address (only the two known sites)', () => {
  it('allows the live site and the local dev site', () => {
    expect(corsHeadersFor('https://imndllnuri.github.io')['Access-Control-Allow-Origin']).toBe('https://imndllnuri.github.io')
    expect(corsHeadersFor('http://localhost:5173')['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
  })

  it.each(['https://evil.example', 'http://localhost:5174', 'https://imndllnuri.github.io.evil.example', 'http://imndllnuri.github.io', null])(
    'gives %s no allow-origin header',
    (origin) => {
      expect(corsHeadersFor(origin)).not.toHaveProperty('Access-Control-Allow-Origin')
    },
  )

  it('varies by origin so caches do not mix answers', () => {
    expect(corsHeadersFor('http://localhost:5173').Vary).toBe('Origin')
  })

  it('builds the invite link target from the allowed origin only', () => {
    expect(inviteRedirectFor('https://imndllnuri.github.io')).toBe('https://imndllnuri.github.io/aen-bina-yon/?flow=invite')
    expect(inviteRedirectFor('http://localhost:5173')).toBe('http://localhost:5173/aen-bina-yon/?flow=invite')
    expect(inviteRedirectFor('https://evil.example')).toBeNull()
    expect(inviteRedirectFor(null)).toBeNull()
  })
})

describe('decideLink: who may get a sign-in link (impersonation guard)', () => {
  const pendingResident = { isCaller: false, isActive: true, hasSiteMembership: false, kvkkConsentAt: null }

  it('allows a plain resident who has not finished the invite page', () => {
    expect(decideLink(pendingResident)).toEqual({ allowed: true })
  })

  it('never gives a link for the admin themselves', () => {
    expect(decideLink({ ...pendingResident, isCaller: true })).toEqual({ allowed: false, reason: 'self' })
  })

  it('never gives a link for a deactivated person', () => {
    expect(decideLink({ ...pendingResident, isActive: false })).toEqual({ allowed: false, reason: 'inactive' })
  })

  it('never gives a link for an admin, auditor or staff member (of any site)', () => {
    expect(decideLink({ ...pendingResident, hasSiteMembership: true })).toEqual({ allowed: false, reason: 'staff' })
  })

  it('never gives a link for someone who finished onboarding (they reset by e-mail)', () => {
    expect(decideLink({ ...pendingResident, kvkkConsentAt: '2026-11-08T10:00:00Z' })).toEqual({
      allowed: false,
      reason: 'already_active',
    })
  })

  it('checks "self" before anything else, even for a pending resident', () => {
    expect(decideLink({ isCaller: true, isActive: false, hasSiteMembership: true, kvkkConsentAt: 'x' })).toMatchObject({ reason: 'self' })
  })
})

describe('linkTypeFor', () => {
  it('uses an invite link until the invite was clicked, then a recovery link', () => {
    expect(linkTypeFor(false)).toBe('invite')
    expect(linkTypeFor(true)).toBe('recovery')
  })
})

describe('STATUS_FOR', () => {
  it('has a sensible HTTP status for every error code', () => {
    const codes: ErrorCode[] = [
      'invalid_request', 'origin_not_allowed', 'forbidden', 'unit_not_found', 'already_linked',
      'email_in_use_elsewhere', 'account_inactive', 'already_active', 'failed',
    ]
    for (const code of codes) expect(STATUS_FOR[code]).toBeGreaterThanOrEqual(400)
    expect(Object.keys(STATUS_FOR).sort()).toEqual([...codes].sort())
    expect(STATUS_FOR.forbidden).toBe(403)
    expect(STATUS_FOR.already_linked).toBe(409)
  })
})
