import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/features/admin/components/ConfirmDialog'
import { ReceiptButton } from '@/features/receipt/ReceiptButton'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatDate, formatDateTime } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import { cancelTransferNotice, type NoticeRow } from '../api'
import { transferErrorMessage } from '../lib/notices'
import { useRefreshTransfers } from '../queries'
import { NoticeStatusBadge } from './NoticeStatusBadge'

/** The havale notices the person sent: status, the reason when rejected, the receipt when approved, "geri çek" while waiting. */
export function TransferNoticeList({ notices, emptyText }: { notices: NoticeRow[]; emptyText: string }) {
  const refresh = useRefreshTransfers()
  const [cancelling, setCancelling] = useState<NoticeRow | null>(null)

  if (notices.length === 0) {
    return (
      <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        {emptyText}
      </p>
    )
  }

  return (
    <>
      <ul className="space-y-2">
        {notices.map((notice) => (
          <li key={notice.id}>
            <Card size="sm">
              <CardContent className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="font-medium tabular-nums">{formatKurus(notice.amountKurus)}</p>
                  <p className="text-sm text-muted-foreground">
                    Gönderim: {formatDate(notice.sentOn)} · Bildirim: {formatDateTime(notice.createdAt)}
                  </p>
                  <p className="text-sm text-muted-foreground">Gönderen: {notice.senderName}</p>
                  {notice.note && <p className="text-sm text-muted-foreground">Açıklama: {notice.note}</p>}
                  {notice.status === 'rejected' && notice.rejectReason && (
                    <p className="text-sm font-medium text-destructive">Red nedeni: {notice.rejectReason}</p>
                  )}
                  {notice.status === 'approved' && notice.paymentStatus === 'voided' && (
                    <p className="text-sm font-medium text-destructive">Bu ödeme yönetim tarafından iptal edildi; borçlarınız yeniden ödenmemiş görünür.</p>
                  )}
                  {notice.receiptNo && <p className="text-sm text-muted-foreground">Makbuz no: {notice.receiptNo}</p>}
                </div>
                <div className="space-y-2 text-right">
                  <NoticeStatusBadge status={notice.status} paymentStatus={notice.paymentStatus} />
                  <div className="flex justify-end gap-2">
                    {notice.status === 'pending' && (
                      <Button variant="outline" size="sm" onClick={() => setCancelling(notice)}>
                        Geri çek
                      </Button>
                    )}
                    {notice.paymentId && <ReceiptButton paymentId={notice.paymentId} />}
                  </div>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {cancelling && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setCancelling(null)}
          title="Bildirimi geri çek"
          description={`${formatKurus(cancelling.amountKurus)} tutarındaki havale bildirimi geri çekilecek. Para gönderdiyseniz yönetime haber verin; yeniden bildirim gönderebilirsiniz.`}
          confirmLabel="Geri çek"
          destructive
          describeError={transferErrorMessage}
          onConfirm={async () => {
            await cancelTransferNotice(cancelling.id)
            await refresh()
            toast.success('Bildirim geri çekildi.')
          }}
        />
      )}
    </>
  )
}
