import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { site } from '@/config/site'
import { submitContactMessage } from './contact-api'
import { contactSchema, emptyContactForm, toContactRow, type ContactFormValues } from './contact-schema'

type Status = 'idle' | 'sent' | 'error'

const inputClass = 'h-10 md:h-10'

/** "Bize yazın": the public contact form on the İletişim page. */
export function ContactForm() {
  const [status, setStatus] = useState<Status>('idle')
  const sentRef = useRef<HTMLHeadingElement>(null)
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({ resolver: zodResolver(contactSchema), defaultValues: emptyContactForm, mode: 'onTouched' })

  // After sending, move the focus to the thank-you heading so screen readers announce it.
  useEffect(() => {
    if (status === 'sent') sentRef.current?.focus()
  }, [status])

  const onSubmit = async (values: ContactFormValues) => {
    setStatus('idle')
    // The honeypot field is hidden from people. If it has text, a bot filled the form: pretend it worked and send nothing.
    if (values.website !== '') {
      setStatus('sent')
      reset(emptyContactForm)
      return
    }
    const result = await submitContactMessage(toContactRow(values))
    if (result.ok) {
      setStatus('sent')
      reset(emptyContactForm)
    } else {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3">
          <CircleCheck className="size-8 text-success" aria-hidden="true" />
          <h2 ref={sentRef} tabIndex={-1} className="font-display text-xl font-semibold outline-none">
            Mesajınız alındı
          </h2>
          <p role="status" className="text-sm text-muted-foreground">
            Teşekkürler. En kısa sürede size dönüş yapacağız. Acil bir durum varsa bizi arayabilirsiniz:{' '}
            <a href={`tel:${site.phone.replace(/\s/g, '')}`} className="font-medium text-primary hover:underline">
              {site.phone}
            </a>
            .
          </p>
          <Button variant="outline" onClick={() => setStatus('idle')}>
            Yeni bir mesaj yaz
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent>
        <h2 className="font-display text-xl font-semibold">Bize yazın</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sorunuzu yazın; telefon veya e-posta bırakın, size dönelim.
          <span className="sr-only"> Yıldızlı alanlar zorunludur.</span>
        </p>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 space-y-5" aria-label="İletişim formu">
          <FormField id="contact-name" label="Adınız soyadınız" required error={errors.name?.message}>
            {(props) => <Input {...props} {...register('name')} autoComplete="name" className={inputClass} />}
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="contact-phone" label="Telefon" error={errors.phone?.message} hint="Telefon veya e-posta yazmanız yeterli.">
              {(props) => <Input {...props} {...register('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="0532 000 00 00" className={inputClass} />}
            </FormField>
            <FormField id="contact-email" label="E-posta" error={errors.email?.message}>
              {(props) => <Input {...props} {...register('email')} type="email" autoComplete="email" placeholder="ad@ornek.com" className={inputClass} />}
            </FormField>
          </div>

          <FormField id="contact-message" label="Mesajınız" required error={errors.message?.message}>
            {(props) => <Textarea {...props} {...register('message')} rows={5} />}
          </FormField>

          {/* Honeypot. Hidden from people and screen readers; bots tend to fill it. */}
          <div aria-hidden="true" className="sr-only">
            <label htmlFor="contact-website">Bu alanı boş bırakın</label>
            <input id="contact-website" tabIndex={-1} autoComplete="off" {...register('website')} />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-start gap-3">
              <Controller
                control={control}
                name="kvkk"
                render={({ field }) => (
                  <Checkbox
                    id="contact-kvkk"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    onBlur={field.onBlur}
                    aria-invalid={Boolean(errors.kvkk)}
                    aria-describedby={errors.kvkk ? 'contact-kvkk-error' : undefined}
                    className="mt-0.5"
                  />
                )}
              />
              <label htmlFor="contact-kvkk" className="text-sm leading-snug">
                <Link to="/kvkk" target="_blank" rel="noopener" className="font-medium text-primary underline-offset-4 hover:underline">
                  KVKK Aydınlatma Metni
                </Link>
                'ni okudum. Bilgilerimin mesajıma yanıt vermek amacıyla işlenmesini anladım.
              </label>
            </div>
            {errors.kvkk && (
              <p id="contact-kvkk-error" role="alert" className="text-sm text-destructive">
                {errors.kvkk.message}
              </p>
            )}
          </div>

          {status === 'error' && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              Mesajınız şu anda gönderilemedi. Lütfen biraz sonra tekrar deneyin ya da bizi arayın:{' '}
              <a href={`tel:${site.phone.replace(/\s/g, '')}`} className="font-medium underline">
                {site.phone}
              </a>
              .
            </p>
          )}

          <Button type="submit" size="lg" disabled={isSubmitting} className="h-11 px-6 text-base">
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? 'Gönderiliyor…' : 'Mesajı gönder'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
