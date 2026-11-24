import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAttendance, fetchCollections, fetchCollectionsSummary, fetchDebts, fetchKpis, fetchMonthly, fetchResidentReport, reportErrorMessage } from './api'

const client = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: client }))
beforeEach(() => client.rpc.mockReset())

describe('fetchKpis', () => {
  const row = { month: '2026-11-01', accrued: 242, collected: 29, collected_for_month: 15, rate_pct: 6.2, receivable: 330.5, overdue_units: 1, overdue_amount: 103, pending_notices: 1, open_requests: 2 }
  it('asks for the site and turns every amount into whole kuruş', async () => {
    client.rpc.mockResolvedValue({ data: [row], error: null })
    expect(await fetchKpis('s1')).toEqual({
      month: '2026-11-01', accruedKurus: 24200, collectedKurus: 2900, collectedForMonthKurus: 1500, ratePct: 6.2, receivableKurus: 33050, overdueUnits: 1, overdueKurus: 10300, pendingNotices: 1, openRequests: 2,
    })
    expect(client.rpc).toHaveBeenCalledWith('dashboard_kpis', { p_site: 's1' })
  })
  it('keeps an empty rate empty', async () => {
    client.rpc.mockResolvedValue({ data: [{ ...row, rate_pct: null }], error: null })
    expect((await fetchKpis('s1')).ratePct).toBeNull()
  })
  it('does not turn 0.07 into 7.000000000000001 kuruş', async () => {
    client.rpc.mockResolvedValue({ data: [{ ...row, accrued: 1.15, collected: 0.07, receivable: 10.05 }], error: null })
    const k = await fetchKpis('s1')
    expect([k.accruedKurus, k.collectedKurus, k.receivableKurus]).toEqual([115, 7, 1005])
  })
  it('throws when there is no row or the database refuses', async () => {
    client.rpc.mockResolvedValue({ data: [], error: null })
    await expect(fetchKpis('s1')).rejects.toThrow('no dashboard row')
    client.rpc.mockResolvedValue({ data: null, error: { message: 'not allowed', code: '42501' } })
    await expect(fetchKpis('s1')).rejects.toMatchObject({ code: '42501' })
  })
})

describe('the other reports ask with every argument', () => {
  it('monthly', async () => {
    client.rpc.mockResolvedValue({ data: [{ month: '2026-10-01', accrued: 3, collected: 10, collected_for_month: 0, rate_pct: 0 }], error: null })
    expect(await fetchMonthly('s1', '2026-10-01', '2026-11-01')).toEqual([{ month: '2026-10-01', accruedKurus: 300, collectedKurus: 1000, collectedForMonthKurus: 0, ratePct: 0 }])
    expect(client.rpc).toHaveBeenCalledWith('report_monthly', { p_site: 's1', p_from: '2026-10-01', p_to: '2026-11-01' })
  })
  it('debts: a limit, or null for all', async () => {
    client.rpc.mockResolvedValue({ data: [], error: null })
    await fetchDebts('s1', 10)
    await fetchDebts('s1', null)
    expect(client.rpc.mock.calls).toEqual([['report_debts', { p_site: 's1', p_limit: 10 }], ['report_debts', { p_site: 's1', p_limit: null }]])
  })
  it('debts: reads the aging columns', async () => {
    client.rpc.mockResolvedValue({
      data: [{ unit_id: 'u1', block_name: 'A Blok', door_no: '1', unit_label: 'A Blok · 1', owners: 'M', phone: null, balance: 323, not_due: 220, d1_30: 3, d31_60: 12, d61_90: 48, d90_plus: 40 }],
      error: null,
    })
    expect((await fetchDebts('s1', null))[0]).toMatchObject({ balanceKurus: 32300, notDueKurus: 22000, d1to30Kurus: 300, d31to60Kurus: 1200, d61to90Kurus: 4800, over90Kurus: 4000, phone: null })
  })
  it('collections and their summary', async () => {
    client.rpc.mockResolvedValueOnce({ data: [{ payment_id: 'p', paid_at: '2026-11-23T11:00:00Z', receipt_no: 'MKB-2026-000001', unit_label: 'A Blok · 1', payer_name: 'M', method: 'cash', amount: 24, fee: 0 }], error: null })
    expect((await fetchCollections('s1', '2026-11-01', '2026-11-30', null))[0]).toMatchObject({ amountKurus: 2400, feeKurus: 0, receiptNo: 'MKB-2026-000001' })
    expect(client.rpc).toHaveBeenLastCalledWith('report_collections', { p_site: 's1', p_from: '2026-11-01', p_to: '2026-11-30', p_limit: null })
    client.rpc.mockResolvedValueOnce({ data: [{ method: 'cash', payment_count: 2, amount: 29, fee: 0 }, { method: null, payment_count: 3, amount: 39, fee: 0 }], error: null })
    expect(await fetchCollectionsSummary('s1', '2026-11-01', '2026-11-30')).toEqual([
      { method: 'cash', count: 2, amountKurus: 2900, feeKurus: 0 },
      { method: null, count: 3, amountKurus: 3900, feeKurus: 0 },
    ])
  })
  it('residents and attendance', async () => {
    client.rpc.mockResolvedValueOnce({ data: [{ unit_id: 'u', block_name: 'A', door_no: '1', floor: 1, gross_m2: 90, land_share: 100, relation: 'owner', full_name: 'M', phone: null, email: null, start_date: '2025-01-01', is_active: true }], error: null })
    expect((await fetchResidentReport('s1'))[0]).toMatchObject({ doorNo: '1', relation: 'owner', isActive: true, startDate: '2025-01-01' })
    client.rpc.mockResolvedValueOnce({ data: [{ unit_id: 'u', block_name: 'A', door_no: '1', owners: null, land_share: 100, share_pct: 33.3333, total_land_share: 300, unit_count: 3 }], error: null })
    expect((await fetchAttendance('s1'))[0]).toEqual({ unitId: 'u', blockName: 'A', doorNo: '1', owners: null, landShare: 100, sharePct: 33.3333, totalLandShare: 300, unitCount: 3 })
  })
  it('every report throws what the database says', async () => {
    client.rpc.mockResolvedValue({ data: null, error: { message: 'range_invalid' } })
    for (const call of [() => fetchMonthly('s', 'a', 'b'), () => fetchDebts('s', null), () => fetchCollections('s', 'a', 'b', null), () => fetchCollectionsSummary('s', 'a', 'b'), () => fetchResidentReport('s'), () => fetchAttendance('s')]) {
      await expect(call()).rejects.toMatchObject({ message: 'range_invalid' })
    }
  })
})

describe('reportErrorMessage', () => {
  it('explains a bad range, a refusal, and anything else calmly', () => {
    expect(reportErrorMessage({ message: 'range_invalid' })).toMatch(/Tarih aralığı/)
    expect(reportErrorMessage({ code: '42501' })).toBe('Bu rapor için yetkiniz yok.')
    for (const odd of [null, undefined, {}, { message: 'boom' }, 'x']) expect(reportErrorMessage(odd)).toMatch(/hazırlanamadı/)
  })
})
