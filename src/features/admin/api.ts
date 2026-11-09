import { FunctionsHttpError } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import type { GeneratedUnit } from './lib/bulk-units'
import type { ChargeTarget, SplitMethod } from './lib/charges'
import { compareDoorNo } from './lib/door-no'
import { toKurus } from '@/lib/money'

// Everything the admin pages ask Supabase. Row Level Security decides what an admin may see:
// these functions never filter for permission, they only ask. (Plan, section 9.)

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export interface AdminSite {
  id: string
  name: string
  /** Charge types belong to the company, not to the site. */
  companyId: string
}

/** The sites this person ADMINISTERS. (The sites table also lists sibling sites of the company.) */
export async function fetchAdminSites(userId: string): Promise<AdminSite[]> {
  const { data, error } = await client()
    .from('site_members')
    .select('role, sites!inner(id, name, company_id)')
    .eq('profile_id', userId)
    .eq('role', 'admin')
  if (error) throw error
  return data
    .map((row) => ({ id: row.sites.id, name: row.sites.name, companyId: row.sites.company_id }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------
export interface BlockRow {
  id: string
  name: string
}

export async function fetchBlocks(siteId: string): Promise<BlockRow[]> {
  const { data, error } = await client().from('blocks').select('id, name').eq('site_id', siteId)
  if (error) throw error
  return data.sort((a, b) => compareDoorNo(a.name, b.name))
}

export async function createBlock(siteId: string, name: string): Promise<void> {
  const { error } = await client().from('blocks').insert({ site_id: siteId, name })
  if (error) throw error
}

export async function renameBlock(blockId: string, name: string): Promise<void> {
  const { error } = await client().from('blocks').update({ name }).eq('id', blockId)
  if (error) throw error
}

export async function deleteBlock(blockId: string): Promise<void> {
  const { error } = await client().from('blocks').delete().eq('id', blockId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------
export interface ResidencyRef {
  id: string
  relation: 'owner' | 'tenant'
  startDate: string
  endDate: string | null
  profileId: string
  fullName: string | null
  email: string | null
}

export interface UnitRow {
  id: string
  blockId: string
  doorNo: string
  floor: number | null
  type: string
  grossM2: number | null
  landShare: number | null
  status: string
  residencies: ResidencyRef[]
}

/** Active (not archived) units of a site, with everyone who ever lived there. */
export async function fetchUnits(siteId: string): Promise<UnitRow[]> {
  const { data, error } = await client()
    .from('units')
    // One single string on purpose: the Supabase types read the column list from the literal text.
    .select('id, block_id, door_no, floor, type, gross_m2, land_share, status, blocks!inner(site_id), unit_residents(id, relation, start_date, end_date, profile_id, profiles(id, full_name, email))')
    .eq('blocks.site_id', siteId)
    .is('archived_at', null)
  if (error) throw error
  return data
    .map((unit) => ({
      id: unit.id,
      blockId: unit.block_id,
      doorNo: unit.door_no,
      floor: unit.floor,
      type: unit.type,
      grossM2: unit.gross_m2,
      landShare: unit.land_share,
      status: unit.status,
      residencies: unit.unit_residents.map((r) => ({
        id: r.id,
        relation: r.relation as 'owner' | 'tenant',
        startDate: r.start_date,
        endDate: r.end_date,
        profileId: r.profile_id,
        fullName: r.profiles?.full_name ?? null,
        email: r.profiles?.email ?? null,
      })),
    }))
    .sort((a, b) => compareDoorNo(a.doorNo, b.doorNo))
}

type UnitInsert = Database['public']['Tables']['units']['Insert']

export async function createUnit(row: UnitInsert): Promise<void> {
  const { error } = await client().from('units').insert(row)
  if (error) throw error
}

export async function updateUnit(unitId: string, row: UnitInsert): Promise<void> {
  const { error } = await client().from('units').update(row).eq('id', unitId)
  if (error) throw error
}

/** The database refuses this while the unit has current residents (trigger in 0002). */
export async function archiveUnit(unitId: string): Promise<void> {
  const { error } = await client().from('units').update({ archived_at: new Date().toISOString() }).eq('id', unitId)
  if (error) throw error
}

/** One request = one all-or-nothing database statement: either every unit is created or none. */
export async function createUnitsBulk(
  blockId: string,
  generated: GeneratedUnit[],
  shared: Pick<UnitInsert, 'type' | 'gross_m2' | 'land_share'>,
): Promise<void> {
  const rows: UnitInsert[] = generated.map((unit) => ({ block_id: blockId, door_no: unit.door_no, floor: unit.floor, ...shared }))
  const { error } = await client().from('units').insert(rows)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Residents
// ---------------------------------------------------------------------------
export interface ResidentRow {
  residencyId: string
  relation: 'owner' | 'tenant'
  startDate: string
  endDate: string | null
  unitId: string
  doorNo: string
  blockName: string
  profileId: string
  fullName: string | null
  email: string | null
  phone: string | null
  isActive: boolean
  /** Null until the person finished the invite page (the page records the KVKK consent last). */
  kvkkConsentAt: string | null
}

export async function fetchResidents(siteId: string): Promise<ResidentRow[]> {
  const { data, error } = await client()
    .from('unit_residents')
    .select('id, relation, start_date, end_date, unit_id, profile_id, profiles!inner(id, full_name, email, phone, is_active, kvkk_consent_at), units!inner(id, door_no, archived_at, blocks!inner(id, name, site_id))')
    .eq('units.blocks.site_id', siteId)
  if (error) throw error
  return data
    .map((row) => ({
      residencyId: row.id,
      relation: row.relation as 'owner' | 'tenant',
      startDate: row.start_date,
      endDate: row.end_date,
      unitId: row.unit_id,
      doorNo: row.units.door_no,
      blockName: row.units.blocks.name,
      profileId: row.profile_id,
      fullName: row.profiles.full_name,
      email: row.profiles.email,
      phone: row.profiles.phone,
      isActive: row.profiles.is_active,
      kvkkConsentAt: row.profiles.kvkk_consent_at,
    }))
    .sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? '', 'tr'))
}

export async function updateProfileContact(profileId: string, values: { full_name: string; phone: string | null }): Promise<void> {
  const { error } = await client().from('profiles').update(values).eq('id', profileId)
  if (error) throw error
}

/** Correct the move-in date. For a tenant it decides which charge lines they can see (migration 0004). */
export async function updateResidencyStart(residencyId: string, startDate: string): Promise<void> {
  const { error } = await client().from('unit_residents').update({ start_date: startDate }).eq('id', residencyId)
  if (error) throw error
}

/** "Taşındı": the residency ends on this day (a Postgres date, YYYY-MM-DD). */
export async function endResidency(residencyId: string, endDate: string): Promise<void> {
  const { error } = await client().from('unit_residents').update({ end_date: endDate }).eq('id', residencyId)
  if (error) throw error
}

/** "Daireden çıkar": removes the row. For people who moved out, prefer endResidency (keeps history). */
export async function deleteResidency(residencyId: string): Promise<void> {
  const { error } = await client().from('unit_residents').delete().eq('id', residencyId)
  if (error) throw error
}

export async function setProfileActive(profileId: string, active: boolean): Promise<void> {
  const { error } = await client().rpc('set_profile_active', { p_profile: profileId, p_active: active })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// The invite function (runs on the server: it needs the secret key)
// ---------------------------------------------------------------------------
export interface InviteInput {
  email: string
  fullName: string
  phone: string
  unitId: string
  relation: 'owner' | 'tenant'
  startDate: string
}

export type InviteResult =
  | { ok: true; status: 'invited' | 'linked' | 'link'; profileId: string; link: string | null }
  | { ok: false; error: string }

async function callInviteFunction(body: Record<string, unknown>): Promise<InviteResult> {
  try {
    const { data, error } = await client().functions.invoke('invite-resident', { body })
    if (error) {
      // An HTTP error answer carries our JSON { ok: false, error: "<code>" } in its body.
      if (error instanceof FunctionsHttpError) {
        const answer = await error.context.json().catch(() => null)
        return { ok: false, error: typeof answer?.error === 'string' ? answer.error : 'failed' }
      }
      return { ok: false, error: 'failed' }
    }
    return data as InviteResult
  } catch {
    return { ok: false, error: 'failed' }
  }
}

export const inviteResident = (input: InviteInput) => callInviteFunction({ action: 'invite', ...input })
export const requestSignInLink = (profileId: string) => callInviteFunction({ action: 'link', profileId })

/** Turkish messages for the codes the function can answer with. */
export const inviteErrorMessages: Record<string, string> = {
  forbidden: 'Bu işlem için yetkiniz yok.',
  unit_not_found: 'Bu daire bulunamadı ya da arşivlenmiş.',
  already_linked: 'Bu kişi bu dairede zaten aynı ilişkiyle kayıtlı.',
  email_in_use_elsewhere: 'Bu e-posta adresi başka bir hesapta kullanılıyor. Lütfen farklı bir adres deneyin.',
  account_inactive: 'Bu kişinin hesabı devre dışı. Önce hesabı yeniden etkinleştirin.',
  already_active: 'Bu kişi hesabını zaten etkinleştirmiş. Şifresini kendisi e-posta ile yenileyebilir.',
  invalid_request: 'Girilen bilgiler geçerli değil. Lütfen kontrol edin.',
  origin_not_allowed: 'Bu adresten davet gönderilemez.',
  failed: 'İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.',
}
export const inviteErrorMessage = (code: string) => inviteErrorMessages[code] ?? inviteErrorMessages.failed

// ---------------------------------------------------------------------------
// Charges (Borçlandırma). All money maths happens in the database (plan, section 9):
// the browser sends "how much" and "how to split" and shows what the database answers.
// Amounts travel as whole kuruş. Reads arrive as numeric(12,2) JSON numbers -> toKurus().
// ---------------------------------------------------------------------------
/**
 * The generated types call every function argument "not null". Our functions accept null for the
 * optional ones, and PostgREST needs the key to be PRESENT (an omitted key means "no such function").
 * So we send an explicit null and tell TypeScript it is fine.
 */
const nullable = (value: string | null) => value as string

export interface ChargeTypeRow {
  id: string
  code: string
  name: string
  tenantVisibleDefault: boolean
  defaultSplit: SplitMethod
}

export async function fetchChargeTypes(companyId: string): Promise<ChargeTypeRow[]> {
  const { data, error } = await client()
    .from('charge_types')
    .select('id, code, name, tenant_visible_default, default_split, sort_order')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('sort_order')
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    tenantVisibleDefault: row.tenant_visible_default,
    defaultSplit: row.default_split as SplitMethod,
  }))
}

export interface ChargeRow {
  id: string
  unitId: string
  blockId: string
  blockName: string
  doorNo: string
  typeId: string
  typeName: string
  batchId: string
  period: string | null
  description: string | null
  amountKurus: number
  dueDate: string
  tenantVisible: boolean
  createdAt: string
  voidedAt: string | null
  voidReason: string | null
}

export interface ChargeFilters {
  /** First day of a month ("2026-11-01"), or null for every month. */
  period: string | null
  typeId: string | null
  blockId: string | null
}

export const CHARGE_LIST_LIMIT = 1000

export async function fetchCharges(siteId: string, filters: ChargeFilters): Promise<{ rows: ChargeRow[]; truncated: boolean }> {
  let query = client()
    .from('charges')
    // One single string on purpose: the Supabase types read the column list from the literal text.
    .select('id, unit_id, charge_type_id, batch_id, period, description, amount, due_date, tenant_visible, created_at, voided_at, void_reason, units!inner(door_no, block_id, blocks!inner(name, site_id)), charge_types(name)')
    .eq('units.blocks.site_id', siteId)
  if (filters.period) query = query.eq('period', filters.period)
  if (filters.typeId) query = query.eq('charge_type_id', filters.typeId)
  if (filters.blockId) query = query.eq('units.block_id', filters.blockId)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(CHARGE_LIST_LIMIT)
  if (error) throw error
  const rows = data
    .map((row) => ({
      id: row.id,
      unitId: row.unit_id,
      blockId: row.units.block_id,
      blockName: row.units.blocks.name,
      doorNo: row.units.door_no,
      typeId: row.charge_type_id,
      typeName: row.charge_types?.name ?? '—',
      batchId: row.batch_id,
      period: row.period,
      description: row.description,
      amountKurus: toKurus(row.amount),
      dueDate: row.due_date,
      tenantVisible: row.tenant_visible,
      createdAt: row.created_at,
      voidedAt: row.voided_at,
      voidReason: row.void_reason,
    }))
    .sort((a, b) => a.blockName.localeCompare(b.blockName, 'tr') || compareDoorNo(a.doorNo, b.doorNo) || b.createdAt.localeCompare(a.createdAt))
  return { rows, truncated: data.length >= CHARGE_LIST_LIMIT }
}

export interface BatchRow {
  id: string
  typeName: string
  period: string | null
  dueDate: string
  description: string | null
  target: unknown
  splitMethod: SplitMethod
  amountKurus: number
  unitCount: number
  totalKurus: number
  createdAt: string
  voidedAt: string | null
  voidReason: string | null
  planId: string | null
  /** Lines of this batch that are not cancelled, and their sum (from the database view). */
  activeCount: number
  activeTotalKurus: number
}

export async function fetchBatches(siteId: string): Promise<BatchRow[]> {
  const [batches, summaries] = await Promise.all([
    client()
      .from('charge_batches')
      .select('id, period, due_date, description, target, split_method, amount, unit_count, total, created_at, voided_at, void_reason, recurring_plan_id, charge_types(name)')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(500),
    client().from('charge_batch_summary').select('batch_id, active_count, active_total').eq('site_id', siteId),
  ])
  if (batches.error) throw batches.error
  if (summaries.error) throw summaries.error
  const summary = new Map(summaries.data.map((row) => [row.batch_id, row]))
  return batches.data.map((row) => ({
    id: row.id,
    typeName: row.charge_types?.name ?? '—',
    period: row.period,
    dueDate: row.due_date,
    description: row.description,
    target: row.target,
    splitMethod: row.split_method as SplitMethod,
    amountKurus: toKurus(row.amount),
    unitCount: row.unit_count,
    totalKurus: toKurus(row.total),
    createdAt: row.created_at,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    planId: row.recurring_plan_id,
    activeCount: summary.get(row.id)?.active_count ?? 0,
    activeTotalKurus: toKurus(summary.get(row.id)?.active_total ?? 0),
  }))
}

export interface PlanRow {
  id: string
  name: string
  typeId: string
  typeName: string
  amountKurus: number
  splitMethod: SplitMethod
  dayOfMonth: number
  target: unknown
  tenantVisible: boolean
  description: string | null
  active: boolean
  kararNo: string | null
  kararDate: string | null
}

export async function fetchPlans(siteId: string): Promise<PlanRow[]> {
  const { data, error } = await client()
    .from('recurring_plans')
    .select('id, name, charge_type_id, amount, split_method, day_of_month, target, tenant_visible, description, active, karar_no, karar_date, charge_types(name)')
    .eq('site_id', siteId)
    .order('created_at')
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    typeId: row.charge_type_id,
    typeName: row.charge_types?.name ?? '—',
    amountKurus: toKurus(row.amount),
    splitMethod: row.split_method as SplitMethod,
    dayOfMonth: row.day_of_month,
    target: row.target,
    tenantVisible: row.tenant_visible,
    description: row.description,
    active: row.active,
    kararNo: row.karar_no,
    kararDate: row.karar_date,
  }))
}

export interface PreviewLine {
  unitId: string
  blockName: string
  doorNo: string
  /** Arsa payı or m², only for the methods that use one. */
  weight: number | null
  amountKurus: number
}

export interface PreviewInput {
  siteId: string
  target: ChargeTarget
  split: SplitMethod
  amountKurus: number
}

/** The lines a bulk charge WOULD create. Writes nothing. The database does the splitting. */
export async function previewCharge(input: PreviewInput): Promise<PreviewLine[]> {
  const { data, error } = await client().rpc('preview_charge_batch', {
    p_site: input.siteId,
    p_target: input.target as unknown as Json,
    p_split: input.split,
    p_amount_kurus: input.amountKurus,
  })
  if (error) throw error
  return data.map((row) => ({
    unitId: row.unit_id,
    blockName: row.block_name,
    doorNo: row.door_no,
    weight: row.weight,
    amountKurus: row.amount_kurus,
  }))
}

export interface CreateBatchInput extends PreviewInput {
  /** A fresh random id per confirm screen: a double click or a retry cannot charge twice. */
  requestId: string
  chargeTypeId: string
  period: string
  dueDate: string
  description: string | null
  tenantVisible: boolean
  kararNo: string | null
  kararDate: string | null
  /** The number of lines and the total of the preview the admin looked at. */
  expectedUnits: number
  expectedKurus: number
}

/** Creates a bulk charge, or a single one (a target of one unit with the split "per_unit"). Returns the batch id. */
export async function createChargeBatch(input: CreateBatchInput): Promise<string> {
  const { data, error } = await client().rpc('create_charge_batch', {
    p_request_id: input.requestId,
    p_site: input.siteId,
    p_target: input.target as unknown as Json,
    p_split: input.split,
    p_amount_kurus: input.amountKurus,
    p_charge_type: input.chargeTypeId,
    p_period: input.period,
    p_due_date: input.dueDate,
    p_description: nullable(input.description),
    p_tenant_visible: input.tenantVisible,
    p_karar_no: nullable(input.kararNo),
    p_karar_date: nullable(input.kararDate),
    p_expected_units: input.expectedUnits,
    p_expected_kurus: input.expectedKurus,
  })
  if (error) throw error
  return data
}

export interface ChargeEdit {
  amountKurus: number
  dueDate: string
  description: string | null
  tenantVisible: boolean
}

/** Allowed for an active line. The database refuses a cancelled one. */
export async function updateCharge(chargeId: string, edit: ChargeEdit): Promise<void> {
  const { error } = await client()
    .from('charges')
    // kuruş / 100 prints as the exact decimal text (for example 696.9), so no digit is lost.
    .update({ amount: edit.amountKurus / 100, due_date: edit.dueDate, description: edit.description, tenant_visible: edit.tenantVisible })
    .eq('id', chargeId)
  if (error) throw error
}

export async function voidCharge(chargeId: string, reason: string): Promise<void> {
  const { error } = await client().rpc('void_charge', { p_charge: chargeId, p_reason: reason })
  if (error) throw error
}

export async function voidChargeBatch(batchId: string, reason: string): Promise<void> {
  const { error } = await client().rpc('void_charge_batch', { p_batch: batchId, p_reason: reason })
  if (error) throw error
}

export async function deleteChargeBatch(batchId: string): Promise<void> {
  const { error } = await client().rpc('delete_charge_batch', { p_batch: batchId })
  if (error) throw error
}

export interface SavePlanInput {
  /** Null creates a new plan. */
  id: string | null
  siteId: string
  name: string
  chargeTypeId: string
  amountKurus: number
  split: SplitMethod
  dayOfMonth: number
  target: ChargeTarget
  tenantVisible: boolean
  description: string | null
  kararNo: string | null
  kararDate: string | null
}

export async function savePlan(input: SavePlanInput): Promise<string> {
  const { data, error } = await client().rpc('save_recurring_plan', {
    p_id: nullable(input.id),
    p_site: input.siteId,
    p_name: input.name,
    p_charge_type: input.chargeTypeId,
    p_amount_kurus: input.amountKurus,
    p_split: input.split,
    p_day: input.dayOfMonth,
    p_target: input.target as unknown as Json,
    p_tenant_visible: input.tenantVisible,
    p_description: nullable(input.description),
    p_karar_no: nullable(input.kararNo),
    p_karar_date: nullable(input.kararDate),
  })
  if (error) throw error
  return data
}

export async function setPlanActive(planId: string, active: boolean): Promise<void> {
  const { error } = await client().rpc('set_recurring_plan_active', { p_plan: planId, p_active: active })
  if (error) throw error
}

/** "Bu ayı oluştur": this month's batch for a plan. Returns the batch id. */
export async function generatePlan(planId: string): Promise<string> {
  const { data, error } = await client().rpc('generate_recurring_batch', { p_plan: planId })
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Friendly messages for database errors (mutations above throw the Supabase error)
// ---------------------------------------------------------------------------
export function describeDbError(error: unknown): string {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  if (message === 'unit has charges') return 'Bu dairenin borç kaydı var, arşivlenemez. Önce borçları iptal edin.'
  switch (code) {
    case '23505':
      return 'Bu kayıt zaten var (aynı kapı numarası ya da blok adı).'
    case '23503':
      return 'Bu kayıt başka kayıtlarla bağlantılı olduğu için silinemez.'
    case '23514':
      return 'Bu işlem yapılamaz: daire hâlâ güncel sakinlere sahip ya da girilen değer geçersiz.'
    case '42501':
      return 'Bu işlem için yetkiniz yok.'
    default:
      return 'İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.'
  }
}
