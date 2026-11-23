import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useAuthState } from '@/lib/auth'
import { fetchMyRequests, fetchRequestDetail, fetchSiteRequests, requestPhotoUrls } from './api'

// The person's id is part of the keys that hold personal data (sign-out also clears every cached query).
export const requestKeys = {
  all: ['requests'] as const,
  mine: (userId: string) => ['requests', 'mine', userId] as const,
  site: (siteId: string) => ['requests', 'site', siteId] as const,
  detail: (id: string, userId: string) => ['requests', 'detail', userId, id] as const,
  photoUrls: (paths: string[]) => ['requests', 'photo-urls', ...paths] as const,
}

export function useUserId(): string | null {
  const auth = useAuthState()
  return auth.data?.status === 'signed-in' ? auth.data.session.user.id : null
}

export function useMyRequests() {
  const userId = useUserId()
  return useQuery({ queryKey: requestKeys.mine(userId ?? ''), queryFn: () => fetchMyRequests(userId!), enabled: userId !== null })
}

export const useSiteRequests = (siteId: string) => useQuery({ queryKey: requestKeys.site(siteId), queryFn: () => fetchSiteRequests(siteId) })

export function useRequestDetail(id: string, asAdmin: boolean) {
  const userId = useUserId()
  return useQuery({ queryKey: [...requestKeys.detail(id, userId ?? ''), asAdmin] as const, queryFn: () => fetchRequestDetail(id, asAdmin), enabled: userId !== null })
}

/** Signed links of the photos of one request. They live 5 minutes, so they are asked for again a little earlier. */
export function useRequestPhotoUrls(paths: string[]) {
  return useQuery({ queryKey: requestKeys.photoUrls(paths), queryFn: () => requestPhotoUrls(paths), staleTime: 4 * 60_000, enabled: paths.length > 0 })
}

/** After a request changes: the lists and details, and the bell (a change can create or remove a notification). */
export function useRefreshRequests() {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: requestKeys.all }), queryClient.invalidateQueries({ queryKey: ['notifications'] })])
  }, [queryClient])
}
