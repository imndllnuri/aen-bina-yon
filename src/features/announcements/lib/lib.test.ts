import { describe, expect, it } from 'vitest'
import { announcementErrorMessage } from './messages'
import { announcementSchema, buildTarget, type AnnouncementValues } from './schemas'
import { announcementState, isArchived, STATE_LABEL, typeLabel, typeVariant } from './state'
import { isoToIstanbulLocal, istanbulLocalToIso } from './time'

describe('Istanbul time for the date fields', () => {
  it('reads a datetime-local value as Istanbul time (+03:00), whatever the device clock says', () => {
    expect(istanbulLocalToIso('2026-11-25T14:30')).toBe('2026-11-25T14:30:00+03:00')
    expect(new Date(istanbulLocalToIso('2026-11-25T00:00')!).toISOString()).toBe('2026-11-24T21:00:00.000Z')
  })
  it('refuses an empty, a half and an impossible value', () => {
    expect(istanbulLocalToIso('')).toBeNull()
    expect(istanbulLocalToIso('2026-11-25')).toBeNull()
    expect(istanbulLocalToIso('2026-02-30T10:00')).toBeNull()
    expect(istanbulLocalToIso('2026-13-01T10:00')).toBeNull()
    expect(istanbulLocalToIso('2026-11-25T25:00')).toBeNull()
  })
  it('turns a timestamp back into the value for the field, in Istanbul time', () => {
    expect(isoToIstanbulLocal('2026-11-24T21:00:00Z')).toBe('2026-11-25T00:00')
    expect(isoToIstanbulLocal('2026-11-25T14:30:00+03:00')).toBe('2026-11-25T14:30')
    expect(isoToIstanbulLocal(null)).toBe('')
    expect(isoToIstanbulLocal('garbage')).toBe('')
  })
  it('round-trips', () => {
    for (const v of ['2026-01-01T00:00', '2026-12-31T23:59', '2027-06-15T09:05']) expect(isoToIstanbulLocal(istanbulLocalToIso(v)!)).toBe(v)
  })
})

describe('announcement state', () => {
  const now = new Date('2026-11-23T12:00:00Z')
  it('names the four states the admin sees', () => {
    expect(announcementState({ status: 'draft', publishAt: null, expireAt: null }, now)).toBe('draft')
    expect(announcementState({ status: 'published', publishAt: '2026-11-24T00:00:00Z', expireAt: null }, now)).toBe('scheduled')
    expect(announcementState({ status: 'published', publishAt: null, expireAt: null }, now)).toBe('live')
    expect(announcementState({ status: 'published', publishAt: '2026-11-20T00:00:00Z', expireAt: '2026-11-30T00:00:00Z' }, now)).toBe('live')
    expect(announcementState({ status: 'published', publishAt: null, expireAt: '2026-11-22T00:00:00Z' }, now)).toBe('expired')
  })
  it('a draft is a draft even when its dates say otherwise', () => {
    expect(announcementState({ status: 'draft', publishAt: '2020-01-01T00:00:00Z', expireAt: '2020-02-01T00:00:00Z' }, now)).toBe('draft')
  })
  it('the end time is the archive line (exactly at the end time it is archived)', () => {
    expect(isArchived({ expireAt: null }, now)).toBe(false)
    expect(isArchived({ expireAt: '2026-11-23T12:00:00Z' }, now)).toBe(true)
    expect(isArchived({ expireAt: '2026-11-23T12:00:01Z' }, now)).toBe(false)
  })
  it('has Turkish words for the states and the types, and a safe fallback', () => {
    expect(Object.values(STATE_LABEL)).toEqual(['Taslak', 'Planlandı', 'Yayında', 'Süresi doldu'])
    expect(typeLabel('acil')).toBe('Acil')
    expect(typeLabel('whatever')).toBe('Genel')
    expect(typeVariant('acil')).toBe('destructive')
    expect(typeVariant('whatever')).toBe('secondary')
  })
})

describe('compose form', () => {
  const good: AnnouncementValues = { title: 'Su kesintisi', body: 'Yarın 10-12 arası.', type: 'bakim', pinned: false, scope: 'site', audience: 'all', blockIds: [], unitIds: [], profileIds: [], publishAt: '', expireAt: '' }
  const messages = (v: AnnouncementValues) => (announcementSchema.safeParse(v).error?.issues ?? []).map((i) => i.message)

  it('accepts a normal announcement', () => {
    expect(announcementSchema.safeParse(good).success).toBe(true)
  })
  it('wants a title of 3 to 120 characters and a text of 1 to 5000', () => {
    expect(announcementSchema.safeParse({ ...good, title: 'ab' }).success).toBe(false)
    expect(announcementSchema.safeParse({ ...good, title: 'x'.repeat(121) }).success).toBe(false)
    expect(announcementSchema.safeParse({ ...good, title: '  ab  ' }).success).toBe(false)
    expect(announcementSchema.safeParse({ ...good, body: '   ' }).success).toBe(false)
    expect(announcementSchema.safeParse({ ...good, body: 'x'.repeat(5000) }).success).toBe(true)
    expect(announcementSchema.safeParse({ ...good, body: 'x'.repeat(5001) }).success).toBe(false)
  })
  it('wants something picked for blocks, units and persons', () => {
    expect(messages({ ...good, scope: 'blocks' })).toEqual(['En az bir blok seçin.'])
    expect(messages({ ...good, scope: 'units' })).toEqual(['En az bir daire seçin.'])
    expect(messages({ ...good, scope: 'persons' })).toEqual(['En az bir kişi seçin.'])
    expect(announcementSchema.safeParse({ ...good, scope: 'blocks', blockIds: ['b1'] }).success).toBe(true)
  })
  it('checks the dates: real values, and the end after the start', () => {
    expect(messages({ ...good, publishAt: '2026-02-30T10:00' })).toEqual(['Başlangıç: geçerli bir tarih ve saat seçin.'])
    expect(messages({ ...good, publishAt: '2026-12-01T10:00', expireAt: '2026-12-01T09:00' })).toEqual(['Bitiş, başlangıçtan sonra olmalı.'])
    expect(messages({ ...good, publishAt: '2026-12-01T10:00', expireAt: '2026-12-01T10:00' })).toEqual(['Bitiş, başlangıçtan sonra olmalı.'])
    expect(announcementSchema.safeParse({ ...good, publishAt: '2026-12-01T10:00', expireAt: '2026-12-02T10:00' }).success).toBe(true)
  })
  it('builds the target the database wants; named persons are never narrowed', () => {
    expect(buildTarget({ ...good, audience: 'owners' })).toEqual({ scope: 'site', audience: 'owners' })
    expect(buildTarget({ ...good, scope: 'blocks', audience: 'debtors', blockIds: ['b1'] })).toEqual({ scope: 'blocks', audience: 'debtors', block_ids: ['b1'] })
    expect(buildTarget({ ...good, scope: 'units', audience: 'tenants', unitIds: ['u1', 'u2'] })).toEqual({ scope: 'units', audience: 'tenants', unit_ids: ['u1', 'u2'] })
    expect(buildTarget({ ...good, scope: 'persons', audience: 'owners', profileIds: ['p1'] })).toEqual({ scope: 'persons', audience: 'all', profile_ids: ['p1'] })
  })
})

describe('announcementErrorMessage', () => {
  const codes = ['title_invalid', 'body_invalid', 'type_invalid', 'date_invalid', 'target_invalid', 'locked_after_publish', 'no_recipients', 'not_published', 'not_active', 'resend_too_soon']
  it('has its own Turkish sentence for every code the database can send', () => {
    const generic = announcementErrorMessage(new Error('other'))
    const seen = new Set<string>()
    for (const code of codes) {
      const message = announcementErrorMessage({ message: code })
      expect(message, code).not.toBe(generic)
      expect(message, code).not.toContain(code)
      seen.add(message)
    }
    expect(seen.size).toBe(codes.length)
    expect(announcementErrorMessage({ code: '42501', message: 'x' })).toBe('Bu işlem için yetkiniz yok.')
    expect(announcementErrorMessage(null)).toMatch(/şu anda yapılamadı/)
  })
})
