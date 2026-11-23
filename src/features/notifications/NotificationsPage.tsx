import { Bell, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/features/admin/components/ConfirmDialog'
import { formatDateTime } from '@/lib/format'
import { deleteAllNotifications, deleteNotification, markAllNotificationsRead, markNotificationRead, type NotificationRow } from './api'
import { kindLabel } from './lib/kinds'
import { safeInternalPath } from './lib/links'
import { useNotifications, useRefreshNotifications } from './queries'

/** Bildirimler: the bell feed of one person (resident or admin). Open one: it is marked read and the page it names opens. */
export function NotificationsPage() {
  const notifications = useNotifications()
  const refresh = useRefreshNotifications()
  const navigate = useNavigate()
  const [clearing, setClearing] = useState(false)
  const list = notifications.data ?? []
  const unread = list.filter((n) => n.readAt === null).length

  const open = async (item: NotificationRow) => {
    try {
      if (item.readAt === null) await markNotificationRead(item.id)
    } catch {
      /* the page still opens: reading the notification is not worth blocking the person */
    }
    await refresh()
    const path = safeInternalPath(item.link)
    if (path) navigate(path)
  }

  const run = async (action: () => Promise<void>, failure: string) => {
    try {
      await action()
      await refresh()
    } catch {
      toast.error(failure)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Bildirimler</h1>
          {notifications.data && <p className="mt-1 text-sm text-muted-foreground">{unread > 0 ? `${unread} okunmamış bildiriminiz var.` : 'Okunmamış bildiriminiz yok.'}</p>}
        </div>
        {list.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={unread === 0} onClick={() => void run(markAllNotificationsRead, 'Bildirimler işaretlenemedi. Lütfen tekrar deneyin.')}>
              Hepsini okundu yap
            </Button>
            <Button variant="outline" size="sm" onClick={() => setClearing(true)}>
              Hepsini sil
            </Button>
          </div>
        )}
      </header>

      {notifications.isPending && <LoadingBlock />}
      {notifications.isError && <ErrorBlock text="Bildirimleriniz şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void notifications.refetch()} />}
      {notifications.data && list.length === 0 && (
        <p role="status" className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          <Bell className="size-4" aria-hidden="true" /> Henüz bildiriminiz yok. Yeni borç, ödeme ve duyurular burada görünür.
        </p>
      )}
      {list.length > 0 && (
        <ul className="space-y-2">
          {list.map((item) => (
            <li key={item.id}>
              <Card size="sm" className={item.readAt === null ? 'ring-2 ring-primary/40' : undefined}>
                <CardContent className="flex items-start gap-3">
                  <button type="button" onClick={() => void open(item)} className="min-w-0 flex-1 space-y-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <span className="flex flex-wrap items-center gap-2">
                      {item.readAt === null && <span className="size-2 rounded-full bg-primary" role="img" aria-label="Okunmadı" />}
                      <span className={item.readAt === null ? 'font-semibold' : 'font-medium'}>{item.title}</span>
                      <Badge variant="outline">{kindLabel(item.kind)}</Badge>
                    </span>
                    {item.body && <span className="block text-sm text-muted-foreground [overflow-wrap:anywhere]">{item.body}</span>}
                    <span className="block text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                  </button>
                  <Button variant="ghost" size="icon" aria-label={`“${item.title}” bildirimini sil`} onClick={() => void run(() => deleteNotification(item.id), 'Bildirim silinemedi. Lütfen tekrar deneyin.')}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {clearing && (
        <ConfirmDialog
          open
          onOpenChange={(next) => !next && setClearing(false)}
          title="Tüm bildirimleri sil"
          description="Bütün bildirimleriniz silinecek. Borçlarınız, ödemeleriniz ve duyurular silinmez; yalnızca bu liste temizlenir."
          confirmLabel="Hepsini sil"
          destructive
          describeError={() => 'Bildirimler silinemedi. Lütfen tekrar deneyin.'}
          onConfirm={async () => {
            await deleteAllNotifications()
            await refresh()
          }}
        />
      )}
    </div>
  )
}
