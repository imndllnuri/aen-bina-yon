import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, Loader2, ShieldAlert, UserRoundCheck } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { KVKK_VERSION } from '@/config/kvkk'
import { homePathFor, useAuthState } from '@/lib/auth'
import { acceptKvkk, authMessages, updatePassword, type AuthFailure } from './auth-api'
import { invitePasswordSchema, MIN_PASSWORD_LENGTH, newPasswordSchema, type NewPasswordValues } from './auth-schemas'
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
 *
 * The invite page ends with the KVKK consent. It is the LAST step on purpose: the admin page
 * treats "consent recorded" as "invite page finished" (and only then stops offering a new link).
 */
export function SetPassword({ mode }: { mode: Mode }) {
  const navigate = useNavigate()
  const auth = useAuthState()
  const [searchParams] = useSearchParams()
  const [failure, setFailure] = useState<AuthFailure | null>(null)
  // The password was saved but the consent could not be recorded: show a "try again" step.
  const [consentFailed, setConsentFailed] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const copy = COPY[mode]

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordValues>({
    resolver: zodResolver(mode === 'invite' ? invitePasswordSchema : newPasswordSchema),
    defaultValues: { password: '', confirm: '', kvkk: false },
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

  const finish = () => {
    toast.success('Şifreniz kaydedildi.')
    navigate(homePathFor(roles), { replace: true })
  }

  /** Records the consent (one quick second try if the first one fails). Returns true on success. */
  const recordConsent = async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await acceptKvkk(KVKK_VERSION)
      if (result.ok) return true
    }
    return false
  }

  const onSubmit = async ({ password }: NewPasswordValues) => {
    setFailure(null)
    const result = await updatePassword(password)
    if (!result.ok) {
      setFailure(result.reason)
      return
    }
    if (mode === 'invite' && !(await recordConsent())) {
      setConsentFailed(true)
      return
    }
    finish()
  }

  const retryConsent = async () => {
    setRetrying(true)
    const ok = await recordConsent()
    setRetrying(false)
    if (ok) finish()
  }

  if (consentFailed) {
    return (
      <AuthShell icon={ShieldAlert} title="Neredeyse tamam">
        <ProblemNote>
          Şifreniz kaydedildi, ancak KVKK onayınız kaydedilemedi. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.
        </ProblemNote>
        <Button onClick={() => void retryConsent()} disabled={retrying} className="h-11 w-full text-base">
          {retrying && <Loader2 className="animate-spin" aria-hidden="true" />}
          Tekrar dene
        </Button>
      </AuthShell>
    )
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

        {mode === 'invite' && (
          <div className="space-y-1.5">
            <div className="flex items-start gap-3">
              <Controller
                control={control}
                name="kvkk"
                render={({ field }) => (
                  <Checkbox
                    id="kvkk"
                    checked={field.value === true}
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
                &apos;ni okudum. Kişisel verilerimin bina yönetimi hizmeti kapsamında işlenmesini anladım.
              </label>
            </div>
            {errors.kvkk && (
              <p id="kvkk-error" role="alert" className="text-sm text-destructive">
                {errors.kvkk.message}
              </p>
            )}
          </div>
        )}

        {failure && <ProblemNote>{authMessages[failure]}</ProblemNote>}

        <Button type="submit" size="lg" disabled={isSubmitting} className="h-11 w-full text-base">
          {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Kaydediliyor…' : copy.button}
        </Button>
      </form>
    </AuthShell>
  )
}
