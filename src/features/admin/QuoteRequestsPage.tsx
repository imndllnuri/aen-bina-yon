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
import { deleteQuote, fetchQuotes, QUOTE_STATUS, quoteStatusLabel, updateQuoteNote, updateQuoteStatus, type QuoteRow } from '@/features/quotes/api'
import { formatDateTime } from '@/lib/format'
import { ConfirmDialog } from './components/ConfirmDialog'

const KEY = ['quotes'] as const

function describeError(error: unknown): string {
  const e = error as { code?: string; message?: string } | null | undefined
  if (e?.code === '42501' || e?.message === 'not allowed') return 'Bu işlem için yetkiniz yok.'
  if (e?.code === '23514') return 'Not en fazla 1000 karakter olabilir.'
  return 'İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.'
}

function NoteDialog({ quote, onOpenChange }: { quote: QuoteRow; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState(quote.adminNote ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await updateQuoteNote(quote.id, note)
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
          <DialogTitle>{quote.name}</DialogTitle>
          <DialogDescription>{formatDateTime(quote.createdAt)} tarihinde geldi</DialogDescription>
        </DialogHeader>
        {quote.message && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Mesaj</p>
            {/* Plain text: line breaks are kept, nothing is read as HTML. */}
            <p className="whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 text-sm">{quote.message}</p>
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="quote-note" className="text-sm font-medium">Notunuz (yalnızca yöneticiler görür)</label>
          <Textarea id="quote-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={1000} />
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

/** Teklif Talepleri: the requests from the public form, with a status and a note for each. */
export function QuoteRequestsPage() {
  const queryClient = useQueryClient()
  const quotes = useQuery({ queryKey: KEY, queryFn: fetchQuotes, refetchOnMount: 'always' })
  const [filter, setFilter] = useState('')
  const [noting, setNoting] = useState<QuoteRow | null>(null)
  const [removing, setRemoving] = useState<QuoteRow | null>(null)
  const list = (quotes.data ?? []).filter((q) => filter === '' || q.status === filter)

  const setStatus = async (quote: QuoteRow, status: string) => {
    try {
      await updateQuoteStatus(quote.id, status)
      await queryClient.invalidateQueries({ queryKey: KEY })
    } catch (caught) {
      toast.error(describeError(caught))
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">Teklif Talepleri</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Herkese açık “Teklif Al” formundan gelen talepler. Durumu ve notu siz yazarsınız; ziyaretçinin yazdığı metin değiştirilemez.</p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="quote-filter" className="text-sm font-medium">Durum</label>
          <NativeSelect id="quote-filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-48">
            <option value="">Tümü ({quotes.data?.length ?? 0})</option>
            {QUOTE_STATUS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {quotes.isPending && <LoadingBlock />}
      {quotes.isError && <ErrorBlock text="Teklif talepleri şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void quotes.refetch()} />}
      {quotes.data && list.length === 0 && (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          {quotes.data.length === 0 ? 'Henüz teklif talebi gelmedi.' : 'Bu durumda talep yok.'}
        </p>
      )}
      {list.length > 0 && (
        <ul className="space-y-3" aria-label="Teklif talepleri">
          {list.map((q) => (
            <li key={q.id} className="space-y-2 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{q.name}</p>
                  <p className="text-sm text-muted-foreground">{formatDateTime(q.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={q.status === 'new' ? 'default' : 'outline'}>{quoteStatusLabel(q.status)}</Badge>
                  <label htmlFor={`qs-${q.id}`} className="sr-only">
                    {q.name} için durum
                  </label>
                  <NativeSelect id={`qs-${q.id}`} value={q.status} onChange={(e) => void setStatus(q, e.target.value)} className="w-44">
                    {QUOTE_STATUS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Telefon</dt>
                  <dd>{q.phone ? <a className="text-primary underline-offset-4 hover:underline" href={`tel:${q.phone}`}>{q.phone}</a> : '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">E-posta</dt>
                  <dd className="break-all">{q.email ? <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${q.email}`}>{q.email}</a> : '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Bina</dt>
                  <dd>{[q.buildingType, q.unitCount ? `${q.unitCount} daire` : null].filter(Boolean).join(' · ') || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Yer</dt>
                  <dd>{[q.ilce, q.il].filter(Boolean).join(', ') || '—'}</dd>
                </div>
              </dl>
              {q.message && <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm">{q.message}</p>}
              {q.adminNote && <p className="rounded-md border border-dashed bg-highlight/10 p-2 text-sm"><span className="font-medium">Not: </span>{q.adminNote}</p>}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setNoting(q)}>
                  Mesaj ve not
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRemoving(q)} aria-label={`${q.name} talebini sil`}>
                  Sil
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {noting && <NoteDialog quote={noting} onOpenChange={(open) => !open && setNoting(null)} />}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRemoving(null)}
          title="Teklif talebini sil"
          description={`“${removing.name}” talebi kalıcı olarak silinecek. Bu geri alınamaz.`}
          confirmLabel="Sil"
          destructive
          describeError={describeError}
          onConfirm={async () => {
            await deleteQuote(removing.id)
            await queryClient.invalidateQueries({ queryKey: KEY })
            toast.success('Talep silindi.')
          }}
        />
      )}
    </div>
  )
}
