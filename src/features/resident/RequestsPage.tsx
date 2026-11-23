import { Plus } from 'lucide-react'
import { Link } from 'react-router'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { StatusBadge, PriorityBadge } from '@/features/requests/components/Badges'
import { categoryLabel, isOpenStatus } from '@/features/requests/lib/catalog'
import type { RequestListItem } from '@/features/requests/api'
import { useMyRequests } from '@/features/requests/queries'
import { formatDate } from '@/lib/format'
import type { MyUnit } from './api'
import { ResidentGate } from './components/ResidentGate'

function RequestRow({ request }: { request: RequestListItem }) {
  const waitingForRating = (request.status === 'cozuldu' || request.status === 'kapandi') && request.rating === null
  return (
    <li>
      <Link to={`/taleplerim/${request.id}`} className="block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="font-medium">{request.title}</span>
          <span className="flex flex-wrap gap-1.5">
            <PriorityBadge priority={request.priority} />
            <StatusBadge status={request.status} />
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {categoryLabel(request.category)} · {formatDate(request.createdAt)}
          {waitingForRating && <span className="font-medium text-foreground"> · Değerlendirmenizi bekliyor</span>}
        </p>
      </Link>
    </li>
  )
}

function List({ title, requests, empty }: { title: string; requests: RequestListItem[]; empty: string }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <h2 className="text-lg font-semibold">
        {title} ({requests.length})
      </h2>
      {requests.length === 0 ? (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {requests.map((request) => (
            <RequestRow key={request.id} request={request} />
          ))}
        </ul>
      )}
    </section>
  )
}

function RequestsContent({ unit }: { unit: MyUnit }) {
  const requests = useMyRequests()
  const mine = (requests.data ?? []).filter((request) => request.unitId === unit.unitId)

  return (
    <div className="space-y-6">
      <Button asChild>
        <Link to="/taleplerim/yeni">
          <Plus aria-hidden="true" /> Yeni talep
        </Link>
      </Button>
      {requests.isPending && <LoadingBlock />}
      {requests.isError && <ErrorBlock text="Talepleriniz şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void requests.refetch()} />}
      {requests.data && (
        <>
          <List title="Devam edenler" requests={mine.filter((r) => isOpenStatus(r.status))} empty="Devam eden talebiniz yok." />
          <List title="Tamamlananlar" requests={mine.filter((r) => !isOpenStatus(r.status))} empty="Tamamlanmış talebiniz yok." />
        </>
      )}
    </div>
  )
}

/** Taleplerim: the requests of the person for this unit, and a way to open a new one. */
export function RequestsPage() {
  return (
    <ResidentGate title="Taleplerim" description="Arıza, istek ya da önerinizi buradan bildirin; durumunu takip edin.">
      {(unit) => <RequestsContent key={unit.unitId} unit={unit} />}
    </ResidentGate>
  )
}
