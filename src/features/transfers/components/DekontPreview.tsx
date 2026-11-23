import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { ErrorBlock } from '@/components/StateBlocks'
import { Skeleton } from '@/components/ui/skeleton'
import { dekontUrl } from '../api'

/**
 * The dekont the resident uploaded. The bucket is private, so the file opens only through a short-lived
 * link that the database hands to an admin of the unit's site. Images show here; a PDF opens in a new tab.
 */
export function DekontPreview({ path }: { path: string }) {
  const url = useQuery({ queryKey: ['transfers', 'dekont-url', path], queryFn: () => dekontUrl(path), staleTime: 4 * 60_000 })
  const isPdf = path.toLowerCase().endsWith('.pdf')

  if (url.isPending) return <Skeleton className="h-64 w-full" role="status" aria-label="Dekont yükleniyor" />
  if (url.isError) return <ErrorBlock text="Dekont şu anda açılamadı. Lütfen tekrar deneyin." onRetry={() => void url.refetch()} />

  return (
    <div className="space-y-2">
      {!isPdf && (
        <a href={url.data} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border bg-muted/30">
          <img src={url.data} alt="Sakinin yüklediği dekont" className="max-h-96 w-full object-contain" />
        </a>
      )}
      <a href={url.data} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline">
        <ExternalLink className="size-4" aria-hidden="true" />
        {isPdf ? 'PDF dekontu yeni sekmede aç' : 'Dekontu tam boyutta aç'}
      </a>
      <p className="text-xs text-muted-foreground">Dosya özeldir; bu bağlantı yaklaşık 5 dakika geçerlidir.</p>
    </div>
  )
}
