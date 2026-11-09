import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatDate, monthLabel } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import { STATUS_LABEL, type LedgerLine } from '../lib/ledger'

/**
 * One card per charge line (easy to read on a phone). The amount shown is what is still owed.
 * Residents are never shown whether a line is "for tenants": they only see what the database gave them.
 */
export function LineList({ lines, emptyText }: { lines: LedgerLine[]; emptyText: string }) {
  if (lines.length === 0) {
    return (
      <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        {emptyText}
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {lines.map((line) => (
        <li key={line.id}>
          <Card size="sm">
            <CardContent className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">
                  {line.typeName}
                  {line.period && <span className="font-normal text-muted-foreground"> · {monthLabel(line.period)}</span>}
                </p>
                {line.description && <p className="text-sm text-muted-foreground">{line.description}</p>}
                <p className="text-sm text-muted-foreground">Son ödeme: {formatDate(line.dueDate)}</p>
              </div>
              <div className="shrink-0 space-y-1 text-right">
                <p className="font-semibold tabular-nums">{formatKurus(line.remainingKurus)}</p>
                {line.remainingKurus > 0 ? (
                  <Badge variant={line.status === 'overdue' ? 'destructive' : 'outline'}>{STATUS_LABEL[line.status]}</Badge>
                ) : (
                  <Badge variant="secondary">Ödendi</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}
