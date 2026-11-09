import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { AUTH_QUERY_KEY, homePathFor, loadAuthState, useAuthState, useSignOut } from './auth'

// A tiny stand-in for the Supabase query builder: every method returns itself, and the whole
// chain can be awaited to get the prepared answer.
interface Chain {
  select: () => Chain
  eq: () => Chain
  lte: () => Chain
  or: () => Chain
  maybeSingle: () => Promise<unknown>
  then: Promise<unknown>['then']
}
function chain(answer: unknown): Chain {
  const self: Chain = {
    select: () => self,
    eq: () => self,
    lte: () => self,
    or: () => self,
    maybeSingle: () => Promise.resolve(answer),
    then: (resolve, reject) => Promise.resolve(answer).then(resolve, reject),
  }
  return self
}

const mocks = vi.hoisted(() => ({
  configured: true,
  session: null as unknown,
  tables: {} as Record<string, unknown>,
}))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocks.configured
      ? {
          auth: { getSession: async () => ({ data: { session: mocks.session }, error: null }), signOut: async () => ({ error: null }) },
          from: (table: string) => chain(mocks.tables[table]),
        }
      : null
  },
}))

const session = { user: { id: 'u1', email: 'kisi@ornek.com' } }
const ok = (data: unknown) => ({ data, error: null })

beforeEach(() => {
  mocks.configured = true
  mocks.session = session
  mocks.tables = {
    site_members: ok([]),
    unit_residents: ok([]),
    profiles: ok({ is_active: true }),
  }
})

describe('loadAuthState', () => {
  it('reports "unconfigured" when the build has no Supabase settings', async () => {
    mocks.configured = false
    expect(await loadAuthState()).toEqual({ status: 'unconfigured', session: null, roles: [] })
  })

  it('reports "anonymous" when nobody is logged in', async () => {
    mocks.session = null
    expect(await loadAuthState()).toEqual({ status: 'anonymous', session: null, roles: [] })
  })

  it('gives the admin role for an admin membership', async () => {
    mocks.tables.site_members = ok([{ role: 'admin' }])
    expect(await loadAuthState()).toMatchObject({ status: 'signed-in', roles: ['admin'], active: true })
  })

  it('does not treat a staff or auditor membership as admin', async () => {
    mocks.tables.site_members = ok([{ role: 'staff' }, { role: 'auditor' }])
    expect(await loadAuthState()).toMatchObject({ roles: [] })
  })

  it('gives the resident role for a current residency', async () => {
    mocks.tables.unit_residents = ok([{ relation: 'owner' }])
    expect(await loadAuthState()).toMatchObject({ roles: ['resident'] })
  })

  it('can give both roles', async () => {
    mocks.tables.site_members = ok([{ role: 'admin' }])
    mocks.tables.unit_residents = ok([{ relation: 'tenant' }])
    expect(await loadAuthState()).toMatchObject({ roles: ['admin', 'resident'] })
  })

  it('gives no role to someone linked to nothing', async () => {
    expect(await loadAuthState()).toMatchObject({ status: 'signed-in', roles: [], active: true })
  })

  it('gives NO roles to a deactivated person, even with memberships', async () => {
    mocks.tables.site_members = ok([{ role: 'admin' }])
    mocks.tables.unit_residents = ok([{ relation: 'owner' }])
    mocks.tables.profiles = ok({ is_active: false })
    expect(await loadAuthState()).toMatchObject({ status: 'signed-in', roles: [], active: false })
  })

  it.each(['site_members', 'unit_residents', 'profiles'])('fails loudly when reading %s fails (the page then offers "try again")', async (table) => {
    mocks.tables[table] = { data: null, error: new Error('boom') }
    await expect(loadAuthState()).rejects.toThrow('boom')
  })
})

describe('homePathFor', () => {
  it('opens the admin panel first, then the resident panel, otherwise the login page', () => {
    expect(homePathFor(['admin', 'resident'])).toBe('/yonetim')
    expect(homePathFor(['admin'])).toBe('/yonetim')
    expect(homePathFor(['resident'])).toBe('/panel')
    expect(homePathFor([])).toBe('/giris')
  })
})

describe('useAuthState: re-checks the account when the tab gets focus again', () => {
  it('shows "deactivated" without a reload after an admin deactivates the person', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children)
    mocks.tables.unit_residents = ok([{ relation: 'owner' }])

    const { result } = renderHook(() => useAuthState(), { wrapper })
    await waitFor(() => expect(result.current.data).toMatchObject({ roles: ['resident'], active: true }))

    // An admin deactivates this person. Nothing happens in the open tab yet...
    mocks.tables.profiles = ok({ is_active: false })
    expect(result.current.data).toMatchObject({ active: true })

    // ...until the person comes back to the tab.
    act(() => {
      window.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(result.current.data).toMatchObject({ roles: [], active: false }))
  })
})

describe('useSignOut', () => {
  it('forgets every cached answer except "who is logged in", so the next person never sees the last one\'s data', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['resident', 'ledger', 'u1', 'unit-1'], [{ amount: 150000 }])
    queryClient.setQueryData(['resident', 'balance', 'u1', 'unit-1'], { balance: 150000 })
    queryClient.setQueryData(['admin', 'charges', 's1'], [{ id: 'c1' }])
    queryClient.setQueryData(AUTH_QUERY_KEY, { status: 'signed-in', session, roles: ['resident'], active: true })

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, createElement(MemoryRouter, null, children))
    const { result } = renderHook(() => useSignOut(), { wrapper })
    await act(async () => {
      await result.current()
    })

    expect(queryClient.getQueryData(['resident', 'ledger', 'u1', 'unit-1'])).toBeUndefined()
    expect(queryClient.getQueryData(['resident', 'balance', 'u1', 'unit-1'])).toBeUndefined()
    expect(queryClient.getQueryData(['admin', 'charges', 's1'])).toBeUndefined()
    expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toEqual({ status: 'anonymous', session: null, roles: [] })
  })
})
