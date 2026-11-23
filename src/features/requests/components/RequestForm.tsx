import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { FormError } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CATEGORIES, PRIORITIES, requestErrorMessage } from '../lib/catalog'
import type { PhotoShrinker } from '../lib/photo'
import { EMPTY_REQUEST, requestSchema, type RequestValues } from '../lib/schemas'
import { PhotoPicker, type PickedPhoto } from './PhotoPicker'

/**
 * The fields of a request: category, title, text, priority, place, and (when it is a new request) up to three photos.
 * The parent decides what "send" does; a refusal it throws is shown here in Turkish.
 */
export function RequestForm({
  idPrefix,
  defaults = EMPTY_REQUEST,
  submitLabel,
  withPhotos,
  onSubmit,
  onCancel,
  shrink,
}: {
  idPrefix: string
  defaults?: RequestValues
  submitLabel: string
  withPhotos: boolean
  onSubmit: (values: RequestValues, photos: PickedPhoto[]) => Promise<void>
  onCancel?: () => void
  /** Tests give a fake shrinker (jsdom has no canvas). */
  shrink?: PhotoShrinker
}) {
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestValues>({ resolver: zodResolver(requestSchema), defaultValues: defaults })

  const send = async (values: RequestValues) => {
    setError(null)
    try {
      await onSubmit(values, photos)
    } catch (caught) {
      setError(requestErrorMessage(caught))
    }
  }

  return (
    <form onSubmit={handleSubmit(send)} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${idPrefix}-category`} label="Kategori" required error={errors.category?.message}>
          {(props) => (
            <NativeSelect {...props} {...register('category')}>
              {CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField id={`${idPrefix}-priority`} label="Öncelik" required error={errors.priority?.message}>
          {(props) => (
            <NativeSelect {...props} {...register('priority')}>
              {PRIORITIES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>
      <FormField id={`${idPrefix}-title`} label="Başlık" required error={errors.title?.message} hint="Kısaca: ne oldu? Örnek: “A Blok asansörü çalışmıyor”">
        {(props) => <Input {...props} {...register('title')} maxLength={120} autoComplete="off" />}
      </FormField>
      <FormField id={`${idPrefix}-description`} label="Açıklama" required error={errors.description?.message} hint="Ne zaman başladı? Başka bir şey fark ettiniz mi?">
        {(props) => <Textarea {...props} {...register('description')} rows={4} maxLength={2000} />}
      </FormField>
      <FormField id={`${idPrefix}-location`} label="Konum (isteğe bağlı)" error={errors.location?.message} hint="Örnek: “Zemin kat girişi”, “3. kat merdiven boşluğu”">
        {(props) => <Input {...props} {...register('location')} maxLength={120} autoComplete="off" />}
      </FormField>
      {withPhotos && (
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Fotoğraf (isteğe bağlı, en fazla 3)</span>
          <PhotoPicker photos={photos} onChange={setPhotos} disabled={isSubmitting} shrink={shrink} />
          <p className="text-xs text-muted-foreground">Fotoğraflar telefondan çıkmadan küçültülür; konum bilgisi gibi gizli veriler gönderilmez.</p>
        </div>
      )}
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Vazgeç
          </Button>
        )}
      </div>
    </form>
  )
}
