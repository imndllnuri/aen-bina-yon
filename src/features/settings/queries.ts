import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { fetchAllChargeTypes, fetchCompany } from './api'

export const settingsKeys = {
  company: (id: string) => ['settings', 'company', id] as const,
  chargeTypes: (id: string) => ['settings', 'charge-types', id] as const,
}

export const useCompany = (companyId: string) => useQuery({ queryKey: settingsKeys.company(companyId), queryFn: () => fetchCompany(companyId), staleTime: 0 })
export const useAllChargeTypes = (companyId: string) => useQuery({ queryKey: settingsKeys.chargeTypes(companyId), queryFn: () => fetchAllChargeTypes(companyId), staleTime: 0 })

/** The due day of the month that new charges start with (the setting of the company; 15 until it is loaded or when it was never saved). */
export function useDueDay(companyId: string): number {
  const company = useCompany(companyId)
  return company.data?.rules.dueDay ?? 15
}

/** After a setting changes: the settings screen, and the lists elsewhere that depend on it (charge types in the wizard). */
export function useRefreshSettings() {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['settings'] }), queryClient.invalidateQueries({ queryKey: ['admin', 'charge-types'] })])
  }, [queryClient])
}
