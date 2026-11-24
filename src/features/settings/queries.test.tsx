import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompanyView } from './api'
import { useDueDay, useRefreshSettings } from './queries'

const api = vi.hoisted(() => ({ fetchCompany: vi.fn(), fetchAllChargeTypes: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))

const company = (dueDay: number): CompanyView => ({
  id: 'c1', name: 'Firma', phone: null, email: null, address: null, taxNo: null,
  rules: { dueDay, ydoRate: 25.49, lateFeeRate: 5, lateFeeMethod: 'daily', graceDays: 0, commissionPayer: 'management', fee: { 2: null, 3: null, 6: null, 9: null } },
})
const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

beforeEach(() => {
  api.fetchCompany.mockReset()
  api.fetchAllChargeTypes.mockReset()
})

describe('useDueDay', () => {
  it('is 15 until the company has loaded, then the due day of the company', async () => {
    api.fetchCompany.mockResolvedValue(company(20))
    const { result } = renderHook(() => useDueDay('c1'), { wrapper: wrapper(newClient()) })
    expect(result.current).toBe(15)
    await waitFor(() => expect(result.current).toBe(20))
    expect(api.fetchCompany).toHaveBeenCalledWith('c1')
  })
  it('stays 15 when the company cannot be read', async () => {
    api.fetchCompany.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useDueDay('c1'), { wrapper: wrapper(newClient()) })
    await waitFor(() => expect(api.fetchCompany).toHaveBeenCalled())
    expect(result.current).toBe(15)
  })
})

describe('useRefreshSettings', () => {
  it('refreshes the settings screen and the charge type list of the wizard', async () => {
    const client = newClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useRefreshSettings(), { wrapper: wrapper(client) })
    await act(async () => {
      await result.current()
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['settings'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['admin', 'charge-types'] })
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
