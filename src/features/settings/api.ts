import { supabase } from '@/lib/supabase'
import type { CompanyValues, ChargeTypeValues, RulesValues } from './lib/schemas'
import { parseDecimal } from './lib/schemas'

// Everything the Ayarlar screen asks Supabase. Company information is changed directly (the database checks who and how long
// the texts may be); the rules go through one checked function that keeps the safety switch and the bank accounts untouched.

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export interface Rules {
  dueDay: number
  ydoRate: number
  lateFeeRate: number
  lateFeeMethod: 'daily' | 'monthly'
  graceDays: number
  commissionPayer: 'management' | 'resident'
  /** The fee in percent for 2, 3, 6 and 9 installments; null = no fee. */
  fee: { 2: number | null; 3: number | null; 6: number | null; 9: number | null }
}

export interface CompanyView {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  taxNo: string | null
  rules: Rules
}

export const DEFAULT_DUE_DAY = 15
export const DEFAULT_YDO = 25.49

const num = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return null
}

/** The settings of a company with a default for everything that was never saved. Unknown or broken values fall back to the default. */
export function readRules(settings: unknown): Rules {
  const s = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>
  const payment = (s.payment && typeof s.payment === 'object' ? s.payment : {}) as Record<string, unknown>
  const rules = (s.rules && typeof s.rules === 'object' ? s.rules : {}) as Record<string, unknown>
  const fee = (payment.fee_pct && typeof payment.fee_pct === 'object' ? payment.fee_pct : {}) as Record<string, unknown>
  const day = num(rules.due_day)
  return {
    dueDay: day !== null && Number.isInteger(day) && day >= 1 && day <= 28 ? day : DEFAULT_DUE_DAY,
    ydoRate: num(s.ydo_rate) ?? DEFAULT_YDO,
    lateFeeRate: num(rules.late_fee_rate) ?? 5,
    lateFeeMethod: rules.late_fee_method === 'monthly' ? 'monthly' : 'daily',
    graceDays: num(rules.grace_days) ?? 0,
    commissionPayer: payment.commission_payer === 'resident' ? 'resident' : 'management',
    fee: { 2: num(fee['2']), 3: num(fee['3']), 6: num(fee['6']), 9: num(fee['9']) },
  }
}

export async function fetchCompany(companyId: string): Promise<CompanyView> {
  const { data, error } = await client().from('companies').select('id, name, phone, email, address, tax_no, settings').eq('id', companyId).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('company not found')
  return { id: data.id, name: data.name, phone: data.phone, email: data.email, address: data.address, taxNo: data.tax_no, rules: readRules(data.settings) }
}

export async function saveCompanyInfo(companyId: string, values: CompanyValues): Promise<void> {
  const blank = (text: string) => (text.trim() === '' ? null : text.trim())
  const { data, error } = await client()
    .from('companies')
    .update({ name: values.name.trim(), phone: blank(values.phone), email: blank(values.email), address: blank(values.address), tax_no: blank(values.taxNo) })
    .eq('id', companyId)
    .select('id')
  if (error) throw error
  // row security shows "nothing changed" instead of an error when the person is no admin of this company
  if (data.length === 0) throw Object.assign(new Error('not allowed'), { code: '42501' })
}

/** The form's texts as the numbers the database function wants. */
export function rulesPayload(values: RulesValues) {
  const fee: Record<string, number> = {}
  for (const [key, text] of [['2', values.fee2], ['3', values.fee3], ['6', values.fee6], ['9', values.fee9]] as const) {
    const n = text.trim() === '' ? null : parseDecimal(text)
    if (n !== null) fee[key] = n
  }
  return {
    p_ydo_rate: parseDecimal(values.ydoRate) as number,
    p_commission_payer: values.commissionPayer,
    p_fee_pct: fee,
    p_due_day: Number(values.dueDay),
    p_late_fee_rate: parseDecimal(values.lateFeeRate) as number,
    p_late_fee_method: values.lateFeeMethod,
    p_grace_days: Number(values.graceDays),
  }
}

export async function saveRules(companyId: string, values: RulesValues): Promise<void> {
  const { error } = await client().rpc('save_company_settings', { p_company: companyId, ...rulesPayload(values) })
  if (error) throw error
}

export interface ChargeTypeRow {
  id: string
  code: string
  name: string
  tenantVisibleDefault: boolean
  defaultSplit: string
  active: boolean
  sortOrder: number
}

/** Every type of the company, switched-off ones too (the wizard lists only the active ones). */
export async function fetchAllChargeTypes(companyId: string): Promise<ChargeTypeRow[]> {
  const { data, error } = await client()
    .from('charge_types')
    .select('id, code, name, tenant_visible_default, default_split, active, sort_order')
    .eq('company_id', companyId)
    .order('sort_order')
    .order('name')
  if (error) throw error
  return data.map((row) => ({ id: row.id, code: row.code, name: row.name, tenantVisibleDefault: row.tenant_visible_default, defaultSplit: row.default_split, active: row.active, sortOrder: row.sort_order }))
}

export async function saveChargeType(companyId: string, id: string | null, values: ChargeTypeValues): Promise<void> {
  const { error } = await client().rpc('save_charge_type', {
    p_company: companyId,
    p_id: id as string,
    p_name: values.name,
    p_tenant_visible: values.tenantVisible,
    p_split: values.split,
    p_active: values.active,
    p_sort: Number(values.sort),
  })
  if (error) throw error
}

export async function deleteChargeType(id: string): Promise<void> {
  const { error } = await client().rpc('delete_charge_type', { p_id: id })
  if (error) throw error
}
