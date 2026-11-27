import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { fetchLateFeePreview } from './api'

export const lateFeeKeys = {
  preview: (siteId: string) => ['late-fees', siteId] as const,
}

// The numbers change with every payment and with the date, so the list is read again each time the page opens.
export const useLateFeePreview = (siteId: string) =>
  useQuery({ queryKey: lateFeeKeys.preview(siteId), queryFn: () => fetchLateFeePreview(siteId), refetchOnMount: 'always', staleTime: 0 })

export function useRefreshLateFees() {
  const queryClient = useQueryClient()
  return useCallback(() => queryClient.invalidateQueries({ queryKey: ['late-fees'] }), [queryClient])
}
