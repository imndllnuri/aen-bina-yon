import { toKurus } from '@/lib/money'
import { supabase } from '@/lib/supabase'

// Everything the dashboard and the reports ask Supabase. Only the database adds money up and decides who may look
// (migration 0009: every function checks that the caller administers the site). Amounts come as TL numbers
// with two decimals; the screens work in whole kuruş (integers), so nothing is ever added as a fraction.

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export interface Kpis {
  /** The first day of this month (Istanbul). */
  month: string
  accruedKurus: number
  /** Money that closed lines and was paid THIS month (cash view). */
  collectedKurus: number
  /** What has been paid of THIS month's lines, whenever it was paid. */
  collectedForMonthKurus: number
  /** collectedForMonth / accrued, in percent; null when nothing was accrued. */
  ratePct: number | null
  receivableKurus: number
  overdueUnits: number
  overdueKurus: number
  pendingNotices: number
  openRequests: number
}

export async function fetchKpis(siteId: string): Promise<Kpis> {
  const { data, error } = await client().rpc('dashboard_kpis', { p_site: siteId })
  if (error) throw error
  const row = data[0]
  if (!row) throw new Error('no dashboard row')
  return {
    month: row.month,
    accruedKurus: toKurus(row.accrued),
    collectedKurus: toKurus(row.collected),
    collectedForMonthKurus: toKurus(row.collected_for_month),
    ratePct: row.rate_pct,
    receivableKurus: toKurus(row.receivable),
    overdueUnits: row.overdue_units,
    overdueKurus: toKurus(row.overdue_amount),
    pendingNotices: row.pending_notices,
    openRequests: row.open_requests,
  }
}

export interface MonthRow {
  month: string
  accruedKurus: number
  collectedKurus: number
  collectedForMonthKurus: number
  ratePct: number | null
}

export async function fetchMonthly(siteId: string, from: string, to: string): Promise<MonthRow[]> {
  const { data, error } = await client().rpc('report_monthly', { p_site: siteId, p_from: from, p_to: to })
  if (error) throw error
  return data.map((row) => ({
    month: row.month,
    accruedKurus: toKurus(row.accrued),
    collectedKurus: toKurus(row.collected),
    collectedForMonthKurus: toKurus(row.collected_for_month),
    ratePct: row.rate_pct,
  }))
}

export interface DebtRow {
  unitId: string
  blockName: string
  doorNo: string
  unitLabel: string
  owners: string | null
  phone: string | null
  balanceKurus: number
  notDueKurus: number
  d1to30Kurus: number
  d31to60Kurus: number
  d61to90Kurus: number
  over90Kurus: number
}

/** limit null = every unit that owes (the database caps it at 5000). */
export async function fetchDebts(siteId: string, limit: number | null): Promise<DebtRow[]> {
  const { data, error } = await client().rpc('report_debts', { p_site: siteId, p_limit: limit as number })
  if (error) throw error
  return data.map((row) => ({
    unitId: row.unit_id,
    blockName: row.block_name,
    doorNo: row.door_no,
    unitLabel: row.unit_label,
    owners: row.owners,
    phone: row.phone,
    balanceKurus: toKurus(row.balance),
    notDueKurus: toKurus(row.not_due),
    d1to30Kurus: toKurus(row.d1_30),
    d31to60Kurus: toKurus(row.d31_60),
    d61to90Kurus: toKurus(row.d61_90),
    over90Kurus: toKurus(row.d90_plus),
  }))
}

export interface CollectionRow {
  paymentId: string
  paidAt: string
  receiptNo: string
  unitLabel: string
  payerName: string | null
  method: string
  amountKurus: number
  feeKurus: number
}

export async function fetchCollections(siteId: string, from: string, to: string, limit: number | null): Promise<CollectionRow[]> {
  const { data, error } = await client().rpc('report_collections', { p_site: siteId, p_from: from, p_to: to, p_limit: limit as number })
  if (error) throw error
  return data.map((row) => ({
    paymentId: row.payment_id,
    paidAt: row.paid_at,
    receiptNo: row.receipt_no,
    unitLabel: row.unit_label,
    payerName: row.payer_name,
    method: row.method,
    amountKurus: toKurus(row.amount),
    feeKurus: toKurus(row.fee),
  }))
}

export interface MethodTotal {
  /** null = the total of all methods (the last row). */
  method: string | null
  count: number
  amountKurus: number
  feeKurus: number
}

export async function fetchCollectionsSummary(siteId: string, from: string, to: string): Promise<MethodTotal[]> {
  const { data, error } = await client().rpc('report_collections_summary', { p_site: siteId, p_from: from, p_to: to })
  if (error) throw error
  return data.map((row) => ({ method: row.method, count: row.payment_count, amountKurus: toKurus(row.amount), feeKurus: toKurus(row.fee) }))
}

export interface ResidentReportRow {
  unitId: string
  blockName: string
  doorNo: string
  floor: number | null
  grossM2: number | null
  landShare: number | null
  relation: string
  fullName: string | null
  phone: string | null
  email: string | null
  startDate: string
  isActive: boolean
}

export async function fetchResidentReport(siteId: string): Promise<ResidentReportRow[]> {
  const { data, error } = await client().rpc('report_residents', { p_site: siteId })
  if (error) throw error
  return data.map((row) => ({
    unitId: row.unit_id,
    blockName: row.block_name,
    doorNo: row.door_no,
    floor: row.floor,
    grossM2: row.gross_m2,
    landShare: row.land_share,
    relation: row.relation,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    startDate: row.start_date,
    isActive: row.is_active,
  }))
}

export interface AttendanceRow {
  unitId: string
  blockName: string
  doorNo: string
  owners: string | null
  landShare: number
  /** The share of the whole site, in percent (4 decimals), worked out by the database. */
  sharePct: number | null
  totalLandShare: number
  unitCount: number
}

export async function fetchAttendance(siteId: string): Promise<AttendanceRow[]> {
  const { data, error } = await client().rpc('report_attendance', { p_site: siteId })
  if (error) throw error
  return data.map((row) => ({
    unitId: row.unit_id,
    blockName: row.block_name,
    doorNo: row.door_no,
    owners: row.owners,
    landShare: row.land_share,
    sharePct: row.share_pct,
    totalLandShare: row.total_land_share,
    unitCount: row.unit_count,
  }))
}

const PROBLEMS: Record<string, string> = {
  range_invalid: 'Tarih aralığı geçerli değil. Başlangıç bitişten önce olmalı; aylık raporda en fazla 60 ay, tahsilat raporunda en fazla yaklaşık 3 yıl seçebilirsiniz.',
}

/** The database answers with short codes; people read Turkish. */
export function reportErrorMessage(error: unknown): string {
  const e = error as { message?: string; code?: string } | null | undefined
  if (e?.message && PROBLEMS[e.message]) return PROBLEMS[e.message] as string
  if (e?.code === '42501') return 'Bu rapor için yetkiniz yok.'
  return 'Rapor şu anda hazırlanamadı. Lütfen tekrar deneyin.'
}
