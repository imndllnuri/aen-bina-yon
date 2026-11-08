import { useEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AUTH_QUERY_KEY } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

/** When someone logs in or out, reload the session and roles. */
function AuthSync() {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange(() => {
      // Supabase advises against calling its own methods straight inside this callback.
      // Defer to the next tick so the session is fully saved first.
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY }), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])
  return null
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  )
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthSync />
          {children}
          <Toaster position="top-center" />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
