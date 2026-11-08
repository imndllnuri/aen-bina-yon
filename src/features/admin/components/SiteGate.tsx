import type { ReactNode } from 'react'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import type { AdminSite } from '../api'
import { useSelectedSite } from '../queries'

/**
 * Wraps an admin page. Handles "loading", "could not load" and "you administer no site", and shows
 * a site picker when the person administers more than one site. The page itself only ever sees a
 * ready `site`.
 */
export function SiteGate({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: (site: AdminSite) => ReactNode
  children: (site: AdminSite) => ReactNode
}) {
  const { sites, site, selectSite, isPending, isError, refetch } = useSelectedSite()

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
          {site && sites.length === 1 && <p className="mt-1 text-sm text-muted-foreground">{site.name}</p>}
        </div>
        {site && (
          <div className="flex flex-wrap items-end gap-3">
            {sites.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="site-select">Site</Label>
                <NativeSelect id="site-select" value={site.id} onChange={(event) => selectSite(event.target.value)} className="w-56">
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            {actions?.(site)}
          </div>
        )}
      </header>

      {isPending && (
        <div className="space-y-3" role="status" aria-label="Yükleniyor">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {isError && (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p>Siteleriniz şu anda yüklenemedi. Lütfen tekrar deneyin.</p>
          <Button variant="outline" onClick={() => void refetch()}>
            Tekrar dene
          </Button>
        </div>
      )}

      {!isPending && !isError && !site && (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Henüz yönetici olduğunuz bir site yok. Bir site eklenmesi için sistem yöneticisiyle iletişime geçin.
        </p>
      )}

      {site && children(site)}
    </div>
  )
}
