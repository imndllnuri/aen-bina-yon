import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, stubQuery } from '@/test/query-stub'
import {
  addRequestComment,
  cancelRequest,
  createRequest,
  fetchMyRequests,
  fetchRequestDetail,
  fetchSiteRequests,
  rateRequest,
  requestPhotoUrls,
  setRequestStatus,
  setRequestTriage,
  updateRequest,
  uploadRequestPhoto,
} from './api'

const client = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } }))
vi.mock('@/lib/supabase', () => ({ supabase: client }))

beforeEach(() => {
  client.from.mockReset()
  client.rpc.mockReset()
  client.storage.from.mockReset()
  client.rpc.mockResolvedValue({ data: 'new-id', error: null })
})

const listRow = (id: string, status: string, createdAt: string) => ({
  id, unit_id: 'u1', category: 'asansor', title: `Talep ${id}`, priority: 'normal', status, rating: null, created_at: createdAt, updated_at: createdAt, resolved_at: null,
  requester_id: 'p1', units: { door_no: '1', blocks: { name: 'A Blok' } }, requester: { full_name: 'Kemal Kiracı' },
})

describe('the changes call checked database functions with every argument', () => {
  it('createRequest sends nulls explicitly (PostgREST needs every argument) and the photo list', async () => {
    const id = await createRequest({ token: 't1', unitId: 'u1', category: 'asansor', title: 'Başlık', description: 'Metin', priority: 'normal', location: null, photoPaths: [], requesterId: null })
    expect(id).toBe('new-id')
    expect(client.rpc).toHaveBeenCalledWith('create_request', {
      p_token: 't1', p_unit: 'u1', p_category: 'asansor', p_title: 'Başlık', p_description: 'Metin', p_priority: 'normal', p_location: null, p_photos: [], p_requester: null,
    })
  })

  it('createRequest passes the photos and the requester of a request opened by phone', async () => {
    await createRequest({ token: 't2', unitId: 'u1', category: 'diger', title: 'T', description: 'D', priority: 'acil', location: 'Zemin', photoPaths: ['u1/a.jpg', 'u1/b.jpg'], requesterId: 'p9' })
    expect(client.rpc.mock.calls[0]?.[1]).toMatchObject({ p_photos: ['u1/a.jpg', 'u1/b.jpg'], p_requester: 'p9', p_location: 'Zemin' })
  })

  it('updateRequest, cancelRequest, setRequestStatus, setRequestTriage, addRequestComment and rateRequest use the right function and names', async () => {
    await updateRequest('r1', { category: 'asansor', title: 'T', description: 'D', priority: 'yuksek', location: null })
    await cancelRequest('r1')
    await setRequestStatus('r1', 'islemde')
    await setRequestTriage('r1', 'elektrik', 'acil')
    await addRequestComment('r1', 'Merhaba', true)
    await rateRequest('r1', 4)
    expect(client.rpc.mock.calls).toEqual([
      ['update_request', { p_id: 'r1', p_category: 'asansor', p_title: 'T', p_description: 'D', p_priority: 'yuksek', p_location: null }],
      ['cancel_request', { p_id: 'r1' }],
      ['set_request_status', { p_id: 'r1', p_status: 'islemde' }],
      ['set_request_triage', { p_id: 'r1', p_category: 'elektrik', p_priority: 'acil' }],
      ['add_request_comment', { p_request: 'r1', p_body: 'Merhaba', p_internal: true }],
      ['rate_request', { p_id: 'r1', p_rating: 4 }],
    ])
  })

  it('throws what the database says (the page turns the code into Turkish)', async () => {
    client.rpc.mockResolvedValue({ data: null, error: { message: 'not_open' } })
    await expect(cancelRequest('r1')).rejects.toMatchObject({ message: 'not_open' })
    await expect(setRequestStatus('r1', 'acik')).rejects.toMatchObject({ message: 'not_open' })
    await expect(addRequestComment('r1', 'x', false)).rejects.toMatchObject({ message: 'not_open' })
  })
})

describe('fetchMyRequests', () => {
  it('asks for the requests of this person, newest first, and reads each row', async () => {
    const q = stubQuery({ data: [listRow('r1', 'acik', '2026-11-20T08:00:00Z')] })
    client.from.mockReturnValue(q.query)
    const result = await fetchMyRequests('p1')
    expect(client.from).toHaveBeenCalledWith('requests')
    expect(callsTo(q.calls, 'eq')).toEqual([['requester_id', 'p1']])
    expect(callsTo(q.calls, 'order')).toEqual([['created_at', { ascending: false }]])
    expect(result).toEqual([{ id: 'r1', unitId: 'u1', category: 'asansor', title: 'Talep r1', priority: 'normal', status: 'acik', rating: null, createdAt: '2026-11-20T08:00:00Z', updatedAt: '2026-11-20T08:00:00Z', resolvedAt: null }])
  })

  it('never asks for the token column or for internal data', async () => {
    const q = stubQuery({ data: [] })
    client.from.mockReturnValue(q.query)
    await fetchMyRequests('p1')
    expect(String(callsTo(q.calls, 'select')[0]?.[0])).not.toMatch(/token|is_internal/)
  })

  it('shows an unknown status as "Açık" instead of crashing', async () => {
    client.from.mockReturnValue(stubQuery({ data: [listRow('r1', 'from_the_future', '2026-11-20T08:00:00Z')] }).query)
    expect((await fetchMyRequests('p1'))[0]?.status).toBe('acik')
  })

  it('throws when the query fails', async () => {
    client.from.mockReturnValue(stubQuery({ error: new Error('boom') }).query)
    await expect(fetchMyRequests('p1')).rejects.toThrow('boom')
  })
})

describe('fetchSiteRequests (the admin list)', () => {
  it('asks for the OPEN requests in their own query, so an old open request cannot fall out behind 200 newer finished ones', async () => {
    const open = stubQuery({ data: [listRow('o1', 'acik', '2026-10-01T08:00:00Z'), listRow('o2', 'islemde', '2026-11-01T08:00:00Z')] })
    const done = stubQuery({ data: [listRow('d1', 'cozuldu', '2026-11-22T08:00:00Z')] })
    client.from.mockReturnValueOnce(open.query).mockReturnValueOnce(done.query)

    const result = await fetchSiteRequests('s1')

    expect(client.from).toHaveBeenCalledTimes(2)
    expect(callsTo(open.calls, 'eq')).toContainEqual(['site_id', 's1'])
    expect(callsTo(open.calls, 'in')).toEqual([['status', ['acik', 'inceleniyor', 'islemde']]])
    expect(callsTo(done.calls, 'in')).toEqual([['status', ['cozuldu', 'kapandi', 'iptal']]])
    expect(callsTo(open.calls, 'limit')).toEqual([[500]])
    expect(callsTo(done.calls, 'limit')).toEqual([[200]])
    expect(result.map((r) => r.id)).toEqual(['o1', 'o2', 'd1'])
  })

  it('reads the unit label and the requester name', async () => {
    client.from.mockReturnValueOnce(stubQuery({ data: [listRow('o1', 'acik', '2026-10-01T08:00:00Z')] }).query).mockReturnValueOnce(stubQuery({ data: [] }).query)
    expect((await fetchSiteRequests('s1'))[0]).toMatchObject({ unitLabel: 'A Blok · 1', requesterId: 'p1', requesterName: 'Kemal Kiracı' })
  })

  it('throws when either query fails', async () => {
    client.from.mockReturnValueOnce(stubQuery({ data: [] }).query).mockReturnValueOnce(stubQuery({ error: new Error('second') }).query)
    await expect(fetchSiteRequests('s1')).rejects.toThrow('second')
  })
})

describe('fetchRequestDetail', () => {
  const detailRow = {
    ...listRow('r1', 'islemde', '2026-11-20T08:00:00Z'),
    site_id: 's1', created_by: 'a1', description: 'Metin', location: 'Zemin', rated_at: null,
    requester: { full_name: 'Kemal Kiracı', phone: '0555' },
    request_photos: [{ id: 'ph1', file_path: 'u1/a.jpg', position: 1 }],
    request_events: [{ id: 'e1', kind: 'created', from_status: null, to_status: 'acik', rating: null, actor_id: 'p1', created_at: '2026-11-20T08:00:00Z', actor: { full_name: 'Kemal Kiracı' } }],
    request_comments: [{ id: 'c1', author_id: 'a1', by_admin: true, is_internal: true, body: 'iç not', created_at: '2026-11-20T09:00:00Z', author: { full_name: 'Yönetici' } }],
  }

  it('a resident asks WITHOUT the names of other people (no profile joins)', async () => {
    const q = stubQuery({ data: detailRow })
    client.from.mockReturnValue(q.query)
    await fetchRequestDetail('r1', false)
    const select = String(callsTo(q.calls, 'select')[0]?.[0])
    expect(select).not.toMatch(/profiles/)
    expect(select).toMatch(/request_comments/)
    expect(select).not.toMatch(/token/)
  })

  it('an admin asks for the names of the requester, the actors and the comment authors', async () => {
    const q = stubQuery({ data: detailRow })
    client.from.mockReturnValue(q.query)
    await fetchRequestDetail('r1', true)
    const select = String(callsTo(q.calls, 'select')[0]?.[0])
    expect(select).toMatch(/requests_requester_id_fkey/)
    expect(select).toMatch(/request_events_actor_id_fkey/)
    expect(select).toMatch(/request_comments_author_id_fkey/)
  })

  it('orders the history, the thread and the photos', async () => {
    const q = stubQuery({ data: detailRow })
    client.from.mockReturnValue(q.query)
    await fetchRequestDetail('r1', true)
    expect(callsTo(q.calls, 'order')).toEqual([
      ['created_at', { referencedTable: 'request_events', ascending: true }],
      ['created_at', { referencedTable: 'request_comments', ascending: true }],
      ['position', { referencedTable: 'request_photos', ascending: true }],
    ])
    expect(callsTo(q.calls, 'eq')).toEqual([['id', 'r1']])
  })

  it('reads everything into one object', async () => {
    client.from.mockReturnValue(stubQuery({ data: detailRow }).query)
    const detail = await fetchRequestDetail('r1', true)
    expect(detail).toMatchObject({
      id: 'r1', siteId: 's1', unitLabel: 'A Blok · 1', requesterName: 'Kemal Kiracı', requesterPhone: '0555', createdBy: 'a1', description: 'Metin', location: 'Zemin', status: 'islemde',
      photos: [{ id: 'ph1', path: 'u1/a.jpg', position: 1 }],
      events: [{ id: 'e1', kind: 'created', toStatus: 'acik', actorName: 'Kemal Kiracı' }],
      comments: [{ id: 'c1', authorId: 'a1', authorName: 'Yönetici', byAdmin: true, isInternal: true, body: 'iç not' }],
    })
  })

  it('returns null when nothing is found (a request that is not yours looks the same as one that does not exist)', async () => {
    client.from.mockReturnValue(stubQuery({ data: null }).query)
    expect(await fetchRequestDetail('nope', false)).toBeNull()
  })

  it('throws when the query fails', async () => {
    client.from.mockReturnValue(stubQuery({ error: new Error('boom') }).query)
    await expect(fetchRequestDetail('r1', false)).rejects.toThrow('boom')
  })
})

describe('photos in the private bucket', () => {
  it('uploads to the talep-fotolari bucket without overwriting', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    client.storage.from.mockReturnValue({ upload })
    const blob = new Blob(['x'])
    await uploadRequestPhoto('u1/a.jpg', { blob, type: 'jpg', mime: 'image/jpeg', name: 'a.jpg', id: 'a' })
    expect(client.storage.from).toHaveBeenCalledWith('talep-fotolari')
    expect(upload).toHaveBeenCalledWith('u1/a.jpg', blob, { contentType: 'image/jpeg', upsert: false })
  })

  it('treats "already exists" as success (a retry) and throws any other error', async () => {
    const photo = { blob: new Blob(['x']), type: 'jpg' as const, mime: 'image/jpeg', name: 'a.jpg', id: 'a' }
    client.storage.from.mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: { message: 'The resource already exists' } }) })
    await expect(uploadRequestPhoto('u1/a.jpg', photo)).resolves.toBeUndefined()
    client.storage.from.mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: { message: 'new row violates row-level security policy' } }) })
    await expect(uploadRequestPhoto('u1/a.jpg', photo)).rejects.toMatchObject({ message: /row-level security/ })
  })

  it('asks for links that live 5 minutes and returns them by path', async () => {
    const createSignedUrls = vi.fn().mockResolvedValue({ data: [{ path: 'u1/a.jpg', signedUrl: 'https://x/a' }, { path: 'u1/b.jpg', signedUrl: null, error: 'x' }], error: null })
    client.storage.from.mockReturnValue({ createSignedUrls })
    expect(await requestPhotoUrls(['u1/a.jpg', 'u1/b.jpg'])).toEqual({ 'u1/a.jpg': 'https://x/a' })
    expect(createSignedUrls).toHaveBeenCalledWith(['u1/a.jpg', 'u1/b.jpg'], 300)
  })

  it('does not call the store when there is nothing to open', async () => {
    expect(await requestPhotoUrls([])).toEqual({})
    expect(client.storage.from).not.toHaveBeenCalled()
  })
})
