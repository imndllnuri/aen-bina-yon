import { createClient, type SupabaseClient } from '@supabase/supabase-js'
// Regenerate after every database change:
//   npx supabase gen types --remote > src/lib/database.types.ts
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
// This variable holds the PUBLISHABLE key (sb_publishable_...). The name says "anon" only
// because older projects called it the anon key. Never put a secret / service_role key here.
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function create(): SupabaseClient<Database> | null {
  if (!url || !anonKey) return null
  try {
    return createClient<Database>(url, anonKey)
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
