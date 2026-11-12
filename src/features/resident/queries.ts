import { useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useAuthState } from '@/lib/auth'
import { fetchBalance, fetchLedger, fetchMyName, fetchMyPayments, fetchMyUnits } from './api'

export const residentKeys = {
  units: (userId: string) => ['resident', 'units', userId] as const,
  name: (userId: string) => ['resident', 'name', userId] as const,
  payments: (userId: string) => ['resident', 'payments', userId] as const,
  // The person's id is part of every key: two people who look at the same unit (an owner and a tenant)
  // never share cached answers, because they are allowed to see different lines.
  balance: (userId: string, unitId: string) => ['resident', 'balance', userId, unitId] as const,
  ledger: (userId: string, unitId: string) => ['resident', 'ledger', userId, unitId] as const,
}

const UNIT_KEY = 'aen-resident-unit'

function readStoredUnit(): string | null {
  try {
    return localStorage.getItem(UNIT_KEY)
  } catch {
    return null
  }
}

/** The signed-in person's id, or null while the session is still loading. */
export function useUserId(): string | null {
  const auth = useAuthState()
  return auth.data?.status === 'signed-in' ? auth.data.session.user.id : null
}

/**
 * The units the person lives in, and the one they are looking at now.
 * The choice is remembered on this device. With one unit there is nothing to choose.
 */
export function useSelectedUnit() {
  const userId = useUserId()
  const units = useQuery({ queryKey: residentKeys.units(userId ?? ''), queryFn: () => fetchMyUnits(userId!), enabled: userId !== null })
  const [chosen, setChosen] = useState<string | null>(readStoredUnit)

  const list = units.data ?? []
  const unit = list.find((u) => u.unitId === chosen) ?? list[0] ?? null

  const selectUnit = useCallback((id: string) => {
    setChosen(id)
    try {
      localStorage.setItem(UNIT_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  return { units: list, unit, selectUnit, isPending: units.isPending, isError: units.isError, refetch: units.refetch }
}

export const useMyName = () => {
  const userId = useUserId()
  return useQuery({ queryKey: residentKeys.name(userId ?? ''), queryFn: () => fetchMyName(userId!), enabled: userId !== null })
}
export function useBalance(unitId: string) {
  const userId = useUserId()
  return useQuery({ queryKey: residentKeys.balance(userId ?? '', unitId), queryFn: () => fetchBalance(unitId), enabled: userId !== null })
}
export function useLedger(unitId: string) {
  const userId = useUserId()
  return useQuery({ queryKey: residentKeys.ledger(userId ?? '', unitId), queryFn: () => fetchLedger(unitId), enabled: userId !== null })
}

export function useMyPayments() {
  const userId = useUserId()
  return useQuery({ queryKey: residentKeys.payments(userId ?? ''), queryFn: () => fetchMyPayments(userId!), enabled: userId !== null })
}
