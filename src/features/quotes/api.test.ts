import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, stubQuery } from '@/test/query-stub'
import { deleteQuote, fetchQuotes, QUOTE_STATUS, quoteStatusLabel, updateQuoteNote, updateQuoteStatus } from './api'

const client = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: client }))
beforeEach(() => client.from.mockReset())

describe('quote requests', () => {
  it('lists the newest first and reads each row', async () => {
    const q = stubQuery({ data: [{ id: 'q1', name: 'Ali', phone: '0532', email: null, building_type: 'Apartman', unit_count: 16, il: 'Kayseri', ilce: 'Melikgazi', message: 'Merhaba', status: 'new', admin_note: null, created_at: '2026-11-20T08:00:00Z' }] })
    client.from.mockReturnValue(q.query)
    expect(await fetchQuotes()).toEqual([{ id: 'q1', name: 'Ali', phone: '0532', email: null, buildingType: 'Apartman', unitCount: 16, il: 'Kayseri', ilce: 'Melikgazi', message: 'Merhaba', status: 'new', adminNote: null, createdAt: '2026-11-20T08:00:00Z' }])
    expect(callsTo(q.calls, 'order')).toEqual([['created_at', { ascending: false }]])
  })
  it('names the six statuses, the five of the plan and the old "closed"', () => {
    expect(QUOTE_STATUS.map((s) => s.code)).toEqual(['new', 'contacted', 'offered', 'won', 'lost', 'closed'])
    expect(quoteStatusLabel('offered')).toBe('Teklif verildi')
    expect(quoteStatusLabel('zzz')).toBe('zzz')
  })
  it('changes only the status or the note (never what the visitor wrote)', async () => {
    const a = stubQuery({ data: [{ id: 'q1' }] })
    client.from.mockReturnValue(a.query)
    await updateQuoteStatus('q1', 'won')
    expect(callsTo(a.calls, 'update')).toEqual([[{ status: 'won' }]])
    const b = stubQuery({ data: [{ id: 'q1' }] })
    client.from.mockReturnValue(b.query)
    await updateQuoteNote('q1', '  aradım  ')
    expect(callsTo(b.calls, 'update')).toEqual([[{ admin_note: 'aradım' }]])
    const c = stubQuery({ data: [{ id: 'q1' }] })
    client.from.mockReturnValue(c.query)
    await updateQuoteNote('q1', '   ')
    expect(callsTo(c.calls, 'update')).toEqual([[{ admin_note: null }]])
  })
  it('says "not allowed" when row security changed nothing (a person who is no admin)', async () => {
    client.from.mockReturnValue(stubQuery({ data: [] }).query)
    await expect(updateQuoteStatus('q1', 'won')).rejects.toMatchObject({ code: '42501' })
    await expect(deleteQuote('q1')).rejects.toMatchObject({ code: '42501' })
  })
  it('deletes one request', async () => {
    const q = stubQuery({ data: [{ id: 'q1' }] })
    client.from.mockReturnValue(q.query)
    await deleteQuote('q1')
    expect(callsTo(q.calls, 'delete')).toHaveLength(1)
    expect(callsTo(q.calls, 'eq')).toEqual([['id', 'q1']])
  })
  it('throws what the database says', async () => {
    client.from.mockReturnValue(stubQuery({ error: { message: 'boom' } }).query)
    await expect(fetchQuotes()).rejects.toMatchObject({ message: 'boom' })
    await expect(updateQuoteNote('q1', 'x')).rejects.toMatchObject({ message: 'boom' })
  })
})
