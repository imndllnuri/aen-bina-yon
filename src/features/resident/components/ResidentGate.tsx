import type { ReactNode } from 'react'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { NativeSelect } from '@/components/NativeSelect'
import { Label } from '@/components/ui/label'
import type { MyUnit } from '../api'
import { relationLabel, unitLabel } from '../lib/unit-label'
import { useSelectedUnit } from '../queries'

/**
 * Wraps a resident page: loading, "could not load", the unit switcher (only when the person lives in
 * more than one unit) and the page title. The page itself only ever sees a ready `unit`.
 */
export function ResidentGate({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: (unit: MyUnit) => ReactNode
}) {
  const { units, unit, selectUnit, isPending, isError, refetch } = useSelectedUnit()

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          {unit && units.length === 1 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {unit.siteName} · {unitLabel(unit)} · {relationLabel(unit)}
            </p>
          )}
        </div>
        {unit && units.length > 1 && (
          <div className="space-y-1.5 print:hidden">
            <Label htmlFor="unit-select">Daire</Label>
            <NativeSelect id="unit-select" value={unit.unitId} onChange={(event) => selectUnit(event.target.value)} className="w-56">
              {units.map((u) => (
                <option key={u.unitId} value={u.unitId}>
                  {unitLabel(u)} ({relationLabel(u)})
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
      </header>

      {isPending && <LoadingBlock />}
      {isError && <ErrorBlock text="Daireleriniz şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void refetch()} />}
      {!isPending && !isError && !unit && (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Şu anda adınıza kayıtlı bir daire görünmüyor. Bunun bir hata olduğunu düşünüyorsanız site yönetimiyle iletişime geçin.
        </p>
      )}
      {unit && children(unit)}
    </div>
  )
}
