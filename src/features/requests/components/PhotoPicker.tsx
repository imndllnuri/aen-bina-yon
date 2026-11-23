import { ImagePlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MAX_PHOTOS } from '../lib/catalog'
import { photoSizeLabel, preparePhoto, type PhotoShrinker, type PreparedPhoto } from '../lib/photo'

/** A photo that is ready, with a small preview made in the browser (it is never uploaded from here). */
export interface PickedPhoto extends PreparedPhoto {
  previewUrl: string
}

/**
 * Up to three photos. A photo is checked and shrunk when it is picked; a problem is shown right under the button.
 * The parent owns the list, so it can upload exactly these files when the form is sent.
 */
export function PhotoPicker({
  photos,
  onChange,
  disabled,
  shrink,
}: {
  photos: PickedPhoto[]
  onChange: (photos: PickedPhoto[]) => void
  disabled?: boolean
  shrink?: PhotoShrinker
}) {
  const input = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Object URLs hold memory: free them when a photo is removed and when the picker goes away.
  const known = useRef<Set<string>>(new Set())
  useEffect(() => {
    const live = known.current
    return () => {
      live.forEach((url) => URL.revokeObjectURL(url))
      live.clear()
    }
  }, [])

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setMessage(null)
    setBusy(true)
    const next = [...photos]
    let problem: string | null = null
    for (const file of Array.from(files)) {
      if (next.length >= MAX_PHOTOS) {
        problem = `En fazla ${MAX_PHOTOS} fotoğraf ekleyebilirsiniz.`
        break
      }
      const result = await preparePhoto(file, shrink)
      if (!result.ok) {
        problem = result.message
        continue
      }
      const previewUrl = URL.createObjectURL(result.photo.blob)
      known.current.add(previewUrl)
      next.push({ ...result.photo, previewUrl })
    }
    onChange(next)
    setMessage(problem)
    setBusy(false)
    if (input.current) input.current.value = '' // the same file can be picked again after it was removed
  }

  const remove = (index: number) => {
    const gone = photos[index]
    if (gone) {
      URL.revokeObjectURL(gone.previewUrl)
      known.current.delete(gone.previewUrl)
    }
    onChange(photos.filter((_, i) => i !== index))
    setMessage(null)
  }

  const full = photos.length >= MAX_PHOTOS

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={disabled || busy || full} onClick={() => input.current?.click()}>
          <ImagePlus aria-hidden="true" />
          {busy ? 'Hazırlanıyor…' : 'Fotoğraf ekle'}
        </Button>
        <span className="text-sm text-muted-foreground">
          {photos.length}/{MAX_PHOTOS} fotoğraf · JPG, PNG veya WEBP
        </span>
        {/* The label of the hidden input: tests and screen readers find it by name. */}
        <input
          ref={input}
          type="file"
          aria-label="Fotoğraf seç"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          tabIndex={-1}
          disabled={disabled || busy || full}
          onChange={(event) => void onFiles(event.target.files)}
        />
      </div>
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((photo, index) => (
            <li key={photo.id} className="relative overflow-hidden rounded-lg border bg-muted/30">
              <img src={photo.previewUrl} alt={`Seçilen fotoğraf ${index + 1}`} className="aspect-square w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-background/80 px-1.5 py-0.5 text-xs">{photoSizeLabel(photo.blob.size)}</div>
              <Button
                type="button"
                variant="secondary"
                size="icon-lg"
                className="absolute right-1 top-1"
                disabled={disabled}
                onClick={() => remove(index)}
                aria-label={`Fotoğraf ${index + 1} kaldır`}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
