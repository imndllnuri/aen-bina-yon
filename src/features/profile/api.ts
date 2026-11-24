import { classifyAuthError, signInWithPassword, updatePassword } from '@/features/auth/auth-api'
import { supabase } from '@/lib/supabase'
import { readPrefs, type Prefs } from './lib/prefs'
import type { ContactValues } from './lib/schemas'
import type { PasswordChangeFailure } from './lib/messages'

// Everything the Profil page asks Supabase. A person reads and changes only their OWN row (row security);
// the e-mail choices go through one checked function (migration 0010), because a preference belongs to the person alone.

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export interface MyProfile {
  fullName: string | null
  phone: string | null
  email: string | null
  /** When the person accepted the KVKK notice, and which version. Null = no record. */
  kvkkAt: string | null
  kvkkVersion: string | null
  prefs: Prefs
}

export async function fetchMyProfile(userId: string): Promise<MyProfile> {
  const { data, error } = await client()
    .from('profiles')
    .select('full_name, phone, email, kvkk_consent_at, kvkk_consent_version, notify_prefs')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('profile not found')
  return { fullName: data.full_name, phone: data.phone, email: data.email, kvkkAt: data.kvkk_consent_at, kvkkVersion: data.kvkk_consent_version, prefs: readPrefs(data.notify_prefs) }
}

/** Name and phone. An empty phone is saved as "no phone". */
export async function saveMyContact(userId: string, values: ContactValues): Promise<void> {
  const phone = values.phone.trim()
  const { data, error } = await client()
    .from('profiles')
    .update({ full_name: values.fullName.trim(), phone: phone === '' ? null : phone })
    .eq('id', userId)
    .select('id')
  if (error) throw error
  // row security shows "nothing changed" instead of an error when no row is allowed
  if (data.length === 0) throw Object.assign(new Error('not allowed'), { code: '42501' })
}

/** Returns the choices as stored. */
export async function saveMyNotificationPrefs(prefs: Prefs): Promise<Prefs> {
  const { data, error } = await client().rpc('save_my_notification_prefs', { p_prefs: prefs })
  if (error) throw error
  return readPrefs(data)
}

export type PasswordChangeResult = { ok: true; othersClosed: boolean } | { ok: false; reason: PasswordChangeFailure }

/**
 * Changes the password of the signed-in person.
 * 1. The CURRENT password is checked by logging in with it (a stolen, unlocked browser cannot change the password
 *    without knowing it). A wrong one is reported as "wrong-current", not as a wrong login.
 * 2. The new password is saved.
 * 3. Every OTHER session of this person is closed, so a device that was lost or shared stops working. If that last
 *    step fails the password HAS changed: the answer says so (othersClosed: false) and the page tells the person.
 */
export async function changeMyPassword(email: string, current: string, next: string): Promise<PasswordChangeResult> {
  const check = await signInWithPassword(email, current)
  if (!check.ok) return { ok: false, reason: check.reason === 'invalid-credentials' ? 'wrong-current' : check.reason }
  const saved = await updatePassword(next)
  if (!saved.ok) return saved
  return { ok: true, othersClosed: (await signOutOtherSessions()).ok }
}

/** Closes the sessions on all other devices; this one stays. */
export async function signOutOtherSessions(): Promise<{ ok: boolean }> {
  try {
    const { error } = await client().auth.signOut({ scope: 'others' })
    if (error) {
      console.warn('Closing the other sessions failed:', classifyAuthError(error))
      return { ok: false }
    }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
