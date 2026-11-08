import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { AUTH_QUERY_KEY, homePathFor, loadAuthState, useAuthState, useSignOut } from '@/lib/auth'
import { setRememberMe } from '@/lib/session-storage'
import { authMessages, signInWithPassword, type AuthFailure } from './auth-api'
import { loginSchema, type LoginValues } from './auth-schemas'
import { AuthShell, PasswordInput, ProblemNote } from './AuthShell'

export function Login() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const signOut = useSignOut()
  const auth = useAuthState()
  const [failure, setFailure] = useState<AuthFailure | null>(null)

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: true },
  })

  const onSubmit = async (values: LoginValues) => {
    setFailure(null)
    // Decide where the session is stored BEFORE signing in ("Beni hatırla").
    setRememberMe(values.remember)

    const result = await signInWithPassword(values.email, values.password)
    if (!result.ok) {
      setFailure(result.reason)
      return
    }

    try {
      // Load the person's roles now, then go to their panel.
      const state = await queryClient.fetchQuery({ queryKey: AUTH_QUERY_KEY, queryFn: loadAuthState, staleTime: 0 })
      if (state.status === 'signed-in' && state.roles.length > 0) navigate(homePathFor(state.roles), { replace: true })
    } catch {
      // Signed in, but the roles could not be loaded. The page below shows a "try again" card.
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY })
    }
  }

  if (auth.isPending) {
    return (
      <section className="mx-auto max-w-md space-y-4 px-4 py-20" role="status" aria-label="Yükleniyor">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </section>
    )
  }

  // Signed in, but the roles could not be loaded (network, paused project...). Never redirect
  // here: the panel would send the person straight back and cause a loop.
  if (auth.isError) {
    return (
      <AuthShell icon={LockKeyhole} title="Hesap bilgileri yüklenemedi">
        <ProblemNote>Hesabınızın bilgileri şu anda alınamadı. Lütfen tekrar deneyin.</ProblemNote>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void auth.refetch()}>Tekrar dene</Button>
          <Button variant="outline" onClick={() => void signOut()}>
            Çıkış yap
          </Button>
        </div>
      </AuthShell>
    )
  }

  if (auth.data.status === 'signed-in') {
    // A deactivated person: say so clearly (not "not linked yet").
    if (!auth.data.active) {
      return (
        <AuthShell icon={LockKeyhole} title="Hesabınız devre dışı">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{auth.data.session.user.email}</strong> hesabı devre dışı bırakılmış. Bilgi için
            lütfen yönetimle iletişime geçin.
          </p>
          <Button variant="outline" onClick={() => void signOut()}>
            Çıkış yap
          </Button>
        </AuthShell>
      )
    }
    if (auth.data.roles.length > 0) return <Navigate to={homePathFor(auth.data.roles)} replace />
    // Signed in, but not linked to any site or unit yet.
    return (
      <AuthShell icon={LockKeyhole} title="Hesabınız henüz bağlanmamış">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{auth.data.session.user.email}</strong> hesabıyla giriş yaptınız, ancak hesabınız
          henüz bir site ya da daireye bağlanmamış. Lütfen yönetimle iletişime geçin.
        </p>
        <Button variant="outline" onClick={() => void signOut()}>
          Çıkış yap
        </Button>
      </AuthShell>
    )
  }

  const unconfigured = auth.data.status === 'unconfigured'

  return (
    <AuthShell icon={LockKeyhole} title="Giriş yap" description="Hesabınızla giriş yaparak borçlarınıza ve duyurulara ulaşın.">
      {unconfigured && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          Sunucu bağlantısı henüz kurulmadı (Supabase ayarları eksik). Giriş yapılabilmesi için önce bağlantı ayarlarının
          tamamlanması gerekir.
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField id="email" label="E-posta" error={errors.email?.message}>
          {(props) => (
            <Input
              {...props}
              {...register('email')}
              type="email"
              autoComplete="username"
              className="h-10"
              disabled={unconfigured}
            />
          )}
        </FormField>

        <FormField id="password" label="Şifre" error={errors.password?.message}>
          {(props) => (
            <PasswordInput {...props} {...register('password')} autoComplete="current-password" disabled={unconfigured} />
          )}
        </FormField>

        <div className="flex items-center justify-between gap-3">
          <label htmlFor="remember" className="flex items-center gap-2 text-sm">
            <Controller
              control={control}
              name="remember"
              render={({ field }) => (
                <Checkbox
                  id="remember"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              )}
            />
            Beni hatırla
          </label>
          <Link to="/sifremi-unuttum" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Şifremi unuttum
          </Link>
        </div>

        {failure && <ProblemNote>{authMessages[failure]}</ProblemNote>}

        <Button type="submit" size="lg" disabled={isSubmitting || unconfigured} className="h-11 w-full text-base">
          {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        Hesabınız yoksa yönetiminizin gönderdiği daveti bekleyin. Bu sitede kendi kendinize kayıt olunmaz.
      </p>
    </AuthShell>
  )
}
