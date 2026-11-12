import { Receipt } from 'lucide-react'
import { Link } from 'react-router'
import { IconCircle } from '@/components/IconCircle'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatDate } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import { useMyPayments } from '../queries'

/** "Son ödemeler" on the home page: the last three payments (the full list is Ödemelerim). */
export function RecentPayments() {
  const payments = useMyPayments()
  const last = (payments.data ?? []).filter((p) => p.status === 'approved').slice(0, 3)

  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <div className="flex items-center gap-3">
          <IconCircle icon={Receipt} />
          <h2 className="flex-1 font-medium">Son ödemeler</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/odemelerim">Tümünü gör</Link>
          </Button>
        </div>
        {payments.isError && <p className="text-sm text-muted-foreground">Ödemeler şu anda yüklenemedi.</p>}
        {!payments.isError && !payments.isPending && last.length === 0 && <p className="text-sm text-muted-foreground">Henüz bir ödeme yapılmadı.</p>}
        {last.length > 0 && (
          <ul className="divide-y text-sm">
            {last.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-muted-foreground">
                  {formatDate(payment.paidAt)} · {payment.receiptNo}
                </span>
                <span className="font-semibold tabular-nums">{formatKurus(payment.amountKurus + payment.feeKurus)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
