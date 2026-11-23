import { Loader2, Star } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormError } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { rateRequest } from '../api'
import { requestErrorMessage } from '../lib/catalog'
import { useRefreshRequests } from '../queries'

/** "5/5" shown as five stars (read only). */
export function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} / 5 puan`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('size-4', n <= value ? 'fill-highlight text-highlight' : 'text-muted-foreground')} aria-hidden="true" />
      ))}
    </span>
  )
}

/** After Çözüldü: the person rates the solution once, from 1 to 5. */
export function RatingPicker({ requestId }: { requestId: string }) {
  const refresh = useRefreshRequests()
  const [hover, setHover] = useState(0)
  const [picked, setPicked] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      await rateRequest(requestId, picked)
      await refresh()
      toast.success('Değerlendirmeniz için teşekkürler.')
    } catch (caught) {
      setError(requestErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const shown = hover || picked
  return (
    <div className="space-y-2 rounded-lg border bg-card p-4">
      <h3 className="font-medium">Çözümü değerlendirin</h3>
      <p className="text-sm text-muted-foreground">Talebiniz çözüldü. Memnun kaldınız mı? Bir kez puan verebilirsiniz.</p>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Puan">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={picked === n}
            aria-label={`${n} yıldız`}
            className="grid size-11 place-items-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setPicked(n)}
          >
            <Star className={cn('size-7', n <= shown ? 'fill-highlight text-highlight' : 'text-muted-foreground')} aria-hidden="true" />
          </button>
        ))}
      </div>
      <FormError message={error} />
      <Button type="button" onClick={() => void send()} disabled={busy || picked === 0}>
        {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
        Puanı gönder
      </Button>
    </div>
  )
}
