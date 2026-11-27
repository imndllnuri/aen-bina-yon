import { supabase } from '@/lib/supabase'

// The admins of a site. Reading and removing go through checked database functions (migration 0012): the table can no longer be
// written from the browser. Inviting goes through the invite function (it needs the secret key).

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export interface AdminRow {
  profileId: string
  fullName: string | null
  email: string | null
  phone: string | null
  /** The account was switched off by the management. */
  isActive: boolean
  /** When the person finished the invite page (accepted the KVKK text). Null = invited, not yet activated. */
  activatedAt: string | null
  /** Admin of this site since. */
  since: string
  isSelf: boolean
}

export async function fetchAdmins(siteId: string): Promise<AdminRow[]> {
  const { data, error } = await client().rpc('list_site_admins', { p_site: siteId })
  if (error) throw error
  return data.map((row) => ({
    profileId: row.profile_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    isActive: row.is_active,
    activatedAt: row.kvkk_consent_at,
    since: row.since,
    isSelf: row.is_self,
  }))
}

/** Takes the admin role away. The person, their login and their residency stay. */
export async function removeAdmin(siteId: string, profileId: string): Promise<void> {
  const { error } = await client().rpc('remove_site_admin', { p_site: siteId, p_profile: profileId })
  if (error) throw error
}
