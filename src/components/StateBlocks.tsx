import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** The "loading" and "could not load" blocks every admin list shows. */
export function LoadingBlock() {
  return (
    <div className="space-y-3" role="status" aria-label="Yükleniyor">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-56 w-full" />
    </div>
  )
}

export function ErrorBlock({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <p>{text}</p>
      <Button variant="outline" onClick={onRetry}>
        Tekrar dene
      </Button>
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
      {message}
    </p>
  )
}
