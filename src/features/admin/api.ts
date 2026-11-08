import { FunctionsHttpError } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import type { GeneratedUnit } from './lib/bulk-units'
import { compareDoorNo } from './lib/door-no'

// Everything the admin pages ask Supabase. Row Level Security decides what an admin may see:
// these functions never filter for permission, they only ask. (Plan, section 9.)

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export interface AdminSite {
  id: string
  name: string
}

/** The sites this person ADMINISTERS. (The sites table also lists sibling sites of the company.) */
export async function fetchAdminSites(userId: string): Promise<AdminSite[]> {
  const { data, error } = await client()
    .from('site_members')
    .select('role, sites!inner(id, name)')
    .eq('profile_id', userId)
    .eq('role', 'admin')
  if (error) throw error
  return data.map((row) => row.sites).sort((a, b) => a.name.localeCompare(b.name, 'tr'))
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
// Friendly messages for database errors (mutations above throw the Supabase error)
// ---------------------------------------------------------------------------
export function describeDbError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code
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
