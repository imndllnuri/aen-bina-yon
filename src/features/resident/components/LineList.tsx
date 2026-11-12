import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { formatDate, monthLabel } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import { STATUS_LABEL, type LedgerLine } from '../lib/ledger'

const BADGE: Record<LedgerLine['status'], 'outline' | 'destructive' | 'secondary'> = {
  open: 'outline',
  overdue: 'destructive',
  partial: 'outline',
  paid: 'secondary',
}

/**
 * One card per charge line (easy to read on a phone). A line that still owes money shows what is left;
 * a paid line shows its full amount and "Ödendi".
 * Residents are never shown whether a line is "for tenants": they only see what the database gave them.
 * With `onToggle`, lines that still owe money get a tick box (to pay several at once).
 */
export function LineList({
  lines,
  emptyText,
  selected,
  onToggle,
}: {
  lines: LedgerLine[]
  emptyText: string
  selected?: ReadonlySet<string>
  onToggle?: (id: string, on: boolean) => void
}) {
  if (lines.length === 0) {
    return (
      <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        {emptyText}
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {lines.map((line) => {
        const owes = line.remainingKurus > 0
        const label = `${line.typeName}${line.period ? ` ${monthLabel(line.period)}` : ''}`
        return (
          <li key={line.id}>
            <Card size="sm">
              <CardContent className="flex items-start justify-between gap-3">
                {onToggle && owes && (
                  <Checkbox
                    checked={selected?.has(line.id) ?? false}
                    onCheckedChange={(checked) => onToggle(line.id, checked === true)}
                    aria-label={`${label} seç`}
                    className="mt-1"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-medium">
                    {line.typeName}
                    {line.period && <span className="font-normal text-muted-foreground"> · {monthLabel(line.period)}</span>}
                  </p>
                  {line.description && <p className="text-sm text-muted-foreground">{line.description}</p>}
                  <p className="text-sm text-muted-foreground">Son ödeme: {formatDate(line.dueDate)}</p>
                  {line.status === 'partial' && <p className="text-xs text-muted-foreground">Ödenen: {formatKurus(line.paidKurus)}</p>}
                </div>
                <div className="shrink-0 space-y-1 text-right">
                  <p className="font-semibold tabular-nums">{formatKurus(owes ? line.remainingKurus : line.amountKurus)}</p>
                  <Badge variant={BADGE[line.status]} data-status={line.status}>
                    {STATUS_LABEL[line.status]}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
