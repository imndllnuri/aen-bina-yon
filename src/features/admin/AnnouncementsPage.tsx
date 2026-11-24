import { Ellipsis, Pin } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { deleteAnnouncement, publishAnnouncement, unpublishAnnouncement, type AdminAnnouncement } from '@/features/announcements/api'
import { TypeBadge } from '@/features/announcements/components/TypeBadge'
import { announcementErrorMessage } from '@/features/announcements/lib/messages'
import { announcementState, STATE_LABEL, type AnnouncementState } from '@/features/announcements/lib/state'
import { useAdminAnnouncements, useRefreshAnnouncements } from '@/features/announcements/queries'
import { formatDateTime } from '@/lib/format'
import type { AdminSite } from './api'
import { AnnouncementDialog, type AnnouncementPreset } from './components/AnnouncementDialog'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ReadReportDialog } from './components/ReadReportDialog'
import { SiteGate } from './components/SiteGate'

const STATE_VARIANT: Record<AnnouncementState, 'outline' | 'secondary' | 'default' | 'destructive'> = { draft: 'outline', scheduled: 'secondary', live: 'default', expired: 'outline' }

function AnnouncementsContent({ site, composeOpen, onComposeOpenChange, preset }: { site: AdminSite; composeOpen: boolean; onComposeOpenChange: (open: boolean) => void; preset: AnnouncementPreset | null }) {
  const list = useAdminAnnouncements(site.id)
  const refresh = useRefreshAnnouncements()
  const [editing, setEditing] = useState<AdminAnnouncement | null>(null)
  const [reporting, setReporting] = useState<AdminAnnouncement | null>(null)
  const [removing, setRemoving] = useState<AdminAnnouncement | null>(null)
  const [unpublishing, setUnpublishing] = useState<AdminAnnouncement | null>(null)
  const [publishing, setPublishing] = useState<AdminAnnouncement | null>(null)
  const now = new Date()

  if (list.isPending) return <LoadingBlock />
  if (list.isError) return <ErrorBlock text="Duyurular şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void list.refetch()} />

  return (
    <>
      {list.data.length === 0 ? (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Henüz duyuru yok. “Yeni duyuru” ile ilkini yazın: kime gideceğini seçersiniz ve kaç kişiye gideceğini yayınlamadan önce görürsünüz.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Duyuru</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">Okunma</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">İşlemler</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((a) => {
                const state = announcementState(a, now)
                return (
                  <TableRow key={a.id}>
                    <TableCell className="max-w-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium [overflow-wrap:anywhere]">{a.title}</span>
                        <TypeBadge type={a.type} />
                        {a.pinned && <Pin className="size-3.5 text-muted-foreground" aria-label="Sabit" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATE_VARIANT[state]}>{STATE_LABEL[state]}</Badge>
                      {state === 'scheduled' && a.publishAt && <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(a.publishAt)}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.status === 'published' ? `${a.readCount} / ${a.recipientCount}` : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatDateTime(a.updatedAt)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`“${a.title}” için işlemler`}>
                            <Ellipsis />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(a)}>Düzenle</DropdownMenuItem>
                          {a.status === 'draft' && <DropdownMenuItem onSelect={() => setPublishing(a)}>Yayınla</DropdownMenuItem>}
                          {a.status === 'published' && <DropdownMenuItem onSelect={() => setReporting(a)}>Okuma raporu</DropdownMenuItem>}
                          {a.status === 'published' && <DropdownMenuItem onSelect={() => setUnpublishing(a)}>Yayından kaldır</DropdownMenuItem>}
                          <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(a)}>
                            Sil
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AnnouncementDialog key="new" open={composeOpen} onOpenChange={onComposeOpenChange} site={site} announcement={null} preset={preset} />
      {editing && <AnnouncementDialog key={editing.id} open onOpenChange={(open) => !open && setEditing(null)} site={site} announcement={editing} />}
      {reporting && <ReadReportDialog announcement={reporting} onOpenChange={(open) => !open && setReporting(null)} />}
      {publishing && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPublishing(null)}
          title="Duyuruyu yayınla"
          description={`“${publishing.title}” seçtiğiniz kişilere gönderilecek ve onlara bildirim gidecek.`}
          confirmLabel="Yayınla"
          describeError={announcementErrorMessage}
          onConfirm={async () => {
            const count = await publishAnnouncement(publishing.id)
            await refresh()
            toast.success(`Duyuru yayınlandı. ${count} kişiye gitti.`)
          }}
        />
      )}
      {unpublishing && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setUnpublishing(null)}
          title="Yayından kaldır"
          description={`“${unpublishing.title}” sakinlerin listesinden kalkar ve okunmamış bildirimleri silinir. Okuma kayıtları saklanır. Sonra tekrar yayınlayabilirsiniz.`}
          confirmLabel="Yayından kaldır"
          destructive
          describeError={announcementErrorMessage}
          onConfirm={async () => {
            await unpublishAnnouncement(unpublishing.id)
            await refresh()
            toast.success('Duyuru yayından kaldırıldı.')
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRemoving(null)}
          title="Duyuruyu sil"
          description={`“${removing.title}” silinecek: sakinler artık göremez, listenizden de kalkar.`}
          confirmLabel="Sil"
          destructive
          describeError={announcementErrorMessage}
          onConfirm={async () => {
            await deleteAnnouncement(removing.id)
            await refresh()
            toast.success('Duyuru silindi.')
          }}
        />
      )}
    </>
  )
}

/** Duyurular (admin): write, schedule, publish, take back, and see who read. */
export function AdminAnnouncementsPage() {
  // The dashboard sends people here with ?yeni=1 (open the window) and ?hedef=borclular (the debtors are chosen, a reminder text is ready).
  const [params, setParams] = useSearchParams()
  const [composeOpen, setComposeOpen] = useState(() => params.get('yeni') === '1')
  const [preset] = useState<AnnouncementPreset | null>(() =>
    params.get('hedef') === 'borclular'
      ? { title: 'Ödeme hatırlatması', body: 'Sayın sakinimiz, ödenmemiş borcunuz görünüyor. Güncel borcunuzu “Borçlarım” sayfasından görüp ödeyebilirsiniz. Ödemenizi yaptıysanız bu mesajı dikkate almayın. Teşekkür ederiz.', audience: 'debtors' }
      : null,
  )
  // the address is cleaned at once, so a reload does not open the window again
  useEffect(() => {
    if (params.has('yeni') || params.has('hedef')) setParams({}, { replace: true })
  }, [params, setParams])
  return (
    <SiteGate
      title="Duyurular"
      description="Sakinlere duyuru gönderin: tüm siteye, bloklara, dairelere ya da kişilere. Kaç kişiye gideceğini yayınlamadan önce görürsünüz; sonra kimin okuduğunu izlersiniz."
      actions={() => <Button onClick={() => setComposeOpen(true)}>Yeni duyuru</Button>}
    >
      {(site) => <AnnouncementsContent site={site} composeOpen={composeOpen} onComposeOpenChange={setComposeOpen} preset={preset} />}
    </SiteGate>
  )
}
