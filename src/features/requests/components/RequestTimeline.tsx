import { Check, Circle } from 'lucide-react'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RequestEvent } from '../api'
import { eventText, stepsFor } from '../lib/catalog'

/**
 * Where the request is (the five steps) and what happened so far (the history, oldest first).
 * `showNames`: admins see which admin did it; a resident reads "Yönetim".
 */
export function RequestTimeline({ status, events, showNames }: { status: string; events: RequestEvent[]; showNames: boolean }) {
  const steps = stepsFor(status)

  return (
    <div className="space-y-4">
      {steps ? (
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Talebin aşamaları">
          {steps.map((step, index) => (
            <li key={step.code} className="flex items-center gap-1" aria-current={step.state === 'current' ? 'step' : undefined}>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
                  step.state === 'done' && 'border-primary/30 bg-primary-soft text-primary',
                  step.state === 'current' && 'border-primary bg-primary text-primary-foreground',
                  step.state === 'todo' && 'text-muted-foreground',
                )}
              >
                {step.state === 'done' ? <Check className="size-3" aria-hidden="true" /> : <Circle className="size-3" aria-hidden="true" />}
                {step.label}
                <span className="sr-only">{step.state === 'done' ? ' (tamamlandı)' : step.state === 'current' ? ' (şu an)' : ' (henüz değil)'}</span>
              </span>
              {index < steps.length - 1 && <span className="text-muted-foreground" aria-hidden="true">›</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm">Bu talep iptal edildi.</p>
      )}

      <ul className="space-y-2 border-l pl-4" aria-label="Talebin geçmişi">
        {events.map((event) => (
          <li key={event.id} className="relative text-sm">
            <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-primary" aria-hidden="true" />
            <span className="font-medium">{eventText(event)}</span>
            {showNames && event.actorName && <span className="text-muted-foreground"> · {event.actorName}</span>}
            <div className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
