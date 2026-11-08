import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useAuthState } from '@/lib/auth'
import { fetchAdminSites, fetchBlocks, fetchResidents, fetchUnits } from './api'

export const adminKeys = {
  sites: (userId: string) => ['admin', 'sites', userId] as const,
  blocks: (siteId: string) => ['admin', 'blocks', siteId] as const,
  units: (siteId: string) => ['admin', 'units', siteId] as const,
  residents: (siteId: string) => ['admin', 'residents', siteId] as const,
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
