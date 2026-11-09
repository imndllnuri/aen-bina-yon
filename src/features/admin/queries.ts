import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useAuthState } from '@/lib/auth'
import { fetchAdminSites, fetchBatches, fetchBlocks, fetchChargeTypes, fetchCharges, fetchPlans, fetchResidents, fetchUnits, type ChargeFilters } from './api'

export const adminKeys = {
  sites: (userId: string) => ['admin', 'sites', userId] as const,
  blocks: (siteId: string) => ['admin', 'blocks', siteId] as const,
  units: (siteId: string) => ['admin', 'units', siteId] as const,
  residents: (siteId: string) => ['admin', 'residents', siteId] as const,
  chargeTypes: (companyId: string) => ['admin', 'charge-types', companyId] as const,
  // The site key alone is a prefix of every charges query, so invalidating it reloads them all.
  charges: (siteId: string, filters?: ChargeFilters) => (filters ? (['admin', 'charges', siteId, filters] as const) : (['admin', 'charges', siteId] as const)),
  batches: (siteId: string) => ['admin', 'batches', siteId] as const,
  plans: (siteId: string) => ['admin', 'plans', siteId] as const,
}

const SITE_KEY = 'aen-admin-site'

function readStoredSite(): string | null {
  try {
    return localStorage.getItem(SITE_KEY)
  } catch {
    return null
  }
}

/**
 * The sites this admin administers, and the one they are working on now.
 * The choice is remembered on this device. With one site there is nothing to choose.
 */
export function useSelectedSite() {
  const auth = useAuthState()
  const userId = auth.data?.status === 'signed-in' ? auth.data.session.user.id : null
  const sites = useQuery({
    queryKey: adminKeys.sites(userId ?? ''),
    queryFn: () => fetchAdminSites(userId!),
    enabled: userId !== null,
  })
  const [chosen, setChosen] = useState<string | null>(readStoredSite)

  const list = sites.data ?? []
  const site = list.find((s) => s.id === chosen) ?? list[0] ?? null

  const selectSite = useCallback((id: string) => {
    setChosen(id)
    try {
      localStorage.setItem(SITE_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  return { sites: list, site, selectSite, isPending: sites.isPending, isError: sites.isError, refetch: sites.refetch }
}

export const useBlocks = (siteId: string) => useQuery({ queryKey: adminKeys.blocks(siteId), queryFn: () => fetchBlocks(siteId) })
export const useUnits = (siteId: string) => useQuery({ queryKey: adminKeys.units(siteId), queryFn: () => fetchUnits(siteId) })
export const useResidents = (siteId: string) => useQuery({ queryKey: adminKeys.residents(siteId), queryFn: () => fetchResidents(siteId) })

/** After any change: reload what the pages show (units show residents, residents show units). */
export function useRefreshSite(siteId: string) {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminKeys.blocks(siteId) }),
      queryClient.invalidateQueries({ queryKey: adminKeys.units(siteId) }),
      queryClient.invalidateQueries({ queryKey: adminKeys.residents(siteId) }),
    ])
  }, [queryClient, siteId])
}

export const useChargeTypes = (companyId: string) =>
  useQuery({ queryKey: adminKeys.chargeTypes(companyId), queryFn: () => fetchChargeTypes(companyId) })
export const useCharges = (siteId: string, filters: ChargeFilters) =>
  useQuery({
    queryKey: adminKeys.charges(siteId, filters),
    queryFn: () => fetchCharges(siteId, filters),
    // Keep showing the old list while a filter change loads, so the table does not flash.
    placeholderData: keepPreviousData,
  })
export const useBatches = (siteId: string) => useQuery({ queryKey: adminKeys.batches(siteId), queryFn: () => fetchBatches(siteId) })
export const usePlans = (siteId: string) => useQuery({ queryKey: adminKeys.plans(siteId), queryFn: () => fetchPlans(siteId) })

/** After any charge change: lines, batches and plans all show the new state. */
export function useRefreshCharges(siteId: string) {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminKeys.charges(siteId) }),
      queryClient.invalidateQueries({ queryKey: adminKeys.batches(siteId) }),
      queryClient.invalidateQueries({ queryKey: adminKeys.plans(siteId) }),
    ])
  }, [queryClient, siteId])
}
