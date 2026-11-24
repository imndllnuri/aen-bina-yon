import { useQuery } from '@tanstack/react-query'
import { fetchAttendance, fetchCollections, fetchCollectionsSummary, fetchDebts, fetchKpis, fetchMonthly, fetchResidentReport } from './api'

// Money numbers change whenever somebody pays or charges, so every visit asks again (refetchOnMount: 'always').
const FRESH = { refetchOnMount: 'always' as const }

export const reportKeys = {
  kpis: (site: string) => ['reports', 'kpis', site] as const,
  monthly: (site: string, from: string, to: string) => ['reports', 'monthly', site, from, to] as const,
  debts: (site: string, limit: number | null) => ['reports', 'debts', site, limit] as const,
  collections: (site: string, from: string, to: string, limit: number | null) => ['reports', 'collections', site, from, to, limit] as const,
  summary: (site: string, from: string, to: string) => ['reports', 'summary', site, from, to] as const,
  residents: (site: string) => ['reports', 'residents', site] as const,
  attendance: (site: string) => ['reports', 'attendance', site] as const,
}

export const useKpis = (site: string) => useQuery({ queryKey: reportKeys.kpis(site), queryFn: () => fetchKpis(site), ...FRESH })
export const useMonthly = (site: string, from: string, to: string) => useQuery({ queryKey: reportKeys.monthly(site, from, to), queryFn: () => fetchMonthly(site, from, to), ...FRESH })
export const useDebts = (site: string, limit: number | null) => useQuery({ queryKey: reportKeys.debts(site, limit), queryFn: () => fetchDebts(site, limit), ...FRESH })
export const useCollections = (site: string, from: string, to: string, limit: number | null) =>
  useQuery({ queryKey: reportKeys.collections(site, from, to, limit), queryFn: () => fetchCollections(site, from, to, limit), ...FRESH })
export const useCollectionsSummary = (site: string, from: string, to: string) =>
  useQuery({ queryKey: reportKeys.summary(site, from, to), queryFn: () => fetchCollectionsSummary(site, from, to), ...FRESH })
export const useResidentReport = (site: string) => useQuery({ queryKey: reportKeys.residents(site), queryFn: () => fetchResidentReport(site), ...FRESH })
export const useAttendance = (site: string) => useQuery({ queryKey: reportKeys.attendance(site), queryFn: () => fetchAttendance(site), ...FRESH })
