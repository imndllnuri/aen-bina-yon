import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useRefreshProfile } from './queries'

vi.mock('@/lib/supabase', () => ({ supabase: null }))

describe('useRefreshProfile', () => {
  it('refreshes the Profil page and the name the resident pages greet with', async () => {
    const client = new QueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useRefreshProfile(), { wrapper })
    await act(async () => {
      await result.current()
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['profile'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['resident', 'name'] })
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
