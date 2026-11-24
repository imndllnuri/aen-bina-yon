import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchAudit, type AuditFilters } from './api'

export const auditKeys = { list: (siteId: string, filters: AuditFilters, page: number) => ['audit', siteId, filters, page] as const }

// The log grows by itself while people work: every visit and every change of a filter asks again.
export const useAudit = (site: { id: string; companyId: string }, filters: AuditFilters, page: number) =>
  useQuery({ queryKey: auditKeys.list(site.id, filters, page), queryFn: () => fetchAudit(site, filters, page), placeholderData: keepPreviousData, refetchOnMount: 'always' })
