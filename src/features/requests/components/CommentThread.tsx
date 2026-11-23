import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { FormError } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { addRequestComment, type RequestComment } from '../api'
import { requestErrorMessage } from '../lib/catalog'
import { useRefreshRequests } from '../queries'

/**
 * The thread. A resident sees "Siz" and "Yönetim" (and never an internal note: the database does not send one).
 * An admin sees names, and internal notes marked as such.
 */
export function CommentThread({ comments, viewer, myId }: { comments: RequestComment[]; viewer: 'admin' | 'resident'; myId: string | null }) {
  if (comments.length === 0) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Henüz yorum yok.
      </p>
    )
  }
  return (
    <ul className="space-y-3" aria-label="Yorumlar">
      {comments.map((comment) => {
        const mine = comment.authorId !== null && comment.authorId === myId
        const who = viewer === 'admin' ? (comment.authorName ?? (comment.byAdmin ? 'Yönetim' : 'Sakin')) : mine ? 'Siz' : 'Yönetim'
        return (
          <li
            key={comment.id}
            className={cn(
              'rounded-lg border p-3 text-sm',
              comment.isInternal ? 'border-dashed border-highlight bg-highlight/10' : comment.byAdmin ? 'bg-muted/40' : 'bg-card',
            )}
          >
            <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{who}</span>
              {viewer === 'admin' && comment.byAdmin && !comment.isInternal && <span>· sakine görünür</span>}
              {comment.isInternal && <span className="font-medium text-foreground">· İç not (sakin görmez)</span>}
              <span>· {formatDateTime(comment.createdAt)}</span>
            </div>
            {/* Plain text: line breaks are kept, nothing is read as HTML. */}
            <p className="whitespace-pre-wrap break-words">{comment.body}</p>
          </li>
        )
      })}
    </ul>
  )
}

/** Write a comment. An admin can tick "İç not": then only admins read it. */
export function CommentForm({ requestId, viewer, disabledText }: { requestId: string; viewer: 'admin' | 'resident'; disabledText?: string }) {
  const refresh = useRefreshRequests()
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (disabledText) {
    return (
      <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        {disabledText}
      </p>
    )
  }

  const send = async () => {
    const text = body.trim()
    if (text === '') {
      setError('Yorum yazın.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await addRequestComment(requestId, text, viewer === 'admin' && internal)
      setBody('')
      setInternal(false)
      await refresh()
    } catch (caught) {
      setError(requestErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
      noValidate
    >
      <label htmlFor="comment-body" className="text-sm font-medium">
        {viewer === 'admin' ? 'Yorum ya da iç not' : 'Yorum yaz'}
      </label>
      <Textarea id="comment-body" value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={2000} />
      {viewer === 'admin' && (
        <div className="flex items-start gap-3">
          <Checkbox id="comment-internal" checked={internal} onCheckedChange={(checked) => setInternal(checked === true)} className="mt-0.5" />
          <label htmlFor="comment-internal" className="text-sm leading-snug">
            İç not: sakin görmez, bildirim gitmez
          </label>
        </div>
      )}
      <FormError message={error} />
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
        {viewer === 'admin' && internal ? 'Notu kaydet' : 'Gönder'}
      </Button>
    </form>
  )
}
