import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { fetchAdmins } from './api'

export const adminsKeys = {
  list: (siteId: string) => ['admins', siteId] as const,
}

export const useAdmins = (siteId: string) => useQuery({ queryKey: adminsKeys.list(siteId), queryFn: () => fetchAdmins(siteId), refetchOnMount: 'always' })

export function useRefreshAdmins() {
  const queryClient = useQueryClient()
  return useCallback(() => queryClient.invalidateQueries({ queryKey: ['admins'] }), [queryClient])
}
