import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormError } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ReceiptButton } from '@/features/receipt/ReceiptButton'
import { approveTransferNotice, rejectTransferNotice, type AdminNoticeRow } from '@/features/transfers/api'
import { useAllocation, type Selection } from '@/features/transfers/allocation'
import { AllocationPicker } from '@/features/transfers/components/AllocationPicker'
import { DekontPreview } from '@/features/transfers/components/DekontPreview'
import { NoticeStatusBadge } from '@/features/transfers/components/NoticeStatusBadge'
import { transferErrorMessage } from '@/features/transfers/lib/notices'
import { useRefreshTransfers } from '@/features/transfers/queries'
import { formatDate, formatDateTime } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import { ReasonDialog } from './ReasonDialog'

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

/**
 * One notice, side by side: the dekont on one side, the facts and "which lines close" on the other.
 * Approve makes the payment and the receipt in one step (the database does it). Reject needs a reason the resident can read.
 */
export function NoticeReviewDialog({ notice, onOpenChange }: { notice: AdminNoticeRow; onOpenChange: (open: boolean) => void }) {
  const refresh = useRefreshTransfers()
  const pending = notice.status === 'pending'
  const [selection, setSelection] = useState<Selection>({ mode: 'fifo' })
  const allocation = useAllocation({ unitId: notice.unitId, payerId: notice.senderId, amountKurus: pending ? notice.amountKurus : null }, selection)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)

  const approve = async () => {
    setBusy(true)
    setError(null)
    try {
      await approveTransferNotice(notice.id, allocation.chargeIds)
      await refresh()
      toast.success('Havale onaylandı. Ödeme ve makbuz oluşturuldu.')
      onOpenChange(false)
    } catch (caught) {
      setError(transferErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => !busy && onOpenChange(open)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Havale bildirimi · {notice.unitLabel} · {formatKurus(notice.amountKurus)}
            </DialogTitle>
            <DialogDescription>
              {pending ? 'Dekontu bankanızdaki hareketle karşılaştırın. Onaylarsanız ödeme ve makbuz hemen oluşur.' : 'Bu bildirim değerlendirilmiş.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 md:grid-cols-2">
            <section aria-label="Dekont" className="space-y-2">
              <h3 className="text-sm font-semibold">Dekont</h3>
              <DekontPreview path={notice.filePath} />
            </section>

            <section aria-label="Bildirim bilgileri" className="space-y-4">
              <dl className="divide-y rounded-lg border px-3">
                <Detail label="Durum">
                  <NoticeStatusBadge status={notice.status} paymentStatus={notice.paymentStatus} />
                </Detail>
                <Detail label="Tutar">{formatKurus(notice.amountKurus)}</Detail>
                <Detail label="Gönderim tarihi">{formatDate(notice.sentOn)}</Detail>
                <Detail label="Slipteki ad">{notice.senderName}</Detail>
                <Detail label="Bildiren sakin">
                  {notice.senderFullName ?? '—'}
                  {notice.senderPhone ? ` · ${notice.senderPhone}` : ''}
                </Detail>
                <Detail label="Bildirim zamanı">{formatDateTime(notice.createdAt)}</Detail>
                {notice.note && <Detail label="Açıklama">{notice.note}</Detail>}
                {notice.status === 'rejected' && notice.rejectReason && <Detail label="Red nedeni">{notice.rejectReason}</Detail>}
                {notice.receiptNo && <Detail label="Makbuz no">{notice.receiptNo}</Detail>}
              </dl>

              {pending && (
                <AllocationPicker idPrefix="notice" allocation={allocation} selection={selection} onSelectionChange={setSelection} amountKurus={notice.amountKurus} />
              )}
              {notice.paymentId && <ReceiptButton paymentId={notice.paymentId} />}
            </section>
          </div>

          <FormError message={error} />

          {pending && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
                Reddet
              </Button>
              <Button onClick={() => void approve()} disabled={busy || !allocation.ready}>
                {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                Onayla ve makbuz oluştur
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {rejecting && (
        <ReasonDialog
          open
          onOpenChange={(open) => !open && setRejecting(false)}
          title="Bildirimi reddet"
          description="Sakin bu nedeni kendi sayfasında okuyacak. Örneğin: “Tutar hesabımıza geçmedi” ya da “Dekont okunmuyor, yeniden yükleyin”."
          confirmLabel="Reddet"
          reasonLabel="Red nedeni"
          describeError={transferErrorMessage}
          onSubmit={async (reason) => {
            await rejectTransferNotice(notice.id, reason)
            await refresh()
            toast.success('Bildirim reddedildi. Sakin nedeni görecek.')
            onOpenChange(false)
          }}
        />
      )}
    </>
  )
}
