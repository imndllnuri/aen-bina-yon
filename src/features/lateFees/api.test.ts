import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyLateFees, fetchLateFeePreview } from './api'

const client = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: client }))
beforeEach(() => {
  client.rpc.mockReset()
})

const answer = { as_of: '2026-11-28', rate: 5, method: 'daily', grace_days: 0, type_ready: true, lines: [], over: [] }

describe('fetchLateFeePreview', () => {
  it('asks the database for one site and reads the answer', async () => {
    client.rpc.mockResolvedValue({ data: answer, error: null })
    expect(await fetchLateFeePreview('s1')).toMatchObject({ asOf: '2026-11-28', rate: 5, lines: [], over: [] })
    expect(client.rpc).toHaveBeenCalledWith('preview_late_fees', { p_site: 's1' })
  })
  it('throws what the database says', async () => {
    client.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not allowed' } })
    await expect(fetchLateFeePreview('s1')).rejects.toMatchObject({ code: '42501' })
  })
  it('throws when the answer is not what was promised', async () => {
    client.rpc.mockResolvedValue({ data: { as_of: '2026-11-28' }, error: null })
    await expect(fetchLateFeePreview('s1')).rejects.toThrow(/late fee preview/)
  })
})

describe('applyLateFees', () => {
  const input = { requestId: 'r1', siteId: 's1', asOf: '2026-11-28', chargeIds: ['c1', 'c2'], expectedCount: 2, expectedKurus: 7500 }
  it('sends every number the person saw, and returns the batch id', async () => {
    client.rpc.mockResolvedValue({ data: 'batch-1', error: null })
    expect(await applyLateFees(input)).toBe('batch-1')
    expect(client.rpc).toHaveBeenCalledWith('apply_late_fees', {
      p_request_id: 'r1', p_site: 's1', p_as_of: '2026-11-28', p_charge_ids: ['c1', 'c2'], p_expected_count: 2, p_expected_kurus: 7500,
    })
  })
  it('throws what the database says (for example preview_outdated)', async () => {
    client.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'preview_outdated' } })
    await expect(applyLateFees(input)).rejects.toMatchObject({ message: 'preview_outdated' })
  })
})
