import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useAuthState } from '@/lib/auth'
import { fetchMyAnnouncements, fetchMyReadIds, listAnnouncements } from './api'

export const announcementKeys = {
  mine: (userId: string) => ['announcements', 'mine', userId] as const,
  reads: (userId: string) => ['announcements', 'reads', userId] as const,
  admin: (siteId: string) => ['announcements', 'admin', siteId] as const,
}

function useUserId(): string | null {
  const auth = useAuthState()
  return auth.data?.status === 'signed-in' ? auth.data.session.user.id : null
}

export function useMyAnnouncements() {
  const userId = useUserId()
  return useQuery({ queryKey: announcementKeys.mine(userId ?? ''), queryFn: fetchMyAnnouncements, enabled: userId !== null, refetchOnWindowFocus: true })
}

export function useMyReadIds() {
  const userId = useUserId()
  return useQuery({ queryKey: announcementKeys.reads(userId ?? ''), queryFn: fetchMyReadIds, enabled: userId !== null })
}

export const useAdminAnnouncements = (siteId: string) => useQuery({ queryKey: announcementKeys.admin(siteId), queryFn: () => listAnnouncements(siteId) })

export function useRefreshAnnouncements() {
  const queryClient = useQueryClient()
  return useCallback(() => queryClient.invalidateQueries({ queryKey: ['announcements'] }), [queryClient])
}
