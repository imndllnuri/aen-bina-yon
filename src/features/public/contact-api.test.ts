import { beforeEach, describe, expect, it, vi } from 'vitest'
import { submitContactMessage } from './contact-api'

const mocks = vi.hoisted(() => ({ configured: true, insert: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocks.configured ? { from: mocks.from } : null
  },
}))

const row = { name: 'Ahmet Yılmaz', phone: '0532 000 00 00', email: null, message: 'Merhaba, bilgi almak istiyorum.' }

beforeEach(() => {
  mocks.configured = true
  mocks.insert.mockReset().mockResolvedValue({ error: null })
  // the fake table has ONLY `insert`: a `.select()` chained after it would throw (visitors may not read)
  mocks.from.mockReset().mockImplementation(() => ({ insert: mocks.insert }))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('submitContactMessage', () => {
  it('inserts into contact_messages and asks for nothing back', async () => {
    expect(await submitContactMessage(row)).toEqual({ ok: true })
    expect(mocks.from).toHaveBeenCalledWith('contact_messages')
    expect(mocks.insert).toHaveBeenCalledWith(row)
  })
  it('says "failed" when the database refuses', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } })
    expect(await submitContactMessage(row)).toEqual({ ok: false, reason: 'failed' })
  })
  it('says "failed" when the network is down', async () => {
    mocks.insert.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await submitContactMessage(row)).toEqual({ ok: false, reason: 'failed' })
  })
  it('says "not-configured" when the build has no Supabase settings, and sends nothing', async () => {
    mocks.configured = false
    expect(await submitContactMessage(row)).toEqual({ ok: false, reason: 'not-configured' })
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
