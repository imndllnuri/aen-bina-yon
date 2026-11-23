import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ErrorBlock, FormError, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fetchAnnouncementReport, resendAnnouncementUnread, type AdminAnnouncement, type ReportRow } from '@/features/announcements/api'
import { announcementErrorMessage } from '@/features/announcements/lib/messages'
import { announcementState } from '@/features/announcements/lib/state'
import { useRefreshAnnouncements } from '@/features/announcements/queries'
import { formatDateTime } from '@/lib/format'

const RELATION: Record<string, string> = { owner: 'Kat Maliki', tenant: 'Kiracı' }
const relationText = (value: string) => value.split(', ').map((r) => RELATION[r] ?? r).join(', ')

function Person({ row }: { row: ReportRow }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm">
      <span>
        <span className="font-medium">{row.fullName ?? 'İsimsiz'}</span>
        <span className="text-muted-foreground">
          {' '}
          · {row.units} · {relationText(row.relations)}
        </span>
      </span>
      {row.readAt && <span className="text-xs text-muted-foreground">{formatDateTime(row.readAt)}</span>}
    </li>
  )
}

/** Who got an announcement and who opened it. The numbers come from the same rows as the list. */
export function ReadReportDialog({ announcement, onOpenChange }: { announcement: AdminAnnouncement; onOpenChange: (open: boolean) => void }) {
  const report = useQuery({ queryKey: ['announcements', 'report', announcement.id], queryFn: () => fetchAnnouncementReport(announcement.id), staleTime: 0 })
  const refresh = useRefreshAnnouncements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rows = report.data ?? []
  const unread = rows.filter((r) => r.readAt === null)
  const read = rows.filter((r) => r.readAt !== null)
  const active = announcementState(announcement, new Date()) === 'live'

  const resend = async () => {
    setBusy(true)
    setError(null)
    try {
      const count = await resendAnnouncementUnread(announcement.id)
      await Promise.all([refresh(), report.refetch()])
      toast.success(count > 0 ? `${count} kişiye hatırlatma gönderildi.` : 'Okumayan kimse kalmadı.')
    } catch (caught) {
      setError(announcementErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">Okuma raporu: {announcement.title}</DialogTitle>
          <DialogDescription>
            {report.data ? `${rows.length} kişiye gitti, ${read.length} kişi okudu, ${unread.length} kişi okumadı.` : 'Rapor yükleniyor…'}
          </DialogDescription>
        </DialogHeader>
        {report.isPending && <LoadingBlock />}
        {report.isError && <ErrorBlock text="Rapor şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void report.refetch()} />}
        {report.data && (
          <div className="space-y-5">
            <section aria-label="Okumayanlar" className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Okumayanlar ({unread.length})</h3>
                <Button variant="outline" size="sm" onClick={() => void resend()} disabled={busy || unread.length === 0 || !active}>
                  {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                  Okumayanlara tekrar gönder
                </Button>
              </div>
              {!active && <p className="text-xs text-muted-foreground">Hatırlatma yalnızca yayında olan duyurular için gönderilebilir.</p>}
              {unread.length === 0 ? <p className="text-sm text-muted-foreground">Herkes okudu.</p> : <ul className="divide-y">{unread.map((row) => <Person key={row.profileId} row={row} />)}</ul>}
            </section>
            <section aria-label="Okuyanlar" className="space-y-1">
              <h3 className="text-sm font-semibold">Okuyanlar ({read.length})</h3>
              {read.length === 0 ? <p className="text-sm text-muted-foreground">Henüz okuyan yok.</p> : <ul className="divide-y">{read.map((row) => <Person key={row.profileId} row={row} />)}</ul>}
            </section>
          </div>
        )}
        <FormError message={error} />
      </DialogContent>
    </Dialog>
  )
}
