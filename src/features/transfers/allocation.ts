import { useQuery } from '@tanstack/react-query'
import { previewAllocation, type AllocationPreview } from './api'

// "Which lines would this amount close?" The DATABASE answers (preview_allocation), the same function that
// writes the payment later. The browser never adds up lines itself.

export type Selection = { mode: 'fifo' } | { mode: 'pick'; picked: ReadonlySet<string> }

export interface AllocationInput {
  unitId: string
  /** The resident who pays (they only pay lines they can see), or null. */
  payerId: string | null
  /** null while the amount is empty or not valid yet */
  amountKurus: number | null
}

export interface AllocationState {
  /** Every open line the payer could pay, oldest first (the list to pick from). */
  candidates: AllocationPreview | undefined
  /** What the current choice would close. */
  result: AllocationPreview | undefined
  loading: boolean
  error: unknown
  /** True only when the whole amount lands on lines: safe to save. */
  ready: boolean
  /** null = "oldest first"; otherwise the picked ids (sorted, so the same choice gives the same key). */
  chargeIds: string[] | null
}

export function useAllocation(input: AllocationInput, selection: Selection): AllocationState {
  const { unitId, payerId, amountKurus } = input
  const enabled = unitId !== '' && amountKurus !== null
  const chargeIds = selection.mode === 'pick' ? [...selection.picked].sort() : null

  const candidates = useQuery({
    queryKey: ['admin', 'allocation', 'candidates', unitId, payerId, amountKurus],
    queryFn: () => previewAllocation({ unitId, payerId, amountKurus: amountKurus!, chargeIds: null }),
    enabled,
  })
  const picked = useQuery({
    queryKey: ['admin', 'allocation', 'picked', unitId, payerId, amountKurus, chargeIds],
    queryFn: () => previewAllocation({ unitId, payerId, amountKurus: amountKurus!, chargeIds }),
    enabled: enabled && chargeIds !== null && chargeIds.length > 0,
  })

  const active = selection.mode === 'fifo' ? candidates : picked
  const result = enabled ? active.data : undefined
  // "Pick the lines" with nothing picked has no result at all (its query is switched off), so it is never ready.
  const ready = result !== undefined && result.lines.length > 0 && result.excessKurus === 0
  return {
    candidates: enabled ? candidates.data : undefined,
    result,
    loading: enabled && (candidates.isPending || (selection.mode === 'pick' && chargeIds !== null && chargeIds.length > 0 && picked.isPending)),
    error: enabled ? (candidates.error ?? (selection.mode === 'pick' ? picked.error : null)) : null,
    ready,
    chargeIds,
  }
}
