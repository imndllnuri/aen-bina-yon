import { supabase } from '@/lib/supabase'
import { parsePreview, type LateFeePreview } from './lib/parse'

// Late fees (migration 0013). Both calls go to checked database functions: the browser never works out a fee.

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/** The fees that are due today. Writes nothing. */
export async function fetchLateFeePreview(siteId: string): Promise<LateFeePreview> {
  const { data, error } = await client().rpc('preview_late_fees', { p_site: siteId })
  if (error) throw error
  return parsePreview(data)
}

export interface ApplyLateFeesInput {
  /** One id per exact request (see createRequestIds): a double click returns the same batch. */
  requestId: string
  siteId: string
  /** The day of the preview. The database refuses if it is no longer today. */
  asOf: string
  /** The debts left ticked. */
  chargeIds: string[]
  /** What the person saw for exactly those debts. The database refuses if the numbers are no longer these. */
  expectedCount: number
  expectedKurus: number
}

/** Writes the ticked fees as one batch. Returns the batch id. */
export async function applyLateFees(input: ApplyLateFeesInput): Promise<string> {
  const { data, error } = await client().rpc('apply_late_fees', {
    p_request_id: input.requestId,
    p_site: input.siteId,
    p_as_of: input.asOf,
    p_charge_ids: input.chargeIds,
    p_expected_count: input.expectedCount,
    p_expected_kurus: input.expectedKurus,
  })
  if (error) throw error
  return data
}
