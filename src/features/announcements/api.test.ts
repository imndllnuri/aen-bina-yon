import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, stubQuery } from '@/test/query-stub'
import { fetchMyAnnouncements, fetchMyReadIds, previewAudience, saveAnnouncement } from './api'

const client = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: client }))
beforeEach(() => {
  client.from.mockReset()
  client.rpc.mockReset()
})

describe('announcement queries', () => {
  it('asks for pinned first, then newest, and only the columns a resident may read', async () => {
    const q = stubQuery({ data: [{ id: 'a1', title: 'T', body: 'B', type: 'weird', pinned: true, publish_at: null, expire_at: null, published_at: '2026-11-20T10:00:00Z' }] })
    client.from.mockReturnValue(q.query)
    const rows = await fetchMyAnnouncements()
    expect(client.from).toHaveBeenCalledWith('announcements')
    expect(callsTo(q.calls, 'order')).toEqual([['pinned', { ascending: false }], ['published_at', { ascending: false }], ['id']])
    const columns = callsTo(q.calls, 'select')[0][0] as string
    expect(columns).not.toContain('target')
    expect(columns).not.toContain('created_by')
    expect(rows[0]).toMatchObject({ id: 'a1', type: 'genel', pinned: true }) // an unknown type is shown as "genel"
  })
  it('reads the ids of the announcements the person opened', async () => {
    client.from.mockReturnValue(stubQuery({ data: [{ announcement_id: 'a1' }, { announcement_id: 'a2' }] }).query)
    expect(await fetchMyReadIds()).toEqual(['a1', 'a2'])
    expect(client.from).toHaveBeenCalledWith('announcement_reads')
  })
  it('sends a draft with explicit nulls (the database wants every argument)', async () => {
    client.rpc.mockResolvedValue({ data: 'new-id', error: null })
    const id = await saveAnnouncement({ id: null, siteId: 's1', title: 'T', body: 'B', type: 'genel', pinned: false, target: { scope: 'site', audience: 'all' }, publishAt: null, expireAt: null })
    expect(id).toBe('new-id')
    expect(client.rpc).toHaveBeenCalledWith('save_announcement', {
      p_id: null, p_site: 's1', p_title: 'T', p_body: 'B', p_type: 'genel', p_pinned: false, p_target: { scope: 'site', audience: 'all' }, p_publish_at: null, p_expire_at: null,
    })
  })
  it('reads the audience preview', async () => {
    client.rpc.mockResolvedValue({ data: [{ recipients: 6, units: 3 }], error: null })
    expect(await previewAudience('s1', { scope: 'site', audience: 'all' })).toEqual({ recipients: 6, units: 3 })
    client.rpc.mockResolvedValue({ data: [], error: null })
    expect(await previewAudience('s1', { scope: 'site', audience: 'all' })).toEqual({ recipients: 0, units: 0 })
  })
})
