import { Badge } from '@/components/ui/badge'
import { priorityLabel, slaInfo, statusLabel, statusTone } from '../lib/catalog'

const VARIANT = { waiting: 'default', working: 'secondary', good: 'secondary', neutral: 'outline', bad: 'destructive' } as const

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={VARIANT[statusTone(status)]}>{statusLabel(status)}</Badge>
}

/** Normal is the usual case and gets no badge: only the exceptions (low, high, urgent) are shown. */
export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === 'normal') return null
  return <Badge variant={priority === 'acil' ? 'destructive' : 'outline'}>{priorityLabel(priority)}</Badge>
}

/** "2 gün kaldı" / "1 gün gecikti": only for requests that are still open (the admin's lists). */
export function SlaBadge({ request, now }: { request: { status: string; priority: string; createdAt: string }; now?: Date }) {
  const info = slaInfo(request, now)
  if (!info) return null
  return (
    <Badge variant={info.late ? 'destructive' : 'outline'} title="Öncelik düzeyine göre hedef süre">
      {info.label}
    </Badge>
  )
}
