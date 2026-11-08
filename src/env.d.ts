// Types for the environment variables Vite exposes to the browser.
// All are optional: the public site must still build and run without them.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_PAYMENT_PROVIDER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
