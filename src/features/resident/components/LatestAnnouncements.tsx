import { Megaphone } from 'lucide-react'
import { Link } from 'react-router'
import { IconCircle } from '@/components/IconCircle'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { isArchived } from '@/features/announcements/lib/state'
import { useMyAnnouncements, useMyReadIds } from '@/features/announcements/queries'
import { formatDate } from '@/lib/format'

/** "Son duyurular" on the home page: the latest three that are still current, with a dot for the unread ones. */
export function LatestAnnouncements() {
  const announcements = useMyAnnouncements()
  const reads = useMyReadIds()
  const readIds = new Set(reads.data ?? [])
  const now = new Date()
  const latest = (announcements.data ?? []).filter((a) => !isArchived(a, now)).slice(0, 3)

  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <div className="flex items-center gap-3">
          <IconCircle icon={Megaphone} />
          <h2 className="flex-1 font-medium">Son duyurular</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/duyurular">Tümünü gör</Link>
          </Button>
        </div>
        {announcements.isError && <p className="text-sm text-muted-foreground">Duyurular şu anda yüklenemedi.</p>}
        {!announcements.isError && !announcements.isPending && latest.length === 0 && <p className="text-sm text-muted-foreground">Şu anda güncel bir duyuru yok.</p>}
        {latest.length > 0 && (
          <ul className="divide-y text-sm">
            {latest.map((item) => {
              const unread = !readIds.has(item.id)
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 py-1.5">
                  <Link to="/duyurular" className="flex min-w-0 items-center gap-2 hover:underline">
                    {unread && <span className="size-2 shrink-0 rounded-full bg-primary" role="img" aria-label="Okunmadı" />}
                    <span className={`truncate ${unread ? 'font-semibold' : ''}`}>{item.title}</span>
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(item.publishAt ?? item.publishedAt)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
