import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, stubQuery } from '@/test/query-stub'
import { AUDIT_PAGE, cleanActor, EMPTY_FILTERS, fetchAudit } from './api'

const client = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: client }))
beforeEach(() => client.from.mockReset())

const SITE = { id: '20000000-0000-0000-0000-0000000000a1', companyId: '10000000-0000-0000-0000-0000000000c1' }
const dbRow = (over: Record<string, unknown> = {}) => ({
  id: 7, at: '2026-11-23T11:00:00Z', actor_id: 'p1', actor_name: 'Admin A', table_name: 'payments', row_id: 'r1', action: 'update', site_id: SITE.id, company_id: SITE.companyId,
  old_data: { status: 'approved' }, new_data: { status: 'voided' }, ...over,
})

describe('fetchAudit', () => {
  it('asks for this site AND the company rows of its company, newest first, 50 at a time, with a count', async () => {
    const q = stubQuery({ data: [dbRow()], count: 120 })
    client.from.mockReturnValue(q.query)
    const result = await fetchAudit(SITE, EMPTY_FILTERS, 0)
    expect(client.from).toHaveBeenCalledWith('audit_log')
    expect(callsTo(q.calls, 'or')).toEqual([[`site_id.eq.${SITE.id},and(site_id.is.null,company_id.eq.${SITE.companyId})`]])
    expect(callsTo(q.calls, 'order')).toEqual([['id', { ascending: false }]])
    expect(callsTo(q.calls, 'range')).toEqual([[0, AUDIT_PAGE - 1]])
    expect(callsTo(q.calls, 'select')[0]?.[1]).toEqual({ count: 'exact' })
    expect(result.rows[0]).toMatchObject({ id: 7, actorName: 'Admin A', table: 'payments', action: 'update', oldData: { status: 'approved' }, newData: { status: 'voided' } })
  })
  it('pages by 50', async () => {
    const q = stubQuery({ data: [], count: 0 })
    client.from.mockReturnValue(q.query)
    await fetchAudit(SITE, EMPTY_FILTERS, 2)
    expect(callsTo(q.calls, 'range')).toEqual([[100, 149]])
  })
  it('adds a filter only for what the person chose', async () => {
    const q = stubQuery({ data: [], count: 0 })
    client.from.mockReturnValue(q.query)
    await fetchAudit(SITE, { table: 'units', action: 'delete', actor: 'Ayşe', from: '2026-11-01', to: '2026-11-30' }, 0)
    expect(callsTo(q.calls, 'eq')).toEqual([['table_name', 'units'], ['action', 'delete']])
    expect(callsTo(q.calls, 'ilike')).toEqual([['actor_name', '%Ayşe%']])
    expect(callsTo(q.calls, 'gte')).toEqual([['at', '2026-11-01T00:00:00+03:00']])
    expect(callsTo(q.calls, 'lte')).toEqual([['at', '2026-11-30T23:59:59.999+03:00']])
    const plain = stubQuery({ data: [], count: 0 })
    client.from.mockReturnValue(plain.query)
    await fetchAudit(SITE, EMPTY_FILTERS, 0)
    for (const m of ['eq', 'ilike', 'gte', 'lte']) expect(callsTo(plain.calls, m)).toEqual([])
  })
  it('takes wildcards out of the name that is typed', () => {
    expect(cleanActor('  A%li_ *x\\, (y)  ')).toBe('A li x y')
    expect(cleanActor('Ayşe')).toBe('Ayşe')
  })
  it('does not trust what the database says: an unknown action is shown as a change, data that is no object becomes empty', async () => {
    client.from.mockReturnValue(stubQuery({ data: [dbRow({ action: 'zzz', old_data: 'text', new_data: [1] })], count: 1 }).query)
    const { rows } = await fetchAudit(SITE, EMPTY_FILTERS, 0)
    expect(rows[0]).toMatchObject({ action: 'update', oldData: null, newData: null })
  })
  it('uses the number of rows when the database gives no count', async () => {
    client.from.mockReturnValue(stubQuery({ data: [dbRow(), dbRow({ id: 8 })], count: null }).query)
    expect((await fetchAudit(SITE, EMPTY_FILTERS, 0)).total).toBe(2)
  })
  it('throws when the query fails', async () => {
    client.from.mockReturnValue(stubQuery({ error: new Error('boom') }).query)
    await expect(fetchAudit(SITE, EMPTY_FILTERS, 0)).rejects.toThrow('boom')
  })
})
