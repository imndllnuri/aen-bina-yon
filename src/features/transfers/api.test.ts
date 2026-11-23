import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, stubQuery } from '@/test/query-stub'
import { dekontUrl, fetchSiteNotices, uploadDekont } from './api'

const client = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } }))
vi.mock('@/lib/supabase', () => ({ supabase: client }))

const row = (id: string, status: string, createdAt: string) => ({
  id, unit_id: 'u1', profile_id: 'p1', amount: 250, sent_on: '2026-11-20', sender_name: 'Ayşe Kaya', note: null, file_path: `u1/${id}.pdf`, status,
  created_at: createdAt, reviewed_at: null, reject_reason: null, payment_id: null, payments: null,
  units: { door_no: '1', blocks: { name: 'A Blok', site_id: 's1' } }, profiles: { full_name: 'Ayşe Kaya', phone: null },
})

beforeEach(() => {
  client.from.mockReset()
  client.rpc.mockReset()
  client.storage.from.mockReset()
})

describe('fetchSiteNotices (the admin queue)', () => {
  it('asks for the WAITING notices in their own query, so an old waiting notice cannot fall out behind 300 newer finished ones', async () => {
    const waiting = stubQuery({ data: [row('w1', 'pending', '2026-10-01T08:00:00Z'), row('w2', 'pending', '2026-11-01T08:00:00Z')] })
    const others = stubQuery({ data: [row('o1', 'approved', '2026-11-22T08:00:00Z'), row('o2', 'rejected', '2026-11-21T08:00:00Z')] })
    client.from.mockReturnValueOnce(waiting.query).mockReturnValueOnce(others.query)

    const result = await fetchSiteNotices('s1')

    expect(client.from).toHaveBeenCalledTimes(2)
    expect(client.from).toHaveBeenCalledWith('transfer_notices')
    expect(callsTo(waiting.calls, 'eq')).toContainEqual(['status', 'pending'])
    expect(callsTo(waiting.calls, 'eq')).toContainEqual(['units.blocks.site_id', 's1'])
    expect(callsTo(waiting.calls, 'order')).toEqual([['created_at', { ascending: true }]]) // the one that waited longest first
    expect(callsTo(others.calls, 'neq')).toContainEqual(['status', 'pending'])
    expect(callsTo(others.calls, 'order')).toEqual([['created_at', { ascending: false }]])
    // both are cut at 300 on their own
    expect(callsTo(waiting.calls, 'limit')).toEqual([[300]])
    expect(callsTo(others.calls, 'limit')).toEqual([[300]])
    // waiting first (oldest first), then the others (newest first)
    expect(result.map((r) => r.id)).toEqual(['w1', 'w2', 'o1', 'o2'])
  })

  it('reads the notice, the unit label, the sender and the payment state of each row', async () => {
    const approved = { ...row('a1', 'approved', '2026-11-22T08:00:00Z'), payment_id: 'pay1', payments: { status: 'voided', receipt_no: 'MKB-2026-000042' } }
    client.from.mockReturnValueOnce(stubQuery({ data: [] }).query).mockReturnValueOnce(stubQuery({ data: [approved] }).query)
    const [first] = await fetchSiteNotices('s1')
    expect(first).toMatchObject({
      id: 'a1', unitLabel: 'A Blok · 1', amountKurus: 25000, status: 'approved', paymentId: 'pay1', paymentStatus: 'voided', receiptNo: 'MKB-2026-000042',
      senderId: 'p1', senderFullName: 'Ayşe Kaya',
    })
  })

  it('throws when either query fails (the page then shows "try again")', async () => {
    client.from.mockReturnValueOnce(stubQuery({ data: [] }).query).mockReturnValueOnce(stubQuery({ error: new Error('boom') }).query)
    await expect(fetchSiteNotices('s1')).rejects.toThrow('boom')
    client.from.mockReturnValueOnce(stubQuery({ error: new Error('first') }).query).mockReturnValueOnce(stubQuery({ data: [] }).query)
    await expect(fetchSiteNotices('s1')).rejects.toThrow('first')
  })
})

describe('uploadDekont', () => {
  const file = new File([new Uint8Array([1])], 'a.pdf')
  const bucket = (upload: ReturnType<typeof vi.fn>) => client.storage.from.mockReturnValue({ upload })

  it('uploads into the private bucket without overwriting, with the checked file type', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    bucket(upload)
    await uploadDekont('u1/x.pdf', file, 'application/pdf')
    expect(client.storage.from).toHaveBeenCalledWith('dekontlar')
    expect(upload).toHaveBeenCalledWith('u1/x.pdf', file, { contentType: 'application/pdf', upsert: false })
  })
  it('treats "already exists" as success (a retry after a lost answer), but not any other error', async () => {
    bucket(vi.fn().mockResolvedValue({ error: { message: 'The resource already exists' } }))
    await expect(uploadDekont('u1/x.pdf', file, 'application/pdf')).resolves.toBeUndefined()
    bucket(vi.fn().mockResolvedValue({ error: { message: 'new row violates row-level security policy', statusCode: '403' } }))
    await expect(uploadDekont('u1/x.pdf', file, 'application/pdf')).rejects.toMatchObject({ statusCode: '403' })
  })
})

describe('dekontUrl', () => {
  it('asks for a link that works for 5 minutes', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://files.example/s' }, error: null })
    client.storage.from.mockReturnValue({ createSignedUrl })
    expect(await dekontUrl('u1/x.pdf')).toBe('https://files.example/s')
    expect(createSignedUrl).toHaveBeenCalledWith('u1/x.pdf', 300)
  })
})

