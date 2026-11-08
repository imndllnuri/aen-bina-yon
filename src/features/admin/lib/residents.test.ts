import { describe, expect, it } from 'vitest'
import { canRequestLink, isCurrentResidency, matchesQuery, residentStatus, STATUS_LABEL } from './residents'

const TODAY = '2026-11-08'

describe('residentStatus', () => {
  it('is "pending" until the consent is recorded (the invite page records it last)', () => {
    expect(residentStatus({ isActive: true, kvkkConsentAt: null })).toBe('pending')
    expect(residentStatus({ isActive: true, kvkkConsentAt: '2026-11-01T10:00:00Z' })).toBe('active')
  })

  it('is "inactive" for a deactivated account, whatever else is true', () => {
    expect(residentStatus({ isActive: false, kvkkConsentAt: null })).toBe('inactive')
    expect(residentStatus({ isActive: false, kvkkConsentAt: '2026-11-01T10:00:00Z' })).toBe('inactive')
  })

  it('has a Turkish label for every status', () => {
    expect(STATUS_LABEL).toEqual({ inactive: 'Devre dışı', pending: 'Davet bekliyor', active: 'Aktif' })
  })
})

describe('isCurrentResidency (the end date is the day they moved out)', () => {
  it.each([
    { why: 'starts today', residency: { startDate: '2026-11-08', endDate: null }, expected: true },
    { why: 'starts tomorrow', residency: { startDate: '2026-11-09', endDate: null }, expected: false },
    { why: 'has no end date', residency: { startDate: '2020-01-01', endDate: null }, expected: true },
    { why: 'ends today (moved out today)', residency: { startDate: '2020-01-01', endDate: '2026-11-08' }, expected: false },
    { why: 'ends tomorrow', residency: { startDate: '2020-01-01', endDate: '2026-11-09' }, expected: true },
    { why: 'starts and ends on the same day (a corrected mistake)', residency: { startDate: '2026-11-08', endDate: '2026-11-08' }, expected: false },
    { why: 'ended yesterday', residency: { startDate: '2020-01-01', endDate: '2026-11-07' }, expected: false },
  ])('a residency that $why -> $expected', ({ residency, expected }) => {
    expect(isCurrentResidency(residency, TODAY)).toBe(expected)
  })
})

describe('canRequestLink (a hint for the buttons; the server decides again)', () => {
  const base = { isActive: true, kvkkConsentAt: null, startDate: '2020-01-01', endDate: null }

  it('is true only for a current, active resident who has not finished the invite page', () => {
    expect(canRequestLink(base, TODAY)).toBe(true)
    expect(canRequestLink({ ...base, kvkkConsentAt: '2026-01-01T00:00:00Z' }, TODAY)).toBe(false) // finished
    expect(canRequestLink({ ...base, isActive: false }, TODAY)).toBe(false) // deactivated
    expect(canRequestLink({ ...base, endDate: '2021-01-01' }, TODAY)).toBe(false) // moved out
  })
})

describe('matchesQuery', () => {
  const row = { fullName: 'Ayşe Kaya', email: 'ayse@ornek.com', phone: '0532 111 22 33', blockName: 'A Blok', doorNo: '12' }

  it('finds by name, e-mail, phone and unit, ignoring case (Turkish İ and ı too)', () => {
    for (const query of ['ayşe', 'AYŞE', 'kaya', 'ornek.com', '0532', 'a blok 12', 'blok', '12']) expect(matchesQuery(row, query)).toBe(true)
    expect(matchesQuery({ ...row, fullName: 'İlker Işık' }, 'ilker')).toBe(true)
    expect(matchesQuery({ ...row, fullName: 'İlker Işık' }, 'ışık')).toBe(true)
  })

  it('matches everything for an empty search and nothing for an unknown one', () => {
    expect(matchesQuery(row, '')).toBe(true)
    expect(matchesQuery(row, '   ')).toBe(true)
    expect(matchesQuery(row, 'zzz')).toBe(false)
  })

  it('copes with missing fields', () => {
    expect(matchesQuery({ ...row, fullName: null, phone: null }, 'ornek')).toBe(true)
  })
})
