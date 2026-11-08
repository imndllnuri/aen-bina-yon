import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, ShieldAlert, UserRoundCheck, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { homePathFor, useAuthState } from '@/lib/auth'
import { authMessages, updatePassword, type AuthFailure } from './auth-api'
import { MIN_PASSWORD_LENGTH, newPasswordSchema, type NewPasswordValues } from './auth-schemas'
import { AuthShell, PasswordInput, ProblemNote } from './AuthShell'

type Mode = 'invite' | 'recovery'

const COPY: Record<Mode, { title: string; description: string; button: string }> = {
  invite: {
    title: 'Hesabınızı etkinleştirin',
    description: 'Davetiniz için teşekkürler. Hesabınıza giriş yapmak için bir şifre belirleyin.',
    button: 'Şifreyi kaydet ve devam et',
  },
  recovery: {
    title: 'Yeni şifre belirleyin',
    description: 'Hesabınız için yeni bir şifre seçin.',
    button: 'Yeni şifreyi kaydet',
  },
}

/** Shown when the e-mail link was used before, has expired, or is broken. */
function LinkProblem({ mode }: { mode: Mode }) {
  return (
    <AuthShell icon={ShieldAlert} title="Bağlantı geçersiz">
      <ProblemNote>
        Bu bağlantı geçersiz ya da süresi dolmuş. Güvenlik nedeniyle her bağlantı yalnızca bir kez kullanılabilir.
      </ProblemNote>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/giris">Giriş sayfasına git</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/sifremi-unuttum">Şifremi unuttum</Link>
        </Button>
      </div>
      {mode === 'invite' && (
        <p className="text-sm text-muted-foreground">Davetiniz süresi dolduysa yönetimden yeni bir davet isteyin.</p>
      )}
    </AuthShell>
  )
}

/**
 * Used for two pages: /auth/onay (accept an invite) and /sifre-yenile (reset a password).
 * The person arrives here already signed in by the e-mail link (see src/lib/auth-redirect.ts).
 */
export function SetPassword({ mode }: { mode: Mode }) {
  const navigate = useNavigate()
  const auth = useAuthState()
  const [searchParams] = useSearchParams()
  const [failure, setFailure] = useState<AuthFailure | null>(null)
  const copy = COPY[mode]

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  })

  if (searchParams.get('error')) return <LinkProblem mode={mode} />

  if (auth.isPending) {
    return (
      <section className="mx-auto max-w-md space-y-4 px-4 py-20" role="status" aria-label="Yükleniyor">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </section>
    )
  }

  // Opened without a valid e-mail link (typed the address, or the session is gone).
  if (auth.isError || auth.data.status !== 'signed-in') return <LinkProblem mode={mode} />

  const { session, roles } = auth.data

  const onSubmit = async ({ password }: NewPasswordValues) => {
    setFailure(null)
    const result = await updatePassword(password)
    if (!result.ok) {
      setFailure(result.reason)
      return
    }
    toast.success('Şifreniz kaydedildi.')
    navigate(homePathFor(roles), { replace: true })
  }

  return (
    <AuthShell
      icon={mode === 'invite' ? UserRoundCheck : KeyRound}
      title={copy.title}
      description={copy.description}
    >
      {/* Shown on purpose: if someone sent you a link made for THEIR account, you would notice. */}
      <p className="rounded-lg bg-muted p-3 text-sm">
        Hesap: <strong>{session.user.email}</strong>
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField
          id="password"
          label="Yeni şifre"
          required
          hint={`En az ${MIN_PASSWORD_LENGTH} karakter.`}
          error={errors.password?.message}
        >
          {(props) => <PasswordInput {...props} {...register('password')} autoComplete="new-password" />}
        </FormField>

        <FormField id="confirm" label="Yeni şifre (tekrar)" required error={errors.confirm?.message}>
          {(props) => <PasswordInput {...props} {...register('confirm')} autoComplete="new-password" />}
        </FormField>

        {failure && <ProblemNote>{authMessages[failure]}</ProblemNote>}

        <Button type="submit" size="lg" disabled={isSubmitting} className="h-11 w-full text-base">
          {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Kaydediliyor…' : copy.button}
        </Button>
      </form>
    </AuthShell>
  )
}
