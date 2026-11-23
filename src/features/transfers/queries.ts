import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useAuthState } from '@/lib/auth'
import { fetchBankAccounts, fetchMyNotices, fetchSiteNotices } from './api'

// The person's id is part of the keys that hold personal data (sign-out also clears every cached query).
export const transferKeys = {
  bankAccounts: (userId: string) => ['transfers', 'bank-accounts', userId] as const,
  myNotices: (userId: string) => ['transfers', 'my-notices', userId] as const,
  siteNotices: (siteId: string) => ['transfers', 'site-notices', siteId] as const,
}

function useUserId(): string | null {
  const auth = useAuthState()
  return auth.data?.status === 'signed-in' ? auth.data.session.user.id : null
}

export function useBankAccounts() {
  const userId = useUserId()
  return useQuery({ queryKey: transferKeys.bankAccounts(userId ?? ''), queryFn: fetchBankAccounts, enabled: userId !== null })
}

export function useMyNotices() {
  const userId = useUserId()
  return useQuery({ queryKey: transferKeys.myNotices(userId ?? ''), queryFn: () => fetchMyNotices(userId!), enabled: userId !== null })
}

export const useSiteNotices = (siteId: string) => useQuery({ queryKey: transferKeys.siteNotices(siteId), queryFn: () => fetchSiteNotices(siteId) })

/** After a notice changes: the lists, and what depends on it (balances, lines and payments of the resident). */
export function useRefreshTransfers() {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transfers'] }),
      queryClient.invalidateQueries({ queryKey: ['resident'] }),
      queryClient.invalidateQueries({ queryKey: ['admin'] }),
    ])
  }, [queryClient])
}
