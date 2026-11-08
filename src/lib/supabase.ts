import { createClient, type SupabaseClient } from '@supabase/supabase-js'
// Regenerate after every database change:
//   npx supabase gen types --remote > src/lib/database.types.ts
import type { Database } from './database.types'
import { authStorage } from './session-storage'

const url = import.meta.env.VITE_SUPABASE_URL
// This variable holds the PUBLISHABLE key (sb_publishable_...). The name says "anon" only
// because older projects called it the anon key. Never put a secret / service_role key here.
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function create(): SupabaseClient<Database> | null {
  if (!url || !anonKey) return null
  try {
    return createClient<Database>(url, anonKey, {
      auth: {
        // Our router uses the URL hash ("/#/giris"), and so do Supabase e-mail links
        // ("#access_token=..."). We read those links ourselves, once, in
        // handleAuthRedirect() (src/lib/auth-redirect.ts). If supabase-js did it too, it
        // would also clear the hash and fight with the router.
        detectSessionInUrl: false,
        // Invite links created by admins always use this flow. Written out so a library
        // update cannot change it silently.
        flowType: 'implicit',
        // "Beni hatırla": localStorage or sessionStorage (src/lib/session-storage.ts).
        storage: authStorage,
      },
    })
  } catch (error) {
    // A bad URL must not take the whole site down (the public pages don't need Supabase).
    console.warn('Supabase client could not be created:', error)
    return null
  }
}

/**
 * The Supabase client, or `null` when the site has no backend yet
 * (no .env.local locally, or no repository variables in GitHub Actions).
 * Public pages work without it. Auth and data pages must check for null.
 */
export const supabase = create()
export const isSupabaseConfigured = supabase !== null
