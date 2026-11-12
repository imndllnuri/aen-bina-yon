import { todayIstanbul } from '@/lib/format'
import { toKurus } from '@/lib/money'
import { supabase } from '@/lib/supabase'
import type { LedgerLine, LineStatus } from './lib/ledger'

// Everything the resident pages ask Supabase. Row Level Security decides what a resident may see:
// these functions never filter for permission, they only ask. An owner receives every live line of
// the unit; a tenant receives only the lines the admin marked "kiracıya yansıt" from the tenant's
// move-in date on. The browser never decides that (migration 0004).

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export interface MyUnit {
  unitId: string
  doorNo: string
  blockName: string
  siteName: string
  /** Normally one entry. A person can be owner and tenant of the same unit. */
  relations: ('owner' | 'tenant')[]
}

/** The units this person lives in today (started, and not moved out). */
export async function fetchMyUnits(userId: string): Promise<MyUnit[]> {
  const today = todayIstanbul()
  const { data, error } = await client()
    .from('unit_residents')
    // One single string on purpose: the Supabase types read the column list from the literal text.
    .select('relation, unit_id, units!inner(id, door_no, blocks!inner(name, sites!inner(name)))')
    .eq('profile_id', userId)
    .lte('start_date', today)
    .or(`end_date.is.null,end_date.gt.${today}`)
  if (error) throw error

  const byUnit = new Map<string, MyUnit>()
  for (const row of data) {
    const existing = byUnit.get(row.unit_id)
    const relation = row.relation as 'owner' | 'tenant'
    if (existing) {
      if (!existing.relations.includes(relation)) existing.relations.push(relation)
    } else {
      byUnit.set(row.unit_id, {
        unitId: row.unit_id,
        doorNo: row.units.door_no,
        blockName: row.units.blocks.name,
        siteName: row.units.blocks.sites.name,
        relations: [relation],
      })
    }
  }
  return [...byUnit.values()].sort((a, b) => a.blockName.localeCompare(b.blockName, 'tr') || a.doorNo.localeCompare(b.doorNo, 'tr', { numeric: true }))
}

export async function fetchMyName(userId: string): Promise<string | null> {
  const { data, error } = await client().from('profiles').select('full_name').eq('id', userId).maybeSingle()
  if (error) throw error
  return data?.full_name ?? null
}

export interface Balance {
  lineCount: number
  chargedKurus: number
  paidKurus: number
  /** What the resident owes now. Computed by the database (view unit_balances). */
  balanceKurus: number
  overdueKurus: number
  overdueCount: number
  /** The earliest due date still ahead (today counts), or null. */
  nextDueDate: string | null
}

const NO_BALANCE: Balance = { lineCount: 0, chargedKurus: 0, paidKurus: 0, balanceKurus: 0, overdueKurus: 0, overdueCount: 0, nextDueDate: null }

export async function fetchBalance(unitId: string): Promise<Balance> {
  const { data, error } = await client()
    .from('unit_balances')
    .select('line_count, charged, paid, balance, overdue_amount, overdue_count, next_due_date')
    .eq('unit_id', unitId)
    .maybeSingle()
  if (error) throw error
  // A unit without any visible line has no row at all.
  if (!data) return NO_BALANCE
  return {
    lineCount: data.line_count ?? 0,
    chargedKurus: toKurus(data.charged ?? 0),
    paidKurus: toKurus(data.paid ?? 0),
    balanceKurus: toKurus(data.balance ?? 0),
    overdueKurus: toKurus(data.overdue_amount ?? 0),
    overdueCount: data.overdue_count ?? 0,
    nextDueDate: data.next_due_date,
  }
}

/** The lines of one unit, as the person is allowed to see them, with the running balance. */
export async function fetchLedger(unitId: string): Promise<LedgerLine[]> {
  const { data, error } = await client()
    .from('charge_status')
    .select('charge_id, type_name, period, description, amount, paid_amount, remaining, due_date, status, created_at, running_balance')
    .eq('unit_id', unitId)
    .order('due_date')
    .order('created_at')
    .order('charge_id')
  if (error) throw error
  return data.map((row) => ({
    id: row.charge_id ?? '',
    typeName: row.type_name ?? '—',
    period: row.period,
    description: row.description,
    amountKurus: toKurus(row.amount ?? 0),
    paidKurus: toKurus(row.paid_amount ?? 0),
    remainingKurus: toKurus(row.remaining ?? 0),
    dueDate: row.due_date ?? '',
    status: (['overdue', 'partial', 'paid'].includes(row.status ?? '') ? row.status : 'open') as LineStatus,
    createdAt: row.created_at ?? '',
    runningKurus: toKurus(row.running_balance ?? 0),
  }))
}

// ---------------------------------------------------------------------------
// Paying (mock checkout, plan section 12). The DATABASE computes every amount; the browser only
// shows the quote and sends back the total it saw, so a changed total is refused.
// ---------------------------------------------------------------------------
export interface QuoteLine {
  chargeId: string
  typeName: string | null
  description: string | null
  period: string | null
  dueDate: string
  amountKurus: number
}

export interface Quote {
  unitId: string
  lines: QuoteLine[]
  principalKurus: number
  feeKurus: number
  totalKurus: number
}

export async function quotePayment(chargeIds: string[], installments: number): Promise<Quote> {
  const { data, error } = await client().rpc('quote_payment', { p_charge_ids: chargeIds, p_installments: installments })
  if (error) throw error
  if (data.length === 0) throw new Error('empty quote')
  return {
    unitId: data[0].unit_id,
    lines: data.map((row) => ({
      chargeId: row.charge_id,
      typeName: row.type_name,
      description: row.description,
      period: row.period,
      dueDate: row.due_date,
      amountKurus: row.amount_kurus,
    })),
    principalKurus: data.reduce((total, row) => total + row.amount_kurus, 0),
    feeKurus: data[0].fee_kurus,
    totalKurus: data[0].total_kurus,
  }
}

export interface PayInput {
  /** One random id per checkout visit: a double click or a retry returns the same payment. */
  requestId: string
  chargeIds: string[]
  installments: number
  expectedTotalKurus: number
}

/** The mock provider: "Onayla" on the fake 3D Secure screen. Returns the payment id. */
export async function payMock(input: PayInput): Promise<string> {
  const { data, error } = await client().rpc('pay_charges_mock', {
    p_request_id: input.requestId,
    p_charge_ids: input.chargeIds,
    p_installments: input.installments,
    p_expected_total_kurus: input.expectedTotalKurus,
  })
  if (error) throw error
  return data
}

export interface PaymentRow {
  id: string
  receiptNo: string
  paidAt: string
  amountKurus: number
  feeKurus: number
  method: string
  status: 'approved' | 'voided'
  installments: number
  unitLabel: string
  payerName: string | null
  mine: boolean
}

/** The payments this person may see: their own, and (for an owner) every payment of the unit. */
export async function fetchMyPayments(userId: string): Promise<PaymentRow[]> {
  const { data, error } = await client()
    .from('payments')
    .select('id, receipt_no, paid_at, amount, fee, method, status, installments, unit_label, payer_name, payer_id')
    .order('paid_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    receiptNo: row.receipt_no,
    paidAt: row.paid_at,
    amountKurus: toKurus(row.amount),
    feeKurus: toKurus(row.fee),
    method: row.method,
    status: row.status === 'voided' ? 'voided' : 'approved',
    installments: row.installments,
    unitLabel: row.unit_label,
    payerName: row.payer_name,
    mine: row.payer_id === userId,
  }))
}


