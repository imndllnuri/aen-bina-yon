import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, stubQuery } from '@/test/query-stub'
import { deleteChargeType, fetchAllChargeTypes, fetchCompany, readRules, rulesPayload, saveChargeType, saveCompanyInfo, saveRules } from './api'
import { settingsErrorMessage } from './lib/messages'

const client = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: client }))
beforeEach(() => {
  client.from.mockReset()
  client.rpc.mockReset()
})

describe('readRules', () => {
  it('gives the defaults for a company that never saved anything', () => {
    for (const empty of [{}, null, undefined, 'x', 5, []]) {
      expect(readRules(empty)).toEqual({ dueDay: 15, ydoRate: 25.49, lateFeeRate: 5, lateFeeMethod: 'daily', graceDays: 0, commissionPayer: 'management', fee: { 2: null, 3: null, 6: null, 9: null } })
    }
  })
  it('reads what was saved', () => {
    const settings = {
      payment_mode: 'mock', ydo_rate: 12.35, payment: { commission_payer: 'resident', fee_pct: { '2': 2.5, '3': '3.46', '9': 0 } },
      rules: { due_day: 20, late_fee_rate: 4, late_fee_method: 'monthly', grace_days: 7 },
    }
    expect(readRules(settings)).toEqual({ dueDay: 20, ydoRate: 12.35, lateFeeRate: 4, lateFeeMethod: 'monthly', graceDays: 7, commissionPayer: 'resident', fee: { 2: 2.5, 3: 3.46, 6: null, 9: 0 } })
  })
  it('falls back to the default for a broken value instead of crashing', () => {
    const r = readRules({ ydo_rate: 'abc', payment: { commission_payer: 'nobody', fee_pct: 'x' }, rules: { due_day: 99, late_fee_method: 'weekly', grace_days: null } })
    expect(r).toMatchObject({ dueDay: 15, ydoRate: 25.49, commissionPayer: 'management', lateFeeMethod: 'daily', graceDays: 0 })
    expect(r.fee).toEqual({ 2: null, 3: null, 6: null, 9: null })
    expect(readRules({ rules: { due_day: 1.5 } }).dueDay).toBe(15)
  })
})

describe('rulesPayload (the form text as the numbers the database wants)', () => {
  const values = { dueDay: '20', ydoRate: '12,35', lateFeeRate: '5', lateFeeMethod: 'monthly' as const, graceDays: '7', commissionPayer: 'resident' as const, fee2: '2,5', fee3: '', fee6: ' ', fee9: '0' }
  it('turns comma numbers into numbers and leaves out an empty fee', () => {
    expect(rulesPayload(values)).toEqual({
      p_ydo_rate: 12.35, p_commission_payer: 'resident', p_fee_pct: { '2': 2.5, '9': 0 }, p_due_day: 20, p_late_fee_rate: 5, p_late_fee_method: 'monthly', p_grace_days: 7,
    })
  })
  it('sends an empty list of fees for "management pays"', () => {
    expect(rulesPayload({ ...values, commissionPayer: 'management', fee2: '', fee9: '' }).p_fee_pct).toEqual({})
  })
})

describe('the calls', () => {
  it('fetchCompany reads one company and its rules', async () => {
    const q = stubQuery({ data: { id: 'c1', name: 'Firma', phone: null, email: null, address: null, tax_no: '1', settings: { rules: { due_day: 10 } } } })
    client.from.mockReturnValue(q.query)
    expect(await fetchCompany('c1')).toMatchObject({ id: 'c1', name: 'Firma', taxNo: '1', rules: { dueDay: 10 } })
    expect(client.from).toHaveBeenCalledWith('companies')
    expect(callsTo(q.calls, 'eq')).toEqual([['id', 'c1']])
  })
  it('fetchCompany throws when there is no company', async () => {
    client.from.mockReturnValue(stubQuery({ data: null }).query)
    await expect(fetchCompany('c1')).rejects.toThrow('company not found')
  })
  it('saveCompanyInfo writes empty texts as null and never touches the settings', async () => {
    const q = stubQuery({ data: [{ id: 'c1' }] })
    client.from.mockReturnValue(q.query)
    await saveCompanyInfo('c1', { name: ' Firma ', phone: '', email: ' a@b.com ', address: '', taxNo: '' })
    expect(callsTo(q.calls, 'update')).toEqual([[{ name: 'Firma', phone: null, email: 'a@b.com', address: null, tax_no: null }]])
    expect(Object.keys((callsTo(q.calls, 'update')[0]?.[0] as object))).not.toContain('settings')
  })
  it('saveCompanyInfo says "not allowed" when row security changed nothing', async () => {
    client.from.mockReturnValue(stubQuery({ data: [] }).query)
    await expect(saveCompanyInfo('c1', { name: 'F', phone: '', email: '', address: '', taxNo: '' })).rejects.toMatchObject({ code: '42501' })
  })
  it('saveRules calls the checked function with the company and every value', async () => {
    client.rpc.mockResolvedValue({ data: null, error: null })
    await saveRules('c1', { dueDay: '15', ydoRate: '25,49', lateFeeRate: '5', lateFeeMethod: 'daily', graceDays: '0', commissionPayer: 'management', fee2: '', fee3: '', fee6: '', fee9: '' })
    expect(client.rpc).toHaveBeenCalledWith('save_company_settings', {
      p_company: 'c1', p_ydo_rate: 25.49, p_commission_payer: 'management', p_fee_pct: {}, p_due_day: 15, p_late_fee_rate: 5, p_late_fee_method: 'daily', p_grace_days: 0,
    })
  })
  it('the charge type calls use the right names, and a new type sends a null id', async () => {
    client.rpc.mockResolvedValue({ data: null, error: null })
    await saveChargeType('c1', null, { name: 'Çatı', split: 'equal', tenantVisible: false, active: true, sort: '7' })
    await saveChargeType('c1', 't1', { name: 'Çatı', split: 'gross_m2', tenantVisible: true, active: false, sort: '3' })
    await deleteChargeType('t1')
    expect(client.rpc.mock.calls).toEqual([
      ['save_charge_type', { p_company: 'c1', p_id: null, p_name: 'Çatı', p_tenant_visible: false, p_split: 'equal', p_active: true, p_sort: 7 }],
      ['save_charge_type', { p_company: 'c1', p_id: 't1', p_name: 'Çatı', p_tenant_visible: true, p_split: 'gross_m2', p_active: false, p_sort: 3 }],
      ['delete_charge_type', { p_id: 't1' }],
    ])
  })
  it('fetchAllChargeTypes lists the switched-off ones too, in order', async () => {
    const q = stubQuery({ data: [{ id: 't1', code: 'aidat', name: 'Aidat', tenant_visible_default: true, default_split: 'per_unit', active: false, sort_order: 1 }] })
    client.from.mockReturnValue(q.query)
    expect(await fetchAllChargeTypes('c1')).toEqual([{ id: 't1', code: 'aidat', name: 'Aidat', tenantVisibleDefault: true, defaultSplit: 'per_unit', active: false, sortOrder: 1 }])
    expect(callsTo(q.calls, 'eq')).toEqual([['company_id', 'c1']]) // no filter on "active"
    expect(callsTo(q.calls, 'order')).toEqual([['sort_order'], ['name']])
  })
  it('every change throws what the database says', async () => {
    client.rpc.mockResolvedValue({ data: null, error: { message: 'type_in_use' } })
    await expect(deleteChargeType('t1')).rejects.toMatchObject({ message: 'type_in_use' })
    await expect(saveRules('c1', { dueDay: '15', ydoRate: '25', lateFeeRate: '5', lateFeeMethod: 'daily', graceDays: '0', commissionPayer: 'management', fee2: '', fee3: '', fee6: '', fee9: '' })).rejects.toMatchObject({ message: 'type_in_use' })
  })
})

describe('settingsErrorMessage', () => {
  const codes = ['ydo_invalid', 'commission_invalid', 'fee_invalid', 'due_day_invalid', 'late_fee_invalid', 'late_fee_method_invalid', 'grace_invalid', 'name_invalid', 'name_used', 'split_invalid', 'type_in_active_plan', 'type_protected', 'type_in_use']
  it('has its own Turkish sentence for every code the database can raise', () => {
    const messages = codes.map((message) => settingsErrorMessage({ message }))
    expect(new Set(messages).size).toBe(codes.length)
    for (const m of messages) expect(m).not.toMatch(/_/)
  })
  it('says "no permission" for a refusal, and something calm for anything else', () => {
    expect(settingsErrorMessage({ code: '42501' })).toBe('Bu işlem için yetkiniz yok.')
    expect(settingsErrorMessage({ message: 'not allowed' })).toBe('Bu işlem için yetkiniz yok.')
    expect(settingsErrorMessage({ code: '23514' })).toMatch(/geçersiz/)
    for (const odd of [null, undefined, {}, { message: 'boom' }, { message: 'invalid_request' }]) expect(settingsErrorMessage(odd)).toMatch(/şu anda yapılamadı/)
  })
})
