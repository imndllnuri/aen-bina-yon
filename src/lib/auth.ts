import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { todayIstanbul } from '@/lib/format'
import { supabase } from '@/lib/supabase'

/** The two panels at launch (plan, section 5). */
export type Role = 'admin' | 'resident'

export type AuthState =
  /** No Supabase project is connected yet (no env variables). */
  | { status: 'unconfigured'; session: null; roles: [] }
  /** Backend is connected but nobody is logged in. */
  | { status: 'anonymous'; session: null; roles: [] }
  /** `active` is false for a deactivated person: they keep their login but have no roles at all. */
  | { status: 'signed-in'; session: Session; roles: Role[]; active: boolean }

export const AUTH_QUERY_KEY = ['auth'] as const

/**
 * Reads the session, then loads the user's memberships once:
 *  - a row in site_members with role "admin"  -> admin
 *  - a current row in unit_residents          -> resident (end_date = the day they moved out)
 * Row Level Security makes sure a user only ever sees their own rows.
 * A deactivated person (profiles.is_active = false) gets no roles.
 */
export async function loadAuthState(): Promise<AuthState> {
  if (!supabase) return { status: 'unconfigured', session: null, roles: [] }

  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) return { status: 'anonymous', session: null, roles: [] }

  const userId = data.session.user.id
  const today = todayIstanbul()
  const [members, residents, profile] = await Promise.all([
    supabase.from('site_members').select('role').eq('profile_id', userId),
    supabase
      .from('unit_residents')
      .select('relation')
      .eq('profile_id', userId)
      .lte('start_date', today)
      .or(`end_date.is.null,end_date.gt.${today}`),
    supabase.from('profiles').select('is_active').eq('id', userId).maybeSingle(),
  ])
  if (members.error) throw members.error
  if (residents.error) throw residents.error
  if (profile.error) throw profile.error

  // A deactivated person still has rows in site_members / unit_residents, but every database rule
  // already refuses them. Show "account deactivated" instead of empty panels.
  if (profile.data && !profile.data.is_active) {
    return { status: 'signed-in', session: data.session, roles: [], active: false }
  }

  const roles: Role[] = []
  if (members.data.some((row) => row.role === 'admin')) roles.push('admin')
  if (residents.data.length > 0) roles.push('resident')
  return { status: 'signed-in', session: data.session, roles, active: true }
}

export function useAuthState() {
  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: loadAuthState,
    staleTime: Infinity,
    // Check again whenever the person comes back to this tab. Without it, someone who was
    // deactivated (or reactivated) while the page was open would keep the old screen until they
    // reload. The database already refuses their data; this makes the screen tell the truth too.
    refetchOnWindowFocus: 'always',
  })
}

/** Where a signed-in person should land: admin panel first, then resident panel. */
export function homePathFor(roles: Role[]): string {
  if (roles.includes('admin')) return '/yonetim'
  if (roles.includes('resident')) return '/panel'
  return '/giris'
}

/** What the cached auth state looks like after logout. */
export function loggedOutState(): AuthState {
  return supabase
    ? { status: 'anonymous', session: null, roles: [] }
    : { status: 'unconfigured', session: null, roles: [] }
}

export function useSignOut() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return async () => {
    try {
      // 'local' = this device only. The default ('global') would log the person out on every
      // phone and computer they use.
      await supabase?.auth.signOut({ scope: 'local' })
    } catch (error) {
      console.warn('Sign-out request failed:', error)
    }
    // Forget every cached answer (charges, balances, residents ...) except "who is logged in".
    // On a shared computer the next person must never see, even for a moment, what the last one saw.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== AUTH_QUERY_KEY[0] })
    // Reset the cached state BEFORE leaving. Otherwise the login page would still see
    // "signed in" and send the person straight back into the panel.
    queryClient.setQueryData<AuthState>(AUTH_QUERY_KEY, loggedOutState())
    navigate('/giris', { replace: true })
  }
}
