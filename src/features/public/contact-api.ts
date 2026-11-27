import { supabase } from '@/lib/supabase'
import type { ContactInsert } from './contact-schema'

export type SubmitResult =
  | { ok: true }
  /** 'not-configured': no Supabase settings in this build. 'failed': the request was refused or lost. */
  | { ok: false; reason: 'not-configured' | 'failed' }

/**
 * Saves one contact message.
 *
 * IMPORTANT: no `.select()` after `.insert()`. Visitors may INSERT but never SELECT (see 0011_contact_messages.sql),
 * so asking for the row back is refused with "permission denied".
 */
export async function submitContactMessage(row: ContactInsert): Promise<SubmitResult> {
  if (!supabase) return { ok: false, reason: 'not-configured' }
  try {
    const { error } = await supabase.from('contact_messages').insert(row)
    if (error) {
      console.warn('Contact message was refused:', error.code, error.message)
      return { ok: false, reason: 'failed' }
    }
    return { ok: true }
  } catch (error) {
    // For example: no internet, or the free Supabase project is paused.
    console.warn('Contact message could not be sent:', error)
    return { ok: false, reason: 'failed' }
  }
}
