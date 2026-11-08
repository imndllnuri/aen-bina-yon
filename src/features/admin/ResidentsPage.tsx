import { Ellipsis, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, todayIstanbul } from '@/lib/format'
import {
  deleteResidency,
  endResidency,
  inviteErrorMessage,
  requestSignInLink,
  setProfileActive,
  type AdminSite,
  type ResidentRow,
} from './api'
import { ConfirmDialog } from './components/ConfirmDialog'
import { InviteDialog, type InviteDone } from './components/InviteDialog'
import { InviteLinkDialog } from './components/InviteLinkDialog'
import { ResidentEditDialog } from './components/ResidentEditDialog'
import { SiteGate } from './components/SiteGate'
import { canRequestLink, isCurrentResidency, matchesQuery, residentStatus, STATUS_LABEL } from './lib/residents'
import { useBlocks, useRefreshSite, useResidents, useUnits } from './queries'

type Filter = 'current' | 'past' | 'all'
type ConfirmState = { kind: 'end' | 'remove' | 'deactivate' | 'activate'; resident: ResidentRow }
interface LinkState {
  link: string
  name: string
  phone: string | null
}

const STATUS_VARIANT = { active: 'secondary', pending: 'outline', inactive: 'destructive' } as const

function ResidentsContent({ site }: { site: AdminSite }) {
  const residents = useResidents(site.id)
  const units = useUnits(site.id)
  const blocks = useBlocks(site.id)
  const refresh = useRefreshSite(site.id)
  const today = todayIstanbul()

  const [filter, setFilter] = useState<Filter>('current')
  const [query, setQuery] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editing, setEditing] = useState<ResidentRow | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [linkDialog, setLinkDialog] = useState<LinkState | null>(null)

  if (residents.isPending || units.isPending || blocks.isPending) {
    return (
      <div className="space-y-3" role="status" aria-label="Yükleniyor">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }

  if (residents.isError || units.isError || blocks.isError) {
    return (
      <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        <p>Sakinler şu anda yüklenemedi. Lütfen tekrar deneyin.</p>
        <Button
          variant="outline"
          onClick={() => {
            void residents.refetch()
            void units.refetch()
            void blocks.refetch()
          }}
        >
          Tekrar dene
        </Button>
      </div>
    )
  }

  const all = residents.data
  // How many residency rows each person has on this site. "Daireden çıkar" (delete the row) is only
  // offered when there is another one: removing a person's ONLY row would make their e-mail look
  // like it belongs to another company, and inviting them again would then fail. "Taşındı" keeps
  // the history and has no such problem.
  const residencyCount = new Map<string, number>()
  for (const r of all) residencyCount.set(r.profileId, (residencyCount.get(r.profileId) ?? 0) + 1)
  const current = all.filter((r) => isCurrentResidency(r, today))
  const past = all.filter((r) => !isCurrentResidency(r, today))
  const shown = (filter === 'current' ? current : filter === 'past' ? past : all).filter((r) => matchesQuery(r, query))
  const hasUnits = units.data.length > 0

  const onInvited = async ({ result, name, phone }: InviteDone) => {
    await refresh()
    if (result.link) setLinkDialog({ link: result.link, name, phone })
    else toast.success('Mevcut hesap daireye bağlandı. Bu kişi hesabını zaten kullandığı için yeni bir bağlantı gerekmez.')
  }

  const makeLink = async (resident: ResidentRow) => {
    const result = await requestSignInLink(resident.profileId)
    if (result.ok && result.link) setLinkDialog({ link: result.link, name: resident.fullName ?? resident.email ?? '', phone: resident.phone })
    else toast.error(result.ok ? inviteErrorMessage('failed') : inviteErrorMessage(result.error))
  }

  const confirmText = (state: ConfirmState) => {
    const name = state.resident.fullName ?? state.resident.email ?? 'Bu kişi'
    switch (state.kind) {
      case 'end':
        return { title: 'Taşındı olarak işaretlensin mi?', body: `${name}, bugün itibarıyla ${state.resident.blockName} ${state.resident.doorNo} numaralı daireden taşınmış sayılır. Geçmiş kaydı korunur.`, label: 'Taşındı olarak işaretle', destructive: false }
      case 'remove':
        return { title: 'Daireden çıkarılsın mı?', body: `${name} için ${state.resident.blockName} ${state.resident.doorNo} numaralı daire kaydı silinir. Taşınan kişiler için “Taşındı” seçeneği geçmişi korur.`, label: 'Daireden çıkar', destructive: true }
      case 'deactivate':
        return { title: 'Hesap devre dışı bırakılsın mı?', body: `${name} giriş yapabilir ama hiçbir bilgiyi göremez. Geçmiş kayıtlar korunur. İstediğiniz zaman yeniden etkinleştirebilirsiniz.`, label: 'Devre dışı bırak', destructive: true }
      case 'activate':
        return { title: 'Hesap yeniden etkinleştirilsin mi?', body: `${name} bilgilerine yeniden erişebilir.`, label: 'Etkinleştir', destructive: false }
    }
  }
  const confirmCopy = confirm ? confirmText(confirm) : null

  const runConfirm = async () => {
    if (!confirm) return
    const { kind, resident } = confirm
    if (kind === 'end') await endResidency(resident.residencyId, today)
    if (kind === 'remove') await deleteResidency(resident.residencyId)
    if (kind === 'deactivate') await setProfileActive(resident.profileId, false)
    if (kind === 'activate') await setProfileActive(resident.profileId, true)
    await refresh()
    toast.success('Değişiklik kaydedildi.')
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Liste filtresi">
          {(
            [
              ['current', 'Güncel', current.length],
              ['past', 'Geçmiş', past.length],
              ['all', 'Tümü', all.length],
            ] as const
          ).map(([key, label, count]) => (
            <Button key={key} size="sm" variant={filter === key ? 'default' : 'outline'} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label} ({count})
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="search"
            aria-label="Sakin ara"
            placeholder="Ad, e-posta veya daire ara"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 w-full sm:w-64"
          />
          <Button onClick={() => setInviteOpen(true)} disabled={!hasUnits} title={hasUnits ? undefined : 'Önce Daireler sayfasından daire ekleyin.'}>
            <UserPlus /> Sakin ekle ve davet et
          </Button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p role="status" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          {all.length === 0
            ? hasUnits
              ? 'Henüz sakin yok. “Sakin ekle ve davet et” ile ilk kişiyi ekleyin.'
              : 'Henüz sakin yok. Önce Daireler sayfasından daire ekleyin.'
            : 'Bu filtreyle eşleşen kimse yok.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad soyad</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>Daire</TableHead>
                <TableHead>İlişki</TableHead>
                <TableHead>Taşınma</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-16 text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((resident) => {
                const status = residentStatus(resident)
                const name = resident.fullName ?? resident.email ?? '—'
                const isCurrent = isCurrentResidency(resident, today)
                return (
                  <TableRow key={resident.residencyId}>
                    <TableCell>
                      <div className="font-medium">{name}</div>
                      <div className="text-xs text-muted-foreground">{resident.email}</div>
                    </TableCell>
                    <TableCell>{resident.phone ?? '—'}</TableCell>
                    <TableCell>
                      {resident.blockName} · {resident.doorNo}
                    </TableCell>
                    <TableCell>
                      <Badge variant={resident.relation === 'owner' ? 'default' : 'outline'}>{resident.relation === 'owner' ? 'Malik' : 'Kiracı'}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(resident.startDate)}
                      {resident.endDate ? ` – ${formatDate(resident.endDate)}` : ''}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon-sm" variant="ghost" aria-label={`${name} için işlemler`}>
                            <Ellipsis />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(resident)}>Bilgileri düzenle</DropdownMenuItem>
                          {canRequestLink(resident, today) && (
                            <DropdownMenuItem onSelect={() => void makeLink(resident)}>Giriş bağlantısı oluştur</DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {isCurrent && <DropdownMenuItem onSelect={() => setConfirm({ kind: 'end', resident })}>Taşındı olarak işaretle</DropdownMenuItem>}
                          {resident.isActive ? (
                            <DropdownMenuItem onSelect={() => setConfirm({ kind: 'deactivate', resident })}>Hesabı devre dışı bırak</DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => setConfirm({ kind: 'activate', resident })}>Hesabı etkinleştir</DropdownMenuItem>
                          )}
                          {(residencyCount.get(resident.profileId) ?? 0) > 1 && (
                            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: 'remove', resident })}>
                              Daireden çıkar (kaydı sil)
                            </DropdownMenuItem>
                          )}
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

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} blocks={blocks.data} units={units.data} onDone={onInvited} />
      <ResidentEditDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} resident={editing} onSaved={refresh} />
      {linkDialog && (
        <InviteLinkDialog
          open
          onOpenChange={(open) => !open && setLinkDialog(null)}
          link={linkDialog.link}
          name={linkDialog.name}
          phone={linkDialog.phone}
        />
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirmCopy?.title ?? ''}
        description={confirmCopy?.body ?? ''}
        confirmLabel={confirmCopy?.label ?? ''}
        destructive={confirmCopy?.destructive}
        onConfirm={runConfirm}
      />
    </>
  )
}

export function ResidentsPage() {
  return (
    <SiteGate title="Sakinler" description="Daire sakinleri, davetler ve hesap durumları. Malikler ve kiracılar burada yönetilir.">
      {(site) => <ResidentsContent site={site} />}
    </SiteGate>
  )
}
