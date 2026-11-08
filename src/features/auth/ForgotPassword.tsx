import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, Loader2, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { authMessages, requestPasswordReset, type AuthFailure } from './auth-api'
import { forgotSchema, type ForgotValues } from './auth-schemas'
import { AuthShell, ProblemNote } from './AuthShell'

export function ForgotPassword() {
  const [sent, setSent] = useState(false)
  const [failure, setFailure] = useState<AuthFailure | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } })

  const onSubmit = async ({ email }: ForgotValues) => {
    setFailure(null)
    const result = await requestPasswordReset(email)
    if (result.ok) setSent(true)
    else setFailure(result.reason)
  }

  if (sent) {
    return (
      <AuthShell icon={MailCheck} title="E-postanızı kontrol edin">
        {/* The same text is shown whether or not the address has an account. */}
        <p role="status" className="text-sm text-muted-foreground">
          Bu e-posta adresiyle kayıtlı bir hesap varsa, şifre yenileme bağlantısını gönderdik. Birkaç dakika içinde
          gelmezse gereksiz (spam) klasörünüze bakın ya da yönetimle iletişime geçin. Bağlantı yalnızca bir kez
          kullanılabilir.
        </p>
        <Button asChild variant="outline">
          <Link to="/giris">Giriş sayfasına dön</Link>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      icon={KeyRound}
      title="Şifremi unuttum"
      description="E-posta adresinizi yazın. Size şifrenizi yenilemeniz için bir bağlantı gönderelim."
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField id="email" label="E-posta" error={errors.email?.message}>
          {(props) => <Input {...props} {...register('email')} type="email" autoComplete="email" className="h-10" />}
        </FormField>

        {failure && <ProblemNote>{authMessages[failure]}</ProblemNote>}

        <Button type="submit" size="lg" disabled={isSubmitting} className="h-11 w-full text-base">
          {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Gönderiliyor…' : 'Bağlantı gönder'}
        </Button>
      </form>
      <Button asChild variant="ghost">
        <Link to="/giris">Giriş sayfasına dön</Link>
      </Button>
    </AuthShell>
  )
}
