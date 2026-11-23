import { ErrorBlock } from '@/components/StateBlocks'
import { Skeleton } from '@/components/ui/skeleton'
import type { RequestPhoto } from '../api'
import { useRequestPhotoUrls } from '../queries'

/**
 * The photos of a request. The bucket is private, so each one opens only through a short-lived link that the database hands
 * to the person the request belongs to and to the admins of the site. A tap opens the photo in full size in a new tab.
 */
export function PhotoGallery({ photos }: { photos: RequestPhoto[] }) {
  const paths = photos.map((photo) => photo.path)
  const urls = useRequestPhotoUrls(paths)
  if (photos.length === 0) return null
  if (urls.isPending) return <Skeleton className="h-32 w-full" role="status" aria-label="Fotoğraflar yükleniyor" />
  if (urls.isError) return <ErrorBlock text="Fotoğraflar şu anda açılamadı. Lütfen tekrar deneyin." onRetry={() => void urls.refetch()} />

  return (
    <div className="space-y-1.5">
      <ul className="grid grid-cols-3 gap-2" aria-label="Talebin fotoğrafları">
        {photos.map((photo, index) => {
          const url = urls.data[photo.path]
          return (
            <li key={photo.id} className="overflow-hidden rounded-lg border bg-muted/30">
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Fotoğraf ${index + 1}, tam boyutta aç`}>
                  <img src={url} alt={`Talep fotoğrafı ${index + 1}`} className="aspect-square w-full object-cover" loading="lazy" />
                </a>
              ) : (
                <p className="grid aspect-square place-items-center p-2 text-center text-xs text-muted-foreground">Bu fotoğraf açılamadı.</p>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">Fotoğraflar özeldir; bağlantılar yaklaşık 5 dakika geçerlidir.</p>
    </div>
  )
}
