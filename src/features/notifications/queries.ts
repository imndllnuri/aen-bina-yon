import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useAuthState } from '@/lib/auth'
import { fetchNotifications, fetchUnreadCount } from './api'

// No Realtime yet: the bell asks again every minute and whenever the window gets focus again.
export const POLL_MS = 60_000

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (userId: string) => ['notifications', 'list', userId] as const,
  unread: (userId: string) => ['notifications', 'unread', userId] as const,
}

function useUserId(): string | null {
  const auth = useAuthState()
  return auth.data?.status === 'signed-in' ? auth.data.session.user.id : null
}

export function useNotifications() {
  const userId = useUserId()
  return useQuery({
    queryKey: notificationKeys.list(userId ?? ''),
    queryFn: fetchNotifications,
    enabled: userId !== null,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  })
}

export function useUnreadCount() {
  const userId = useUserId()
  return useQuery({
    queryKey: notificationKeys.unread(userId ?? ''),
    queryFn: fetchUnreadCount,
    enabled: userId !== null,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  })
}

/** After the person changes a notification (read, delete) or opens an announcement: the bell asks again. */
export function useRefreshNotifications() {
  const queryClient = useQueryClient()
  return useCallback(() => queryClient.invalidateQueries({ queryKey: notificationKeys.all }), [queryClient])
}
