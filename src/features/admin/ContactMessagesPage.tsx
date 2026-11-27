import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { NativeSelect } from '@/components/NativeSelect'
import { ErrorBlock, FormError, LoadingBlock } from '@/components/StateBlocks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { deleteMessage, fetchMessages, MESSAGE_STATUS, messageStatusLabel, updateMessageNote, updateMessageStatus, type MessageRow } from '@/features/messages/api'
import { formatDateTime } from '@/lib/format'
import { ConfirmDialog } from './components/ConfirmDialog'

const KEY = ['contact-messages'] as const

function describeError(error: unknown): string {
  const e = error as { code?: string; message?: string } | null | undefined
  if (e?.code === '42501' || e?.message === 'not allowed') return 'Bu işlem için yetkiniz yok.'
  if (e?.code === '23514') return 'Not en fazla 1000 karakter olabilir.'
  return 'İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.'
}

function NoteDialog({ item, onOpenChange }: { item: MessageRow; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState(item.adminNote ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await updateMessageNote(item.id, note)
      await queryClient.invalidateQueries({ queryKey: KEY })
      toast.success('Not kaydedildi.')
      onOpenChange(false)
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !busy && onOpenChange(open)}>
      <DialogContent className="max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>{formatDateTime(item.createdAt)} tarihinde geldi</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <p className="text-sm font-medium">Mesaj</p>
          {/* Plain text: line breaks are kept, nothing is read as HTML. */}
          <p className="whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 text-sm">{item.message}</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="message-note" className="text-sm font-medium">Notunuz (yalnızca yöneticiler görür)</label>
          <Textarea id="message-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={1000} />
        </div>
        <FormError message={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Vazgeç</Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            Notu kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** İletişim Mesajları: what visitors wrote in the public contact form, with a status and a note for each. */
export function ContactMessagesPage() {
  const queryClient = useQueryClient()
  const messages = useQuery({ queryKey: KEY, queryFn: fetchMessages, refetchOnMount: 'always' })
  const [filter, setFilter] = useState('')
  const [noting, setNoting] = useState<MessageRow | null>(null)
  const [removing, setRemoving] = useState<MessageRow | null>(null)
  const list = (messages.data ?? []).filter((m) => filter === '' || m.status === filter)

  const setStatus = async (item: MessageRow, status: string) => {
    try {
      await updateMessageStatus(item.id, status)
      await queryClient.invalidateQueries({ queryKey: KEY })
    } catch (caught) {
      toast.error(describeError(caught))
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">İletişim Mesajları</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Herkese açık İletişim formundan gelen mesajlar. Durumu ve notu siz yazarsınız; ziyaretçinin yazdığı metin değiştirilemez.</p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="message-filter" className="text-sm font-medium">Durum</label>
          <NativeSelect id="message-filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-48">
            <option value="">Tümü ({messages.data?.length ?? 0})</option>
            {MESSAGE_STATUS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {messages.isPending && <LoadingBlock />}
      {messages.isError && <ErrorBlock text="Mesajlar şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void messages.refetch()} />}
      {messages.data && list.length === 0 && (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          {messages.data.length === 0 ? 'Henüz mesaj gelmedi.' : 'Bu durumda mesaj yok.'}
        </p>
      )}
      {list.length > 0 && (
        <ul className="space-y-3" aria-label="İletişim mesajları">
          {list.map((m) => (
            <li key={m.id} className="space-y-2 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-sm text-muted-foreground">{formatDateTime(m.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={m.status === 'new' ? 'default' : 'outline'}>{messageStatusLabel(m.status)}</Badge>
                  <label htmlFor={`ms-${m.id}`} className="sr-only">
                    {m.name} için durum
                  </label>
                  <NativeSelect id={`ms-${m.id}`} value={m.status} onChange={(e) => void setStatus(m, e.target.value)} className="w-44">
                    {MESSAGE_STATUS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Telefon</dt>
                  <dd>{m.phone ? <a className="text-primary underline-offset-4 hover:underline" href={`tel:${m.phone}`}>{m.phone}</a> : '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">E-posta</dt>
                  <dd className="break-all">{m.email ? <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${m.email}`}>{m.email}</a> : '—'}</dd>
                </div>
              </dl>
              <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm">{m.message}</p>
              {m.adminNote && <p className="rounded-md border border-dashed bg-highlight/10 p-2 text-sm"><span className="font-medium">Not: </span>{m.adminNote}</p>}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setNoting(m)}>
                  Mesajın tamamı ve not
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRemoving(m)} aria-label={`${m.name} mesajını sil`}>
                  Sil
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {noting && <NoteDialog item={noting} onOpenChange={(open) => !open && setNoting(null)} />}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRemoving(null)}
          title="Mesajı sil"
          description={`“${removing.name}” mesajı kalıcı olarak silinecek. Bu geri alınamaz.`}
          confirmLabel="Sil"
          destructive
          describeError={describeError}
          onConfirm={async () => {
            await deleteMessage(removing.id)
            await queryClient.invalidateQueries({ queryKey: KEY })
            toast.success('Mesaj silindi.')
          }}
        />
      )}
    </div>
  )
}
