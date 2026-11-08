import { supabase } from '@/lib/supabase'
import type { QuoteInsert } from './quote-schema'

export type SubmitResult =
  | { ok: true }
  /** 'not-configured': no Supabase settings in this build. 'failed': the request was refused or lost. */
  | { ok: false; reason: 'not-configured' | 'failed' }

/**
 * Saves one quote request.
 *
 * IMPORTANT: no `.select()` after `.insert()`. Visitors may INSERT but never SELECT
 * (see 0001_core.sql), so asking for the row back is refused with "permission denied".
 */
export async function submitQuoteRequest(row: QuoteInsert): Promise<SubmitResult> {
  if (!supabase) return { ok: false, reason: 'not-configured' }
  try {
    const { error } = await supabase.from('quote_requests').insert(row)
    if (error) {
      console.warn('Quote request was refused:', error.code, error.message)
      return { ok: false, reason: 'failed' }
    }
    return { ok: true }
  } catch (error) {
    // For example: no internet, or the free Supabase project is paused.
    console.warn('Quote request could not be sent:', error)
    return { ok: false, reason: 'failed' }
  }
}
