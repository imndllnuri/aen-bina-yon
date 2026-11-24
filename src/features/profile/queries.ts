import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { fetchMyProfile } from './api'

export const profileKeys = {
  mine: (userId: string) => ['profile', 'mine', userId] as const,
}

export const useMyProfile = (userId: string | null) =>
  useQuery({ queryKey: profileKeys.mine(userId ?? ''), queryFn: () => fetchMyProfile(userId!), enabled: userId !== null, staleTime: 0 })

/** After the name is saved: the Profil page, and the name the resident pages greet with ("Merhaba, Ayşe"). */
export function useRefreshProfile() {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['profile'] }), queryClient.invalidateQueries({ queryKey: ['resident', 'name'] })])
  }, [queryClient])
}
