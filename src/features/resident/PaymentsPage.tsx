import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatDateTime } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import { installmentsLabel, methodLabel } from '@/features/receipt/api'
import { ReceiptButton } from '@/features/receipt/ReceiptButton'
import { PaymentFrame } from './components/PaymentFrame'
import { useMyPayments } from './queries'

/** Ödemelerim: the payments this person may see, each with its receipt (makbuz) as a PDF. */
export function PaymentsPage() {
  const payments = useMyPayments()

  return (
    <PaymentFrame title="Ödemelerim">
      {payments.isPending && <LoadingBlock />}
      {payments.isError && <ErrorBlock text="Ödemeleriniz şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void payments.refetch()} />}
      {payments.data && payments.data.length === 0 && (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Henüz bir ödeme yapılmadı. Borçlarım sayfasından ödeme yapabilirsiniz.
        </p>
      )}
      {payments.data && payments.data.length > 0 && (
        <ul className="space-y-2">
          {payments.data.map((payment) => (
            <li key={payment.id}>
              <Card size="sm">
                <CardContent className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="font-medium">{payment.receiptNo}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(payment.paidAt)} · {payment.unitLabel}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {methodLabel(payment.method)} · {installmentsLabel(payment.installments)}
                      {!payment.mine && payment.payerName ? ` · Ödeyen: ${payment.payerName}` : ''}
                    </p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="font-semibold tabular-nums">{formatKurus(payment.amountKurus + payment.feeKurus)}</p>
                    <Badge variant={payment.status === 'voided' ? 'destructive' : 'secondary'}>{payment.status === 'voided' ? 'İptal edildi' : 'Onaylandı'}</Badge>
                    <div>
                      <ReceiptButton paymentId={payment.id} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PaymentFrame>
  )
}
