import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, stubQuery } from '@/test/query-stub'
import { CHARGE_LIST_LIMIT, fetchCharges } from './api'

const client = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: client }))

const charge = (id: string, createdAt: string, over: Record<string, unknown> = {}) => ({
  id, unit_id: 'u1', charge_type_id: 't1', batch_id: 'b1', period: '2026-11-01', description: null, amount: 500, due_date: '2026-11-15', tenant_visible: true,
  created_at: createdAt, voided_at: null, void_reason: null, units: { door_no: '1', block_id: 'bl1', blocks: { name: 'A Blok', site_id: 's1' } }, charge_types: { name: 'Aidat' }, ...over,
})

const NO_FILTERS = { period: null, typeId: null, blockId: null }

beforeEach(() => client.from.mockReset())

describe('fetchCharges: the paid amount and status come from the database view', () => {
  it('asks BOTH queries for the same lines in the same order, so a paid line cannot be missing from the status list above 1000 lines', async () => {
    const lines = stubQuery({ data: [] })
    const statuses = stubQuery({ data: [] })
    client.from.mockReturnValueOnce(lines.query).mockReturnValueOnce(statuses.query)
    await fetchCharges('s1', NO_FILTERS)
    expect(client.from).toHaveBeenNthCalledWith(1, 'charges')
    expect(client.from).toHaveBeenNthCalledWith(2, 'charge_status')
    // newest first, ties by id: the same cut for both
    expect(callsTo(lines.calls, 'order')).toEqual([['created_at', { ascending: false }], ['id', { ascending: false }]])
    expect(callsTo(statuses.calls, 'order')).toEqual([['created_at', { ascending: false }], ['charge_id', { ascending: false }]])
    expect(callsTo(lines.calls, 'limit')).toEqual([[CHARGE_LIST_LIMIT]])
    expect(callsTo(statuses.calls, 'limit')).toEqual([[CHARGE_LIST_LIMIT]])
  })

  it('gives the status query the same filters as the list', async () => {
    const lines = stubQuery({ data: [] })
    const statuses = stubQuery({ data: [] })
    client.from.mockReturnValueOnce(lines.query).mockReturnValueOnce(statuses.query)
    await fetchCharges('s1', { period: '2026-11-01', typeId: 't1', blockId: 'bl1' })
    expect(callsTo(statuses.calls, 'eq')).toEqual(expect.arrayContaining([['site_id', 's1'], ['period', '2026-11-01'], ['charge_type_id', 't1'], ['block_id', 'bl1']]))
    expect(callsTo(lines.calls, 'eq')).toEqual(expect.arrayContaining([['units.blocks.site_id', 's1'], ['period', '2026-11-01'], ['charge_type_id', 't1'], ['units.block_id', 'bl1']]))
  })

  it('merges the paid amount and the status into each line: paid, partly paid and unpaid', async () => {
    client.from
      .mockReturnValueOnce(stubQuery({ data: [charge('c1', '2026-11-01T00:01:00Z'), charge('c2', '2026-11-01T00:02:00Z'), charge('c3', '2026-11-01T00:03:00Z', { due_date: '2026-01-01' })] }).query)
      .mockReturnValueOnce(
        stubQuery({
          data: [
            { charge_id: 'c1', paid_amount: 500, status: 'paid' },
            { charge_id: 'c2', paid_amount: 50, status: 'partial' },
          ],
        }).query,
      )
    const { rows, truncated } = await fetchCharges('s1', NO_FILTERS)
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(byId.c1).toMatchObject({ paidKurus: 50000, status: 'paid' })
    expect(byId.c2).toMatchObject({ paidKurus: 5000, status: 'partial', amountKurus: 50000 })
    // not in the status list: nothing paid, and the status is worked out from the date
    expect(byId.c3).toMatchObject({ paidKurus: 0, status: 'overdue' })
    expect(truncated).toBe(false)
  })

  it('says the list was cut off when it reached the limit', async () => {
    const many = Array.from({ length: CHARGE_LIST_LIMIT }, (_, i) => charge(`c${i}`, '2026-11-01T00:00:00Z'))
    client.from.mockReturnValueOnce(stubQuery({ data: many }).query).mockReturnValueOnce(stubQuery({ data: [] }).query)
    expect((await fetchCharges('s1', NO_FILTERS)).truncated).toBe(true)
  })
})
