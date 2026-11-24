import { supabase } from '@/lib/supabase'
import type { AuditAction, AuditData } from './lib/describe'

// The audit log (İşlem Geçmişi). Read only: the database writes it with triggers and nobody can change it.
// Row security shows an admin the rows of their sites, and the company rows (settings, charge types) of their company.

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export const AUDIT_PAGE = 50

export interface AuditRow {
  id: number
  at: string
  actorId: string | null
  actorName: string | null
  table: string
  rowId: string | null
  action: AuditAction
  siteId: string | null
  companyId: string | null
  oldData: AuditData | null
  newData: AuditData | null
}

export interface AuditFilters {
  table: string
  action: string
  actor: string
  from: string
  to: string
}

export const EMPTY_FILTERS: AuditFilters = { table: '', action: '', actor: '', from: '', to: '' }

/** Wildcards the person did not mean (% * _ \) are dropped from the name they type. */
export const cleanActor = (text: string) => text.replace(/[%*_\\,()]/g, ' ').replace(/\s+/g, ' ').trim()

const ACTIONS: AuditAction[] = ['insert', 'update', 'delete']
const asRecord = (value: unknown): AuditData | null => (value && typeof value === 'object' && !Array.isArray(value) ? (value as AuditData) : null)

export async function fetchAudit(site: { id: string; companyId: string }, filters: AuditFilters, page: number): Promise<{ rows: AuditRow[]; total: number }> {
  let query = client()
    .from('audit_log')
    .select('id, at, actor_id, actor_name, table_name, row_id, action, site_id, company_id, old_data, new_data', { count: 'exact' })
    // this site, and the company-level rows of its company (ids are uuids: safe inside the filter text)
    .or(`site_id.eq.${site.id},and(site_id.is.null,company_id.eq.${site.companyId})`)
    .order('id', { ascending: false })
    .range(page * AUDIT_PAGE, page * AUDIT_PAGE + AUDIT_PAGE - 1)
  if (filters.table) query = query.eq('table_name', filters.table)
  if (filters.action) query = query.eq('action', filters.action)
  const actor = cleanActor(filters.actor)
  if (actor) query = query.ilike('actor_name', `%${actor}%`)
  // days are Istanbul days (UTC+3, no summer time)
  if (filters.from) query = query.gte('at', `${filters.from}T00:00:00+03:00`)
  if (filters.to) query = query.lte('at', `${filters.to}T23:59:59.999+03:00`)
  const { data, error, count } = await query
  if (error) throw error
  return {
    total: count ?? data.length,
    rows: data.map((row) => ({
      id: row.id,
      at: row.at,
      actorId: row.actor_id,
      actorName: row.actor_name,
      table: row.table_name,
      rowId: row.row_id,
      action: ACTIONS.includes(row.action as AuditAction) ? (row.action as AuditAction) : 'update',
      siteId: row.site_id,
      companyId: row.company_id,
      oldData: asRecord(row.old_data),
      newData: asRecord(row.new_data),
    })),
  }
}
