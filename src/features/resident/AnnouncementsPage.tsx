import { Pin } from 'lucide-react'
import { useState } from 'react'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { markAnnouncementRead, type MyAnnouncement } from '@/features/announcements/api'
import { TypeBadge } from '@/features/announcements/components/TypeBadge'
import { isArchived, TYPE_LABEL, TYPES, type AnnouncementType } from '@/features/announcements/lib/state'
import { useMyAnnouncements, useMyReadIds, useRefreshAnnouncements } from '@/features/announcements/queries'
import { useRefreshNotifications } from '@/features/notifications/queries'
import { formatDateTime } from '@/lib/format'

function AnnouncementList({ items, unreadIds, empty, onOpen }: { items: MyAnnouncement[]; unreadIds: ReadonlySet<string>; empty: string; onOpen: (item: MyAnnouncement) => void }) {
  if (items.length === 0) {
    return (
      <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        {empty}
      </p>
    )
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const unread = unreadIds.has(item.id)
        return (
          <li key={item.id}>
            <Card size="sm" className={unread ? 'ring-2 ring-primary/40' : undefined}>
              <CardContent>
                <button type="button" onClick={() => onOpen(item)} className="block w-full space-y-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <span className="flex flex-wrap items-center gap-2">
                    {unread && <span className="size-2 rounded-full bg-primary" role="img" aria-label="Okunmadı" />}
                    <span className={unread ? 'font-semibold' : 'font-medium'}>{item.title}</span>
                    <TypeBadge type={item.type} />
                    {item.pinned && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Pin className="size-3" aria-hidden="true" /> Sabit
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">{formatDateTime(item.publishAt ?? item.publishedAt)}</span>
                  <span className="line-clamp-2 block text-sm text-muted-foreground [overflow-wrap:anywhere]">{item.body}</span>
                </button>
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}

/** Duyurular: what the management sent to this person. Opening one marks it read. Plain text only. */
export function AnnouncementsPage() {
  const announcements = useMyAnnouncements()
  const reads = useMyReadIds()
  const refresh = useRefreshAnnouncements()
  const refreshBell = useRefreshNotifications()
  const [type, setType] = useState<AnnouncementType | 'all'>('all')
  const [opened, setOpened] = useState<MyAnnouncement | null>(null)
  const now = new Date()

  const readIds = new Set(reads.data ?? [])
  const all = announcements.data ?? []
  const unreadIds = new Set(all.filter((a) => !readIds.has(a.id)).map((a) => a.id))
  const matching = all.filter((a) => type === 'all' || a.type === type)
  const current = matching.filter((a) => !isArchived(a, now))
  const archive = matching.filter((a) => isArchived(a, now))

  const open = async (item: MyAnnouncement) => {
    setOpened(item)
    if (!readIds.has(item.id)) {
      try {
        await markAnnouncementRead(item.id)
        await Promise.all([refresh(), refreshBell()])
      } catch {
        /* the text is on the screen anyway; it will be marked the next time */
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:py-8">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">Duyurular</h1>
        <p className="mt-1 text-sm text-muted-foreground">Site yönetiminin size gönderdiği duyurular. Okunmamışlar kalın yazılır.</p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Duyuru türü">
        {(['all', ...TYPES] as const).map((value) => (
          <Button key={value} variant={type === value ? 'default' : 'outline'} size="sm" aria-pressed={type === value} onClick={() => setType(value)}>
            {value === 'all' ? 'Hepsi' : TYPE_LABEL[value]}
          </Button>
        ))}
      </div>

      {announcements.isPending && <LoadingBlock />}
      {announcements.isError && <ErrorBlock text="Duyurular şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void announcements.refetch()} />}
      {announcements.data && (
        <Tabs defaultValue="current">
          <TabsList>
            <TabsTrigger value="current">Güncel ({current.length})</TabsTrigger>
            <TabsTrigger value="archive">Arşiv ({archive.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="current" className="pt-3">
            <AnnouncementList items={current} unreadIds={unreadIds} onOpen={(item) => void open(item)} empty={type === 'all' ? 'Şu anda güncel bir duyuru yok.' : 'Bu türde güncel duyuru yok.'} />
          </TabsContent>
          <TabsContent value="archive" className="pt-3">
            <AnnouncementList items={archive} unreadIds={unreadIds} onOpen={(item) => void open(item)} empty="Arşivde duyuru yok. Süresi dolan duyurular burada durur." />
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={opened !== null} onOpenChange={(next) => !next && setOpened(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          {opened && (
            <>
              <DialogHeader>
                <DialogTitle className="[overflow-wrap:anywhere]">{opened.title}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-2">
                  <TypeBadge type={opened.type} />
                  <span>{formatDateTime(opened.publishAt ?? opened.publishedAt)}</span>
                  {opened.expireAt && <span>· Bitiş: {formatDateTime(opened.expireAt)}</span>}
                </DialogDescription>
              </DialogHeader>
              {/* Plain text: line breaks are kept, nothing is ever read as HTML, and no address becomes a link by itself. */}
              <p className="text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{opened.body}</p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
