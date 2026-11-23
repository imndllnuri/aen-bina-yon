import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/features/admin/components/ConfirmDialog'
import { cancelRequest, updateRequest, type RequestDetail } from '@/features/requests/api'
import { PriorityBadge, StatusBadge } from '@/features/requests/components/Badges'
import { CommentForm, CommentThread } from '@/features/requests/components/CommentThread'
import { PhotoGallery } from '@/features/requests/components/PhotoGallery'
import { RatingPicker, Stars } from '@/features/requests/components/RatingPicker'
import { RequestForm } from '@/features/requests/components/RequestForm'
import { RequestTimeline } from '@/features/requests/components/RequestTimeline'
import { asCategory, asPriority, canRate, categoryLabel, requestErrorMessage } from '@/features/requests/lib/catalog'
import { useRefreshRequests, useRequestDetail, useUserId } from '@/features/requests/queries'
import { formatDateTime } from '@/lib/format'

function Facts({ request }: { request: RequestDetail }) {
  return (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      <div className="flex justify-between gap-3 sm:block">
        <dt className="text-muted-foreground">Kategori</dt>
        <dd className="font-medium">{categoryLabel(request.category)}</dd>
      </div>
      <div className="flex justify-between gap-3 sm:block">
        <dt className="text-muted-foreground">Daire</dt>
        <dd className="font-medium">{request.unitLabel}</dd>
      </div>
      {request.location && (
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-muted-foreground">Konum</dt>
          <dd className="font-medium">{request.location}</dd>
        </div>
      )}
      <div className="flex justify-between gap-3 sm:block">
        <dt className="text-muted-foreground">Açılış</dt>
        <dd className="font-medium">{formatDateTime(request.createdAt)}</dd>
      </div>
    </dl>
  )
}

function EditDialog({ request, onOpenChange }: { request: RequestDetail; onOpenChange: (open: boolean) => void }) {
  const refresh = useRefreshRequests()
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Talebi düzenle</DialogTitle>
          <DialogDescription>Yönetim ilgilenmeye başlayana kadar değiştirebilirsiniz. Fotoğraflar değiştirilemez.</DialogDescription>
        </DialogHeader>
        <RequestForm
          idPrefix="edit-request"
          submitLabel="Kaydet"
          withPhotos={false}
          defaults={{ category: asCategory(request.category), title: request.title, description: request.description, priority: asPriority(request.priority), location: request.location ?? '' }}
          onCancel={() => onOpenChange(false)}
          onSubmit={async (values) => {
            await updateRequest(request.id, { ...values, location: values.location === '' ? null : values.location })
            await refresh()
            toast.success('Talebiniz güncellendi.')
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function DetailContent({ request, myId }: { request: RequestDetail; myId: string | null }) {
  const navigate = useNavigate()
  const refresh = useRefreshRequests()
  const [editing, setEditing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const isOpen = request.status === 'acik'
  const closedText =
    request.status === 'kapandi' ? 'Bu talep kapandı. Yeni yorum yazılamaz; gerekirse yeni bir talep açın.' : request.status === 'iptal' ? 'Bu talep iptal edildi.' : undefined

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{request.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={request.status} />
          <PriorityBadge priority={request.priority} />
          {request.rating !== null && <Stars value={request.rating} />}
        </div>
      </header>

      <Facts request={request} />
      {/* Plain text: line breaks are kept, nothing is read as HTML. */}
      <p className="whitespace-pre-wrap break-words rounded-lg border bg-card p-4 text-sm">{request.description}</p>
      <PhotoGallery photos={request.photos} />

      {isOpen && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            Düzenle
          </Button>
          <Button variant="outline" onClick={() => setCancelling(true)}>
            Talebi iptal et
          </Button>
        </div>
      )}

      <section className="space-y-3" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="text-lg font-semibold">
          Durum
        </h2>
        <RequestTimeline status={request.status} events={request.events} showNames={false} />
      </section>

      {canRate(request.status) && request.rating === null && <RatingPicker requestId={request.id} />}

      <section className="space-y-3" aria-labelledby="thread-heading">
        <h2 id="thread-heading" className="text-lg font-semibold">
          Yorumlar
        </h2>
        <CommentThread comments={request.comments} viewer="resident" myId={myId} />
        <CommentForm requestId={request.id} viewer="resident" disabledText={closedText} />
      </section>

      {editing && <EditDialog request={request} onOpenChange={setEditing} />}
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Talebi iptal et"
        description="Talebiniz iptal edilir ve geri alınamaz. Devam etmek istiyor musunuz?"
        confirmLabel="Evet, iptal et"
        destructive
        describeError={requestErrorMessage}
        onConfirm={async () => {
          await cancelRequest(request.id)
          await refresh()
          toast.success('Talebiniz iptal edildi.')
          navigate('/taleplerim')
        }}
      />
    </div>
  )
}

/** One request of the person: the text, the photos, the five steps with the history, the thread, and (when it is solved) the rating. */
export function RequestDetailPage() {
  const { id = '' } = useParams()
  const myId = useUserId()
  const detail = useRequestDetail(id, false)

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:py-8">
      <Link to="/taleplerim" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        ← Taleplerime dön
      </Link>
      {detail.isPending && <LoadingBlock />}
      {detail.isError && <ErrorBlock text="Talep şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void detail.refetch()} />}
      {detail.data === null && (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Bu talep bulunamadı. Silinmiş olabilir ya da size ait olmayabilir.
        </p>
      )}
      {detail.data && <DetailContent request={detail.data} myId={myId} />}
      {detail.isFetching && !detail.isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Yenileniyor" />}
    </div>
  )
}
