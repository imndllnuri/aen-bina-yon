import { toKurus } from '@/lib/money'
import { supabase } from '@/lib/supabase'
import type { NoticeStatus, PaymentStatus } from './lib/notices'

// Everything the transfer-notice (havale bildirimi) and manual-payment screens ask Supabase.
// Nothing here decides who may do what: the database does (migration 0006). Notices and payments are
// never written directly: every change goes through a checked function.

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/** The browser types say a function argument is never null; the database accepts null for these. */
const nullable = <T extends string | string[]>(value: T | null) => value as T

// ---------------------------------------------------------------------------
// Bank accounts (the IBAN cards)
// ---------------------------------------------------------------------------
export type BankAccount = { bank: string; holder: string; iban: string }
export type CompanyBankAccount = BankAccount & { companyId: string }

export async function fetchBankAccounts(): Promise<CompanyBankAccount[]> {
  const { data, error } = await client().rpc('get_bank_accounts')
  if (error) throw error
  return data.map((row) => ({ companyId: row.company_id, bank: row.bank, holder: row.holder, iban: row.iban }))
}

export async function saveBankAccounts(companyId: string, accounts: BankAccount[]): Promise<void> {
  const { error } = await client().rpc('save_bank_accounts', { p_company: companyId, p_accounts: accounts.map((a) => ({ bank: a.bank, holder: a.holder, iban: a.iban })) })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// The dekont file (private bucket "dekontlar")
// ---------------------------------------------------------------------------
export async function uploadDekont(path: string, file: File, mime: string): Promise<void> {
  const { error } = await client().storage.from('dekontlar').upload(path, file, { contentType: mime, upsert: false })
  // A retry after a lost answer: the file is already there. That is fine (the name is a fresh random id).
  if (error && !/already exists|duplicate/i.test(error.message)) throw error
}

/** A link that works for 5 minutes. The bucket is private: nobody can open the file without one. */
export async function dekontUrl(path: string): Promise<string> {
  const { data, error } = await client().storage.from('dekontlar').createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------
export interface NoticeRow {
  id: string
  unitId: string
  amountKurus: number
  sentOn: string
  senderName: string
  note: string | null
  filePath: string
  status: NoticeStatus
  createdAt: string
  reviewedAt: string | null
  rejectReason: string | null
  paymentId: string | null
  /** The state of the payment an approved notice created (it can be cancelled later). */
  paymentStatus: PaymentStatus | null
  receiptNo: string | null
}

export interface AdminNoticeRow extends NoticeRow {
  unitLabel: string
  senderId: string | null
  senderFullName: string | null
  senderPhone: string | null
}

const STATUSES: NoticeStatus[] = ['pending', 'approved', 'rejected', 'cancelled']
const toStatus = (value: string): NoticeStatus => (STATUSES.includes(value as NoticeStatus) ? (value as NoticeStatus) : 'pending')
const toPaymentStatus = (value: string | undefined): PaymentStatus | null => (value === 'voided' ? 'voided' : value === 'approved' ? 'approved' : null)

/** The notices this person sent (newest first). */
export async function fetchMyNotices(userId: string): Promise<NoticeRow[]> {
  const { data, error } = await client()
    .from('transfer_notices')
    .select('id, unit_id, amount, sent_on, sender_name, note, file_path, status, created_at, reviewed_at, reject_reason, payment_id, payments(status, receipt_no)')
    .eq('profile_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    unitId: row.unit_id,
    amountKurus: toKurus(row.amount),
    sentOn: row.sent_on,
    senderName: row.sender_name,
    note: row.note,
    filePath: row.file_path,
    status: toStatus(row.status),
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    rejectReason: row.reject_reason,
    paymentId: row.payment_id,
    paymentStatus: toPaymentStatus(row.payments?.status),
    receiptNo: row.payments?.receipt_no ?? null,
  }))
}

const SITE_NOTICE_COLUMNS =
  'id, unit_id, profile_id, amount, sent_on, sender_name, note, file_path, status, created_at, reviewed_at, reject_reason, payment_id, payments(status, receipt_no), units!inner(door_no, blocks!inner(name, site_id)), profiles!transfer_notices_profile_id_fkey(full_name, phone)'

/**
 * Every notice of the site (the admin queue): the WAITING ones first (the oldest first: it has waited longest), then the
 * newest of the others. The waiting ones have their own query, so an old waiting notice can never fall out of the list
 * behind 300 newer, finished ones.
 */
export async function fetchSiteNotices(siteId: string): Promise<AdminNoticeRow[]> {
  const [waiting, others] = await Promise.all([
    client().from('transfer_notices').select(SITE_NOTICE_COLUMNS).eq('units.blocks.site_id', siteId).eq('status', 'pending').order('created_at', { ascending: true }).limit(300),
    client().from('transfer_notices').select(SITE_NOTICE_COLUMNS).eq('units.blocks.site_id', siteId).neq('status', 'pending').order('created_at', { ascending: false }).limit(300),
  ])
  if (waiting.error) throw waiting.error
  if (others.error) throw others.error
  return [...waiting.data, ...others.data].map((row) => ({
    id: row.id,
    unitId: row.unit_id,
    amountKurus: toKurus(row.amount),
    sentOn: row.sent_on,
    senderName: row.sender_name,
    note: row.note,
    filePath: row.file_path,
    status: toStatus(row.status),
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    rejectReason: row.reject_reason,
    paymentId: row.payment_id,
    paymentStatus: toPaymentStatus(row.payments?.status),
    receiptNo: row.payments?.receipt_no ?? null,
    unitLabel: `${row.units.blocks.name} · ${row.units.door_no}`,
    senderId: row.profile_id,
    senderFullName: row.profiles?.full_name ?? null,
    senderPhone: row.profiles?.phone ?? null,
  }))
}

export interface SubmitNoticeInput {
  /** One random id per form visit: a double click or a retry returns the same notice. */
  requestId: string
  unitId: string
  amountKurus: number
  sentOn: string
  senderName: string
  note: string | null
  filePath: string
}

export async function submitTransferNotice(input: SubmitNoticeInput): Promise<string> {
  const { data, error } = await client().rpc('submit_transfer_notice', {
    p_request_id: input.requestId,
    p_unit: input.unitId,
    p_amount_kurus: input.amountKurus,
    p_sent_on: input.sentOn,
    p_sender_name: input.senderName,
    p_note: nullable(input.note),
    p_file_path: input.filePath,
  })
  if (error) throw error
  return data
}

export async function cancelTransferNotice(noticeId: string): Promise<void> {
  const { error } = await client().rpc('cancel_transfer_notice', { p_notice: noticeId })
  if (error) throw error
}

export async function rejectTransferNotice(noticeId: string, reason: string): Promise<void> {
  const { error } = await client().rpc('reject_transfer_notice', { p_notice: noticeId, p_reason: reason })
  if (error) throw error
}

/** Approve: the payment and its receipt are made. chargeIds null = oldest due date first. Returns the payment id. */
export async function approveTransferNotice(noticeId: string, chargeIds: string[] | null): Promise<string> {
  const { data, error } = await client().rpc('approve_transfer_notice', { p_notice: noticeId, p_charge_ids: nullable(chargeIds) })
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Which lines would an amount close? (the database answers; the browser only shows)
// ---------------------------------------------------------------------------
export interface AllocationLine {
  chargeId: string
  typeName: string | null
  description: string | null
  period: string | null
  dueDate: string
  remainingKurus: number
  applyKurus: number
}

export interface AllocationPreview {
  lines: AllocationLine[]
  /** The part of the amount that no open line can take (must be 0 to save). */
  excessKurus: number
}

export interface PreviewInput {
  unitId: string
  payerId: string | null
  amountKurus: number
  /** null = every open line the payer can see, oldest first */
  chargeIds: string[] | null
}

export async function previewAllocation(input: PreviewInput): Promise<AllocationPreview> {
  const { data, error } = await client().rpc('preview_allocation', {
    p_unit: input.unitId,
    p_payer: nullable(input.payerId),
    p_amount_kurus: input.amountKurus,
    p_charge_ids: nullable(input.chargeIds),
  })
  if (error) throw error
  return {
    lines: data.map((row) => ({
      chargeId: row.charge_id,
      typeName: row.type_name,
      description: row.description,
      period: row.period,
      dueDate: row.due_date,
      remainingKurus: row.remaining_kurus,
      applyKurus: row.apply_kurus,
    })),
    excessKurus: data[0]?.excess_kurus ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Manual payment (cash, office card machine, a bank transfer the admin typed in)
// ---------------------------------------------------------------------------
export type ManualMethod = 'cash' | 'pos' | 'havale'

export interface ManualPaymentInput {
  requestId: string
  unitId: string
  payerId: string | null
  payerName: string | null
  method: ManualMethod
  amountKurus: number
  paidOn: string
  chargeIds: string[] | null
  note: string | null
}

export async function recordManualPayment(input: ManualPaymentInput): Promise<string> {
  const { data, error } = await client().rpc('record_manual_payment', {
    p_request_id: input.requestId,
    p_unit: input.unitId,
    p_payer: nullable(input.payerId),
    p_payer_name: nullable(input.payerName),
    p_method: input.method,
    p_amount_kurus: input.amountKurus,
    p_paid_on: input.paidOn,
    p_charge_ids: nullable(input.chargeIds),
    p_note: nullable(input.note),
  })
  if (error) throw error
  return data
}
