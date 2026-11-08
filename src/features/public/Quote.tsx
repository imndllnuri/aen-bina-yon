import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck, Loader2, MessageCircle, Phone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { site } from '@/config/site'
import { submitQuoteRequest } from './quote-api'
import { BUILDING_TYPES, emptyQuoteForm, quoteSchema, toQuoteRow, type QuoteFormValues } from './quote-schema'

type Status = 'idle' | 'sent' | 'error'

// Inputs are 40 px high here (shadcn's default is 32 px): easier to tap on a phone.
const inputClass = 'h-10 md:h-10'

export function Quote() {
  const [status, setStatus] = useState<Status>('idle')
  const headingRef = useRef<HTMLHeadingElement>(null)

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteSchema),
    defaultValues: emptyQuoteForm,
    mode: 'onTouched',
  })

  // After sending, move the focus to the thank-you heading so screen readers announce it.
  useEffect(() => {
    if (status === 'sent') headingRef.current?.focus()
  }, [status])

  const onSubmit = async (values: QuoteFormValues) => {
    setStatus('idle')

    // The honeypot field is hidden from people. If it has text, a bot filled the form:
    // pretend it worked and send nothing.
    if (values.website !== '') {
      setStatus('sent')
      reset(emptyQuoteForm)
      return
    }

    const result = await submitQuoteRequest(toQuoteRow(values))
    if (result.ok) {
      setStatus('sent')
      reset(emptyQuoteForm)
    } else {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <section className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
        <Card>
          <CardContent className="flex flex-col items-start gap-4">
            <CircleCheck className="size-10 text-success" aria-hidden="true" />
            <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none sm:text-3xl">
              Talebiniz alındı
            </h1>
            <p role="status" className="text-muted-foreground">
              Teşekkürler. En kısa sürede sizinle iletişime geçeceğiz. Acil bir durum varsa bizi arayabilirsiniz:{' '}
              <a href={`tel:${site.phone.replace(/\s/g, '')}`} className="font-medium text-primary hover:underline">
                {site.phone}
              </a>
              .
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setStatus('idle')} variant="outline">
                Yeni bir talep gönder
              </Button>
              <Button asChild>
                <Link to="/">Ana sayfaya dön</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    )
  }

  return (
    <section className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:py-16 lg:grid-cols-[1fr_20rem]">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Teklif Al</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Binanız için ücretsiz teklif almak istiyorsanız formu doldurun. Size bir iş günü içinde dönüş yapalım.
          <span className="sr-only"> Yıldızlı alanlar zorunludur.</span>
        </p>

        <Card className="mt-6">
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
              <FormField id="name" label="Adınız soyadınız" required error={errors.name?.message}>
                {(props) => <Input {...props} {...register('name')} autoComplete="name" className={inputClass} />}
              </FormField>

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="phone" label="Telefon" error={errors.phone?.message} hint="Telefon veya e-posta yazmanız yeterli.">
                  {(props) => (
                    <Input
                      {...props}
                      {...register('phone')}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="0532 000 00 00"
                      className={inputClass}
                    />
                  )}
                </FormField>
                <FormField id="email" label="E-posta" error={errors.email?.message}>
                  {(props) => (
                    <Input
                      {...props}
                      {...register('email')}
                      type="email"
                      autoComplete="email"
                      placeholder="ad@ornek.com"
                      className={inputClass}
                    />
                  )}
                </FormField>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="buildingType" label="Yapı tipi" required error={errors.buildingType?.message}>
                  {(props) => (
                    <NativeSelect {...props} {...register('buildingType')}>
                      <option value="">Seçin…</option>
                      {BUILDING_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </FormField>
                <FormField id="unitCount" label="Daire sayısı" required error={errors.unitCount?.message}>
                  {(props) => (
                    <Input {...props} {...register('unitCount')} inputMode="numeric" placeholder="16" className={inputClass} />
                  )}
                </FormField>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="il" label="İl" required error={errors.il?.message}>
                  {(props) => <Input {...props} {...register('il')} autoComplete="address-level1" className={inputClass} />}
                </FormField>
                <FormField id="ilce" label="İlçe" error={errors.ilce?.message}>
                  {(props) => <Input {...props} {...register('ilce')} autoComplete="address-level2" className={inputClass} />}
                </FormField>
              </div>

              <FormField id="message" label="Mesajınız" error={errors.message?.message} hint="İsteğe bağlı. Beklentilerinizi kısaca yazabilirsiniz.">
                {(props) => <Textarea {...props} {...register('message')} rows={4} />}
              </FormField>

              {/* Honeypot. Hidden from people and screen readers; bots tend to fill it. */}
              <div aria-hidden="true" className="sr-only">
                <label htmlFor="website">Bu alanı boş bırakın</label>
                <input id="website" tabIndex={-1} autoComplete="off" {...register('website')} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-start gap-3">
                  <Controller
                    control={control}
                    name="kvkk"
                    render={({ field }) => (
                      <Checkbox
                        id="kvkk"
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                        onBlur={field.onBlur}
                        aria-invalid={Boolean(errors.kvkk)}
                        aria-describedby={errors.kvkk ? 'kvkk-error' : undefined}
                        className="mt-0.5"
                      />
                    )}
                  />
                  <label htmlFor="kvkk" className="text-sm leading-snug">
                    <Link to="/kvkk" target="_blank" rel="noopener" className="font-medium text-primary underline-offset-4 hover:underline">
                      KVKK Aydınlatma Metni
                    </Link>
                    'ni okudum. Bilgilerimin teklif hazırlamak ve benimle iletişime geçmek amacıyla işlenmesini anladım.
                  </label>
                </div>
                {errors.kvkk && (
                  <p id="kvkk-error" role="alert" className="text-sm text-destructive">
                    {errors.kvkk.message}
                  </p>
                )}
              </div>

              {status === 'error' && (
                <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  Talebiniz şu anda gönderilemedi. Lütfen biraz sonra tekrar deneyin ya da bizi arayın:{' '}
                  <a href={`tel:${site.phone.replace(/\s/g, '')}`} className="font-medium underline">
                    {site.phone}
                  </a>
                  .
                </p>
              )}

              <Button type="submit" size="lg" disabled={isSubmitting} className="h-11 px-6 text-base">
                {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
                {isSubmitting ? 'Gönderiliyor…' : 'Teklif talebini gönder'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4 lg:pt-14">
        <Card>
          <CardContent className="space-y-3 text-sm">
            <h2 className="font-display text-base font-semibold">Hemen konuşalım</h2>
            <p className="text-muted-foreground">Formu doldurmak istemezseniz bize doğrudan ulaşın.</p>
            <a href={`tel:${site.phone.replace(/\s/g, '')}`} className="flex items-center gap-2 font-medium hover:underline">
              <Phone className="size-4 text-primary" aria-hidden="true" /> {site.phone}
            </a>
            <a
              href={`https://wa.me/${site.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 font-medium hover:underline"
            >
              <MessageCircle className="size-4 text-primary" aria-hidden="true" /> WhatsApp ile yazın
            </a>
            <p className="text-xs text-muted-foreground">{site.workingHours}</p>
          </CardContent>
        </Card>
      </aside>
    </section>
  )
}
