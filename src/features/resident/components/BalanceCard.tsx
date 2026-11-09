import { CircleCheck } from 'lucide-react'
import { Link } from 'react-router'
import { ErrorBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import { useBalance } from '../queries'

/** "Ne kadar borcum var?": the number the database computes, the overdue part, and the next due date. */
export function BalanceCard({ unitId }: { unitId: string }) {
  const balance = useBalance(unitId)

  if (balance.isPending) return <Skeleton className="h-48 w-full" role="status" aria-label="Bakiye yükleniyor" />
  if (balance.isError) return <ErrorBlock text="Bakiyeniz şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void balance.refetch()} />

  const b = balance.data
  const owes = b.balanceKurus > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium text-muted-foreground">Toplam borç</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-4xl font-bold tabular-nums" aria-live="polite">
          {formatKurus(b.balanceKurus)}
        </p>

        {b.lineCount === 0 && <p className="text-sm text-muted-foreground">Henüz adınıza yazılmış bir borç yok.</p>}

        {b.lineCount > 0 && !owes && (
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <CircleCheck className="size-5" aria-hidden="true" /> Harika! Ödenmemiş borcunuz yok.
          </p>
        )}

        {b.overdueKurus > 0 && (
          <p className="text-sm font-medium text-destructive">
            Bunun {formatKurus(b.overdueKurus)} tutarı gecikmiş ({b.overdueCount} kalem).
          </p>
        )}

        {b.nextDueDate && (
          <p className="text-sm text-muted-foreground">
            En yakın son ödeme tarihi: <span className="font-medium text-foreground">{formatDate(b.nextDueDate)}</span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button disabled aria-describedby="pay-soon">
            Hemen Öde
          </Button>
          <Button asChild variant="outline">
            <Link to="/borclarim">Borçlarım</Link>
          </Button>
        </div>
        <p id="pay-soon" className="text-xs text-muted-foreground">
          Online ödeme çok yakında açılacak. O zamana kadar ödemelerinizi site yönetimine iletin.
        </p>
      </CardContent>
    </Card>
  )
}
