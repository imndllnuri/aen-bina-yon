import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { ErrorBlock, FormError, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { setRequestStatus, setRequestTriage, type RequestDetail } from '@/features/requests/api'
import { PriorityBadge, SlaBadge, StatusBadge } from '@/features/requests/components/Badges'
import { CommentForm, CommentThread } from '@/features/requests/components/CommentThread'
import { PhotoGallery } from '@/features/requests/components/PhotoGallery'
import { Stars } from '@/features/requests/components/RatingPicker'
import { RequestTimeline } from '@/features/requests/components/RequestTimeline'
import { asCategory, asPriority, CATEGORIES, categoryLabel, PRIORITIES, requestErrorMessage, STEPS } from '@/features/requests/lib/catalog'
import { useRefreshRequests, useRequestDetail, useUserId } from '@/features/requests/queries'
import { formatDateTime } from '@/lib/format'

function StatusPanel({ request }: { request: RequestDetail }) {
  const refresh = useRefreshRequests()
  const [status, setStatus] = useState<string>(request.status)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reopening = (request.status === 'cozuldu' || request.status === 'kapandi') && (status === 'acik' || status === 'inceleniyor' || status === 'islemde')

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await setRequestStatus(request.id, status)
      await refresh()
      toast.success('Durum güncellendi. Sakine bildirim gitti.')
    } catch (caught) {
      setError(requestErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  if (request.status === 'iptal') {
    return <p className="rounded-lg border bg-muted/40 p-3 text-sm">Sakin bu talebi iptal etti. İptal edilmiş talepler değiştirilemez.</p>
  }
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">Durum</h2>
      <FormField id="status-select" label="Talebin durumu">
        {(props) => (
          <NativeSelect {...props} value={status} onChange={(event) => setStatus(event.target.value)}>
            {STEPS.map((step) => (
              <option key={step.code} value={step.code}>
                {step.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      {reopening && <p className="text-xs text-muted-foreground">Talebi yeniden açıyorsunuz: çözüm zamanı ve sakinin puanı silinir.</p>}
      <FormError message={error} />
      <Button onClick={() => void save()} disabled={busy || status === request.status}>
        {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
        Durumu kaydet
      </Button>
    </div>
  )
}

function TriagePanel({ request }: { request: RequestDetail }) {
  const refresh = useRefreshRequests()
  const [category, setCategory] = useState<string>(asCategory(request.category))
  const [priority, setPriority] = useState<string>(asPriority(request.priority))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (request.status === 'iptal') return null
  const changed = category !== request.category || priority !== request.priority

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await setRequestTriage(request.id, category, priority)
      await refresh()
      toast.success('Kategori ve öncelik kaydedildi.')
    } catch (caught) {
      setError(requestErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">Sınıflandırma</h2>
      <p className="text-xs text-muted-foreground">Sakine bildirim gitmez.</p>
      <FormField id="triage-category" label="Kategori">
        {(props) => (
          <NativeSelect {...props} value={category} onChange={(event) => setCategory(event.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField id="triage-priority" label="Öncelik">
        {(props) => (
          <NativeSelect {...props} value={priority} onChange={(event) => setPriority(event.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormError message={error} />
      <Button variant="outline" onClick={() => void save()} disabled={busy || !changed}>
        {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
        Kaydet
      </Button>
    </div>
  )
}

function DetailContent({ request, myId }: { request: RequestDetail; myId: string | null }) {
  const byAdmin = request.createdBy !== null && request.createdBy !== request.requesterId
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold sm:text-3xl">{request.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={request.status} />
            <PriorityBadge priority={request.priority} />
            <SlaBadge request={request} />
            {request.rating !== null && <Stars value={request.rating} />}
          </div>
        </header>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Daire</dt>
            <dd className="font-medium">{request.unitLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sakin</dt>
            <dd className="font-medium">
              {request.requesterName ?? '—'}
              {request.requesterPhone && (
                <>
                  {' · '}
                  <a href={`tel:${request.requesterPhone}`} className="text-primary underline-offset-4 hover:underline">
                    {request.requesterPhone}
                  </a>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Kategori</dt>
            <dd className="font-medium">{categoryLabel(request.category)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Açılış</dt>
            <dd className="font-medium">
              {formatDateTime(request.createdAt)}
              {byAdmin && <span className="text-muted-foreground"> · yönetim açtı (telefon)</span>}
            </dd>
          </div>
          {request.location && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Konum</dt>
              <dd className="font-medium">{request.location}</dd>
            </div>
          )}
        </dl>
        {/* Plain text: line breaks are kept, nothing is read as HTML. */}
        <p className="whitespace-pre-wrap break-words rounded-lg border bg-card p-4 text-sm">{request.description}</p>
        <PhotoGallery photos={request.photos} />

        <section className="space-y-3" aria-labelledby="thread-heading">
          <h2 id="thread-heading" className="text-lg font-semibold">
            Yorumlar ve notlar
          </h2>
          <CommentThread comments={request.comments} viewer="admin" myId={myId} />
          <CommentForm requestId={request.id} viewer="admin" />
        </section>
      </div>

      <aside className="space-y-4">
        <StatusPanel key={`${request.id}-${request.status}`} request={request} />
        <TriagePanel key={`${request.id}-${request.category}-${request.priority}`} request={request} />
        <section className="space-y-2" aria-labelledby="history-heading">
          <h2 id="history-heading" className="font-semibold">
            Geçmiş
          </h2>
          <RequestTimeline status={request.status} events={request.events} showNames />
        </section>
      </aside>
    </div>
  )
}

/** One request for the admin: facts, photos, the thread with internal notes, the status and the sorting. */
export function AdminRequestDetailPage() {
  const { id = '' } = useParams()
  const myId = useUserId()
  const detail = useRequestDetail(id, true)

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <Link to="/yonetim/talepler" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        ← Taleplere dön
      </Link>
      {detail.isPending && <LoadingBlock />}
      {detail.isError && <ErrorBlock text="Talep şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void detail.refetch()} />}
      {detail.data === null && (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Bu talep bulunamadı. Silinmiş olabilir ya da başka bir siteye ait olabilir.
        </p>
      )}
      {detail.data && <DetailContent request={detail.data} myId={myId} />}
    </div>
  )
}
