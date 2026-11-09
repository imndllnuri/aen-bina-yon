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
    status: (row.status === 'overdue' ? 'overdue' : 'open') as LineStatus,
    createdAt: row.created_at ?? '',
    runningKurus: toKurus(row.running_balance ?? 0),
  }))
}
