import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { installmentsLabel, methodLabel } from '@/features/receipt/api'
import { ReceiptButton } from '@/features/receipt/ReceiptButton'
import { formatDateTime } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import { voidPayment, type AdminPaymentRow, type AdminSite } from './api'
import { ManualPaymentDialog } from './components/ManualPaymentDialog'
import { ReasonDialog } from './components/ReasonDialog'
import { SiteGate } from './components/SiteGate'
import { useAdminPayments, useRefreshCharges } from './queries'

function PaymentsContent({ site, manualOpen, onManualOpenChange }: { site: AdminSite; manualOpen: boolean; onManualOpenChange: (open: boolean) => void }) {
  const payments = useAdminPayments(site.id)
  const refresh = useRefreshCharges(site.id)
  const [voiding, setVoiding] = useState<AdminPaymentRow | null>(null)

  if (payments.isPending) return <LoadingBlock />
  if (payments.isError) return <ErrorBlock text="Tahsilatlar şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void payments.refetch()} />

  return (
    <>
      <ManualPaymentDialog open={manualOpen} onOpenChange={onManualOpenChange} site={site} />
      {payments.data.length === 0 && (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Henüz bir tahsilat yok. Sakinler ödeme yaptığında ya da siz “Elle ödeme gir” ile nakit / kart / havale kaydettiğinizde burada görünür.
        </p>
      )}
      {payments.data.length > 0 && (
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Makbuz</TableHead>
              <TableHead>Tarih</TableHead>
              <TableHead>Daire / ödeyen</TableHead>
              <TableHead>Yöntem</TableHead>
              <TableHead className="text-right">Tutar</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">İşlemler</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.data.map((payment) => (
              <TableRow key={payment.id} className={payment.status === 'voided' ? 'text-muted-foreground' : undefined}>
                <TableCell className="whitespace-nowrap font-medium">{payment.receiptNo}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDateTime(payment.paidAt)}</TableCell>
                <TableCell>
                  <div>{payment.unitLabel}</div>
                  <div className="text-xs text-muted-foreground">{payment.payerName ?? '—'}</div>
                </TableCell>
                <TableCell>
                  <div>{methodLabel(payment.method)}</div>
                  <div className="text-xs text-muted-foreground">
                    {payment.method === 'card' ? installmentsLabel(payment.installments) : ''}
                    {payment.provider === 'mock' ? ' · deneme' : ''}
                    {payment.provider === 'manual' ? 'elle giriş' : ''}
                  </div>
                  {payment.note && <div className="text-xs">Not: {payment.note}</div>}
                </TableCell>
                <TableCell className={`text-right tabular-nums ${payment.status === 'voided' ? 'line-through' : ''}`}>
                  {formatKurus(payment.amountKurus + payment.feeKurus)}
                  {payment.feeKurus > 0 && <div className="text-xs text-muted-foreground">komisyon {formatKurus(payment.feeKurus)}</div>}
                </TableCell>
                <TableCell>
                  <Badge variant={payment.status === 'voided' ? 'secondary' : 'outline'}>{payment.status === 'voided' ? 'İptal' : 'Onaylandı'}</Badge>
                  {payment.voidReason && <div className="mt-1 text-xs">Neden: {payment.voidReason}</div>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <ReceiptButton paymentId={payment.id} label="Makbuz" />
                    {payment.status === 'approved' && (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setVoiding(payment)}>
                        Ödemeyi iptal et
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}

      {voiding && (
        <ReasonDialog
          open
          onOpenChange={(open) => !open && setVoiding(null)}
          title={`Ödemeyi iptal et: ${voiding.receiptNo}`}
          description={`${voiding.unitLabel}, ${formatKurus(voiding.amountKurus + voiding.feeKurus)}. Makbuz silinmez; “İptal edildi” olarak kalır. Ödenen borçlar yeniden ödenmemiş olur. İptal geri alınamaz.`}
          confirmLabel="Ödemeyi iptal et"
          onSubmit={async (reason) => {
            await voidPayment(voiding.id, reason)
            await refresh()
            toast.success('Ödeme iptal edildi.')
          }}
        />
      )}
    </>
  )
}

/** Tahsilatlar: every payment of the site, its receipt, cancelling a payment, and "Elle ödeme gir" (cash, office card, havale). Refunds come later. */
export function AdminPaymentsPage() {
  const [manualOpen, setManualOpen] = useState(false)
  return (
    <SiteGate
      title="Tahsilatlar"
      description="Sakinlerin yaptığı ve sizin kaydettiğiniz ödemeler, makbuzlarıyla. Hatalı ya da deneme bir ödemeyi iptal edebilirsiniz."
      actions={() => <Button onClick={() => setManualOpen(true)}>Elle ödeme gir</Button>}
    >
      {(site) => <PaymentsContent site={site} manualOpen={manualOpen} onManualOpenChange={setManualOpen} />}
    </SiteGate>
  )
}
