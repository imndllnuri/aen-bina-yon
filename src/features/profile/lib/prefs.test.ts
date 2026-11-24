import { describe, expect, it } from 'vitest'
import { isOn, PREF_KEYS, PREF_LABEL, readPrefs } from './prefs'

describe('the e-mail choices', () => {
  it('has exactly the three keys the database accepts (migration 0010)', () => {
    expect([...PREF_KEYS]).toEqual(['email_finance', 'email_announcements', 'email_requests'])
    expect(Object.keys(PREF_LABEL).sort()).toEqual([...PREF_KEYS].sort())
  })
  it('reads true and false for the known keys', () => {
    expect(readPrefs({ email_finance: false, email_requests: true })).toEqual({ email_finance: false, email_requests: true })
  })
  it('drops keys it does not know and values that are not true / false', () => {
    expect(readPrefs({ sms: true, email_finance: 'yes', email_announcements: 1, email_requests: null })).toEqual({})
  })
  it('gives nothing for anything that is not an object', () => {
    for (const odd of [null, undefined, 'x', 5, [], [true]]) expect(readPrefs(odd)).toEqual({})
  })
  it('counts a choice that was never made as ON, and a "false" as off', () => {
    expect(isOn({}, 'email_finance')).toBe(true)
    expect(isOn({ email_finance: true }, 'email_finance')).toBe(true)
    expect(isOn({ email_finance: false }, 'email_finance')).toBe(false)
    expect(isOn({ email_finance: false }, 'email_requests')).toBe(true)
  })
})
