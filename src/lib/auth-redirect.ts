import { supabase } from '@/lib/supabase'

// What Supabase puts in the address when someone clicks a link in an invite or reset e-mail.
// These shapes were captured from a real Supabase (local stack, supabase-js 2.119):
//
//   success:  <redirect_to>#access_token=...&expires_at=...&expires_in=3600&refresh_token=...
//                          &sb=&token_type=bearer&type=invite        (or type=recovery)
//   failure:  <redirect_to>#error=access_denied&error_code=otp_expired
//                          &error_description=Email+link+is+invalid+or+has+expired&sb=
//
// The tokens are in the URL hash, and our router also uses the hash ("/#/giris"). They would
// collide, so supabase-js is told NOT to read the URL (detectSessionInUrl: false). Instead
// handleAuthRedirect() below runs ONCE, before the router exists:
//   1. read the tokens,
//   2. remove them from the address bar at once (so they never stay in history or get shared),
//   3. save the session,
//   4. leave a normal route in the address bar.
// The invite function also adds "?flow=invite" (a query string BEFORE the hash) to the links it makes.

export type AuthLinkType = 'invite' | 'recovery' | 'signup' | 'magiclink' | 'email_change'
const LINK_TYPES: readonly string[] = ['invite', 'recovery', 'signup', 'magiclink', 'email_change']

export type AuthRedirect =
  | {
      kind: 'session'
      accessToken: string
      refreshToken: string
      type: AuthLinkType | null
      /**
       * "invite" when the address carried ?flow=invite. The invite function adds it to the links it
       * makes. It matters for a person who already clicked their first invite link (often a mail
       * scanner does that): Supabase then only allows a RECOVERY-type link, but the person still
       * has to see the "activate your account" page (with the KVKK tick), not "new password".
       */
      flow: 'invite' | null
    }
  | { kind: 'error'; code: string }

/** Returns what the address holds, or null for a normal visit. Never throws. */
export function parseAuthRedirect(hash: string, search: string): AuthRedirect | null {
  // Our own routes look like "#/giris". Supabase's look like "#access_token=..." (no slash).
  if (hash.startsWith('#/')) return null

  const fromHash = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const fromQuery = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)

  const accessToken = fromHash.get('access_token')
  const refreshToken = fromHash.get('refresh_token')
  if (accessToken && refreshToken) {
    const type = fromHash.get('type')
    return {
      kind: 'session',
      accessToken,
      refreshToken,
      // Only known values are kept. The type only decides which page opens next.
      type: type !== null && LINK_TYPES.includes(type) ? (type as AuthLinkType) : null,
      flow: fromQuery.get('flow') === 'invite' ? 'invite' : null,
    }
  }

  const rawCode =
    fromHash.get('error_code') ?? fromHash.get('error') ?? fromQuery.get('error_code') ?? fromQuery.get('error')
  if (rawCode) {
    // The code is used to pick a message and is written back into the address bar, so keep it plain.
    return { kind: 'error', code: /^[a-z_]{1,64}$/.test(rawCode) ? rawCode : 'unknown' }
  }
  return null
}

/** The page to open after the link was handled. */
export function routeAfterRedirect(redirect: AuthRedirect): string {
  if (redirect.kind === 'error') return `/auth/onay?error=${redirect.code}`
  // An invite page, whatever the link type says (see `flow` above).
  if (redirect.flow === 'invite' || redirect.type === 'invite') return '/auth/onay'
  if (redirect.type === 'recovery') return '/sifre-yenile'
  // Other link types: just open the login page. If the session is valid it forwards the person.
  return '/giris'
}

/**
 * Call once at start-up, BEFORE the router is created, and wait for it.
 * Safe to call on every visit: it does nothing unless the address holds a Supabase redirect.
 */
export async function handleAuthRedirect(): Promise<void> {
  const redirect = parseAuthRedirect(window.location.hash, window.location.search)
  if (!redirect) return

  // 1) Clean the address bar FIRST, before any await. The tokens must not stay in history.
  const goTo = (route: string) => window.history.replaceState(null, '', `${window.location.pathname}#${route}`)
  goTo(routeAfterRedirect(redirect))

  if (redirect.kind !== 'session' || !supabase) return

  // 2) Save the session. If the tokens are bad or expired, show the "link is invalid" page.
  try {
    const { error } = await supabase.auth.setSession({
      access_token: redirect.accessToken,
      refresh_token: redirect.refreshToken,
    })
    if (error) goTo('/auth/onay?error=invalid_link')
  } catch {
    goTo('/auth/onay?error=invalid_link')
  }
}
