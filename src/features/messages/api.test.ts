import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, stubQuery } from '@/test/query-stub'
import { deleteMessage, fetchMessages, MESSAGE_STATUS, messageStatusLabel, updateMessageNote, updateMessageStatus } from './api'

const client = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: client }))
beforeEach(() => client.from.mockReset())

describe('contact messages', () => {
  it('lists the newest first, at most 500, and reads each row', async () => {
    const q = stubQuery({ data: [{ id: 'm1', name: 'Ali', phone: '0532', email: null, message: 'Merhaba', status: 'new', admin_note: null, created_at: '2026-11-20T08:00:00Z' }] })
    client.from.mockReturnValue(q.query)
    expect(await fetchMessages()).toEqual([{ id: 'm1', name: 'Ali', phone: '0532', email: null, message: 'Merhaba', status: 'new', adminNote: null, createdAt: '2026-11-20T08:00:00Z' }])
    expect(client.from).toHaveBeenCalledWith('contact_messages')
    expect(callsTo(q.calls, 'order')).toEqual([['created_at', { ascending: false }]])
    expect(callsTo(q.calls, 'limit')).toEqual([[500]])
    expect(String(callsTo(q.calls, 'select')[0]?.[0])).toBe('id, name, phone, email, message, status, admin_note, created_at')
  })
  it('names the three statuses of the database', () => {
    expect(MESSAGE_STATUS.map((s) => s.code)).toEqual(['new', 'read', 'answered'])
    expect(messageStatusLabel('answered')).toBe('Yanıtlandı')
    expect(messageStatusLabel('zzz')).toBe('zzz')
  })
  it('changes only the status or the note (never what the visitor wrote)', async () => {
    const a = stubQuery({ data: [{ id: 'm1' }] })
    client.from.mockReturnValue(a.query)
    await updateMessageStatus('m1', 'read')
    expect(client.from).toHaveBeenLastCalledWith('contact_messages')
    expect(callsTo(a.calls, 'update')).toEqual([[{ status: 'read' }]])
    expect(callsTo(a.calls, 'eq')).toEqual([['id', 'm1']])
    const b = stubQuery({ data: [{ id: 'm1' }] })
    client.from.mockReturnValue(b.query)
    await updateMessageNote('m1', '  aradım  ')
    expect(client.from).toHaveBeenLastCalledWith('contact_messages')
    expect(callsTo(b.calls, 'update')).toEqual([[{ admin_note: 'aradım' }]])
    const c = stubQuery({ data: [{ id: 'm1' }] })
    client.from.mockReturnValue(c.query)
    await updateMessageNote('m1', '   ')
    expect(callsTo(c.calls, 'update')).toEqual([[{ admin_note: null }]])
  })
  it('says "not allowed" when row security changed nothing (a person who is no admin)', async () => {
    client.from.mockReturnValue(stubQuery({ data: [] }).query)
    await expect(updateMessageStatus('m1', 'read')).rejects.toMatchObject({ code: '42501' })
    await expect(updateMessageNote('m1', 'x')).rejects.toMatchObject({ code: '42501' })
    await expect(deleteMessage('m1')).rejects.toMatchObject({ code: '42501' })
  })
  it('deletes one message', async () => {
    const q = stubQuery({ data: [{ id: 'm1' }] })
    client.from.mockReturnValue(q.query)
    await deleteMessage('m1')
    expect(client.from).toHaveBeenLastCalledWith('contact_messages')
    expect(callsTo(q.calls, 'delete')).toHaveLength(1)
    expect(callsTo(q.calls, 'eq')).toEqual([['id', 'm1']])
  })
  it('throws what the database says', async () => {
    client.from.mockReturnValue(stubQuery({ error: { message: 'boom' } }).query)
    await expect(fetchMessages()).rejects.toMatchObject({ message: 'boom' })
    await expect(updateMessageNote('m1', 'x')).rejects.toMatchObject({ message: 'boom' })
  })
})
