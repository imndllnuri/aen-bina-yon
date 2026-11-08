import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, type RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AUTH_QUERY_KEY, type AuthState } from '@/lib/auth'

/**
 * Renders routes in memory with a fresh query cache.
 * `authState` pre-fills the "who is logged in" cache, so a test starts as that person
 * without talking to Supabase.
 */
export function renderRoutes(routes: RouteObject[], options: { path: string; authState?: AuthState }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  if (options.authState) queryClient.setQueryData(AUTH_QUERY_KEY, options.authState)
  const router = createMemoryRouter(routes, { initialEntries: [options.path] })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient }
}

export const anonymousState: AuthState = { status: 'anonymous', session: null, roles: [] }

/** A signed-in state with the given roles. The session is a stub: tests only read the id and e-mail. */
export function signedInState(roles: ('admin' | 'resident')[], email = 'kisi@ornek.com', active = true): AuthState {
  return { status: 'signed-in', session: { user: { id: 'user-1', email } } as never, roles, active }
}
