import { createClient, type SupabaseClient } from '@supabase/supabase-js'
// TODO (plan, step 6): after the first `supabase db push`, generate the types with
//   npx supabase gen types typescript --linked > src/lib/database.types.ts
// and switch to createClient<Database>(...) so every query is type-checked.

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function create(): SupabaseClient | null {
  if (!url || !anonKey) return null
  try {
    return createClient(url, anonKey)
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
