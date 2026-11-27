import { Loader2, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { removeAdmin, type AdminRow } from '@/features/admins/api'
import { adminInviteMessage, adminsErrorMessage } from '@/features/admins/lib/messages'
import { useAdmins, useRefreshAdmins } from '@/features/admins/queries'
import { formatDate } from '@/lib/format'
import { requestAdminLink, type AdminSite } from './api'
import { ConfirmDialog } from './components/ConfirmDialog'
import { InviteAdminDialog, type InviteAdminDone } from './components/InviteAdminDialog'
import { InviteLinkDialog } from './components/InviteLinkDialog'
import { SiteGate } from './components/SiteGate'

function AdminsContent({ site, inviteOpen, onInviteOpenChange }: { site: AdminSite; inviteOpen: boolean; onInviteOpenChange: (open: boolean) => void }) {
  const admins = useAdmins(site.id)
  const refresh = useRefreshAdmins()
  const [removing, setRemoving] = useState<AdminRow | null>(null)
  const [linkDialog, setLinkDialog] = useState<{ link: string; name: string; phone: string | null } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const onInvited = async ({ result, name, phone }: InviteAdminDone) => {
    await refresh()
    if (result.link) setLinkDialog({ link: result.link, name, phone })
    else toast.success('Kişi yönetici yapıldı. Hesabını zaten kullandığı için yeni bir bağlantı gerekmez.')
  }

  const makeLink = async (admin: AdminRow) => {
    setBusyId(admin.profileId)
    const result = await requestAdminLink(site.id, admin.profileId)
    setBusyId(null)
    if (result.ok && result.link) setLinkDialog({ link: result.link, name: admin.fullName ?? admin.email ?? '', phone: admin.phone })
    else toast.error(adminInviteMessage(result.ok ? 'failed' : result.error))
  }

  return (
    <>
      {admins.isPending && <LoadingBlock />}
      {admins.isError && <ErrorBlock text="Yöneticiler şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void admins.refetch()} />}
      {admins.data && (
        <ul className="space-y-3" aria-label="Yöneticiler">
          {admins.data.map((a) => {
            const pending = a.isActive && a.activatedAt === null
            return (
              <li key={a.profileId} className="space-y-2 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {a.fullName ?? '—'} {a.isSelf && <Badge variant="secondary">Siz</Badge>}
                    </p>
                    <p className="break-all text-sm text-muted-foreground">{a.email ?? '—'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {pending && <Badge variant="outline">Davet bekliyor</Badge>}
                    {!a.isActive && <Badge variant="destructive">Hesap devre dışı</Badge>}
                    {a.isActive && !pending && <Badge>Etkin</Badge>}
                  </div>
                </div>
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Telefon</dt>
                    <dd>{a.phone ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Yönetici olduğu tarih</dt>
                    <dd>{formatDate(a.since.slice(0, 10))}</dd>
                  </div>
                </dl>
                {a.isSelf ? (
                  <p className="text-xs text-muted-foreground">Kendinizi listeden çıkaramazsınız. Bunu başka bir yönetici yapabilir.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {pending && (
                      <Button variant="outline" size="sm" onClick={() => void makeLink(a)} disabled={busyId === a.profileId} aria-label={`${a.fullName ?? a.email} için yeni bağlantı`}>
                        {busyId === a.profileId && <Loader2 className="animate-spin" aria-hidden="true" />}
                        Yeni bağlantı
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setRemoving(a)} aria-label={`${a.fullName ?? a.email} yöneticiliğini kaldır`}>
                      Yöneticiliği kaldır
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <InviteAdminDialog open={inviteOpen} onOpenChange={onInviteOpenChange} siteId={site.id} onDone={onInvited} />
      {linkDialog && <InviteLinkDialog open onOpenChange={(open) => !open && setLinkDialog(null)} link={linkDialog.link} name={linkDialog.name} phone={linkDialog.phone} admin />}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRemoving(null)}
          title="Yöneticilik kaldırılsın mı?"
          description={`${removing.fullName ?? removing.email} artık bu siteyi yönetemez. Hesabı ve varsa daire kaydı silinmez; kişi gerekirse yeniden yönetici yapılabilir. Bu işlem işlem geçmişine yazılır.`}
          confirmLabel="Kaldır"
          destructive
          describeError={adminsErrorMessage}
          onConfirm={async () => {
            try {
              await removeAdmin(site.id, removing.profileId)
            } finally {
              await refresh()
            }
            toast.success('Yöneticilik kaldırıldı.')
          }}
        />
      )}
    </>
  )
}

/** Yöneticiler: the admins of the site. Invite a new one, give a pending one a new link, or take the admin role away. */
export function AdminsPage() {
  const [inviteOpen, setInviteOpen] = useState(false)
  return (
    <SiteGate
      title="Yöneticiler"
      description="Bu siteyi yönetebilen kişiler. Yeni yönetici davet edebilir ya da birinin yöneticiliğini kaldırabilirsiniz. Her değişiklik işlem geçmişine yazılır."
      actions={() => (
        <Button onClick={() => setInviteOpen(true)}>
          <Plus aria-hidden="true" /> Yönetici davet et
        </Button>
      )}
    >
      {(site) => <AdminsContent site={site} inviteOpen={inviteOpen} onInviteOpenChange={setInviteOpen} />}
    </SiteGate>
  )
}
