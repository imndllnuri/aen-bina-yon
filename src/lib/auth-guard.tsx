import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { homePathFor, useAuthState, type Role } from '@/lib/auth'

/**
 * Wraps a panel layout. Lets the person in only when their role matches.
 *  - not logged in (or no backend yet) -> /giris
 *  - wrong role                        -> the panel they are allowed to use
 *
 * This is a convenience for the interface only. The real protection is
 * Row Level Security in the database: hiding a page never protects data.
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { data, isPending, isError } = useAuthState()

  if (isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-8" role="status" aria-label="Yükleniyor">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (isError || data.status !== 'signed-in') return <Navigate to="/giris" replace />
  if (data.roles.includes(role)) return <>{children}</>
  return <Navigate to={homePathFor(data.roles)} replace />
}
