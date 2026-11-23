import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, stubQuery } from '@/test/query-stub'
import { deleteAllNotifications, deleteNotification, fetchNotifications, fetchUnreadCount, markAllNotificationsRead, markNotificationRead } from './api'

const client = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: client }))
beforeEach(() => client.from.mockReset())

describe('notification queries', () => {
  it('lists the newest first (ties by id), at most 100', async () => {
    const q = stubQuery({ data: [{ id: 'n1', kind: 'charge', title: 'Yeni borç', body: 'x', link: '/borclarim', created_at: '2026-11-23T10:00:00Z', read_at: null }] })
    client.from.mockReturnValue(q.query)
    const rows = await fetchNotifications()
    expect(client.from).toHaveBeenCalledWith('notifications')
    expect(callsTo(q.calls, 'order')).toEqual([['created_at', { ascending: false }], ['id', { ascending: false }]])
    expect(callsTo(q.calls, 'limit')).toEqual([[100]])
    expect(rows).toEqual([{ id: 'n1', kind: 'charge', title: 'Yeni borç', body: 'x', link: '/borclarim', createdAt: '2026-11-23T10:00:00Z', readAt: null }])
  })
  it('counts only the unread ones, without downloading them', async () => {
    const q = stubQuery({})
    const withCount = new Proxy({}, { get: (_t, p) => (p === 'then' ? (resolve: (v: unknown) => void) => resolve({ count: 7, error: null }) : () => withCount) })
    client.from.mockReturnValue({ select: (...args: unknown[]) => { q.calls.push({ method: 'select', args }); return withCount } })
    expect(await fetchUnreadCount()).toBe(7)
    expect(callsTo(q.calls, 'select')).toEqual([['id', { count: 'exact', head: true }]])
  })
  it('marks one read only while it is unread, and "all" only the unread ones', async () => {
    const one = stubQuery({})
    client.from.mockReturnValueOnce(one.query)
    await markNotificationRead('n1')
    expect(callsTo(one.calls, 'eq')).toEqual([['id', 'n1']])
    expect(callsTo(one.calls, 'is')).toEqual([['read_at', null]])
    expect((callsTo(one.calls, 'update')[0][0] as { read_at: string }).read_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const all = stubQuery({})
    client.from.mockReturnValueOnce(all.query)
    await markAllNotificationsRead()
    expect(callsTo(all.calls, 'is')).toEqual([['read_at', null]])
    expect(callsTo(all.calls, 'eq')).toEqual([])
  })
  it('deletes one by id, and "all" with a filter that matches every row of the person', async () => {
    const one = stubQuery({})
    client.from.mockReturnValueOnce(one.query)
    await deleteNotification('n1')
    expect(callsTo(one.calls, 'delete')).toHaveLength(1)
    expect(callsTo(one.calls, 'eq')).toEqual([['id', 'n1']])
    const all = stubQuery({})
    client.from.mockReturnValueOnce(all.query)
    await deleteAllNotifications()
    expect(callsTo(all.calls, 'not')).toEqual([['id', 'is', null]])
  })
  it('throws what the database answers', async () => {
    client.from.mockReturnValue(stubQuery({ error: new Error('denied') }).query)
    await expect(fetchNotifications()).rejects.toThrow('denied')
    await expect(deleteNotification('n1')).rejects.toThrow('denied')
  })
})
