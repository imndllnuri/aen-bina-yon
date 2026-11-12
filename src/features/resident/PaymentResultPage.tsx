import { useQuery } from '@tanstack/react-query'
import { CircleCheck, CircleX } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import { fetchReceipt, installmentsLabel, methodLabel } from '@/features/receipt/api'
import { ReceiptButton } from '@/features/receipt/ReceiptButton'
import { PaymentFrame } from './components/PaymentFrame'
import { useUserId } from './queries'

/** The result of a payment: the receipt number from the database, or a retry button after a failure. */
export function PaymentResultPage() {
  const [params] = useSearchParams()
  const location = useLocation()
  const userId = useUserId()
  const id = params.get('id')
  const failed = params.get('durum') === 'basarisiz'
  const chargeIds = (location.state as { chargeIds?: string[] } | null)?.chargeIds

  const receipt = useQuery({
    queryKey: ['receipt', userId ?? '', id ?? ''],
    queryFn: () => fetchReceipt(id!),
    enabled: userId !== null && id !== null,
  })

  if (failed) {
    return (
      <PaymentFrame title="Ödeme Başarısız">
        <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/10 p-5">
          <p className="flex items-center gap-2 font-medium">
            <CircleX className="size-6 text-destructive" aria-hidden="true" /> Ödeme tamamlanamadı.
          </p>
          <p className="text-sm">Hesabınızdan hiçbir tutar çekilmedi ve borçlarınız ödenmemiş olarak duruyor. İsterseniz yeniden deneyebilirsiniz.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/odeme" state={chargeIds ? { chargeIds } : undefined}>
              Tekrar dene
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/borclarim">Borçlarıma dön</Link>
          </Button>
        </div>
      </PaymentFrame>
    )
  }

  if (!id) {
    return (
      <PaymentFrame title="Ödeme Sonucu">
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Gösterilecek bir ödeme bulunamadı.
        </p>
        <Button asChild>
          <Link to="/odemelerim">Ödemelerim</Link>
        </Button>
      </PaymentFrame>
    )
  }

  return (
    <PaymentFrame title="Ödeme Başarılı">
      {receipt.isPending && <LoadingBlock />}
      {receipt.isError && <ErrorBlock text="Makbuz bilgisi şu anda yüklenemedi. Ödemeniz kaydedildi; Ödemelerim sayfasından görebilirsiniz." onRetry={() => void receipt.refetch()} />}
      {receipt.data && (
        <div className="space-y-4 rounded-xl border bg-card p-5">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <CircleCheck className="size-6 text-success" aria-hidden="true" /> Ödemeniz alındı.
          </p>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Makbuz no</dt>
              <dd className="font-semibold">{receipt.data.receiptNo}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tutar</dt>
              <dd className="font-semibold tabular-nums">{formatKurus(receipt.data.totalKurus)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tarih</dt>
              <dd>{formatDateTime(receipt.data.paidAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Yöntem</dt>
              <dd>
                {methodLabel(receipt.data.method)} · {installmentsLabel(receipt.data.installments)}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">Bu bir deneme ödemesidir. Gerçek para çekilmemiştir.</p>
          <ReceiptButton paymentId={id} label="Makbuzu İndir (PDF)" variant="default" />
        </div>
      )}
      <Button asChild variant="outline">
        <Link to="/borclarim">Borçlarıma dön</Link>
      </Button>
    </PaymentFrame>
  )
}
