import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { ErrorBlock, FormError, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fetchAdminSites } from '@/features/admin/api'
import { adminKeys } from '@/features/admin/queries'
import { CheckboxField } from '@/features/admin/components/CheckboxField'
import { fetchMyUnits } from '@/features/resident/api'
import { relationLabel, unitLabel } from '@/features/resident/lib/unit-label'
import { residentKeys, useUserId } from '@/features/resident/queries'
import { useAuthState, type Role } from '@/lib/auth'
import { formatDateTime } from '@/lib/format'
import { changeMyPassword, saveMyContact, saveMyNotificationPrefs, signOutOtherSessions, type MyProfile } from './api'
import { isOn, PREF_KEYS, PREF_LABEL, type PrefKey } from './lib/prefs'
import { passwordChangeMessage, profileErrorMessage } from './lib/messages'
import { contactSchema, passwordChangeSchema, type ContactValues, type PasswordChangeValues } from './lib/schemas'
import { useMyProfile, useRefreshProfile } from './queries'

function ContactCard({ userId, profile, authEmail }: { userId: string; profile: MyProfile; authEmail: string }) {
  const refresh = useRefreshProfile()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { fullName: profile.fullName ?? '', phone: profile.phone ?? '' },
  })
  const onSubmit = async (values: ContactValues) => {
    setError(null)
    try {
      await saveMyContact(userId, values)
      await refresh()
      reset(values)
      toast.success('Bilgileriniz kaydedildi.')
    } catch (caught) {
      setError(profileErrorMessage(caught))
    }
  }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Kişisel bilgiler</CardTitle>
        <CardDescription>Yönetim size bu bilgilerle ulaşır.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="pf-name" label="Ad soyad" required error={errors.fullName?.message}>
              {(props) => <Input {...props} {...register('fullName')} maxLength={200} autoComplete="name" />}
            </FormField>
            <FormField id="pf-phone" label="Telefon" error={errors.phone?.message} hint="Örnek: 0532 000 00 00">
              {(props) => <Input {...props} {...register('phone')} maxLength={30} autoComplete="tel" inputMode="tel" />}
            </FormField>
          </div>
          <FormField id="pf-email" label="E-posta" hint="Giriş adresinizdir. Değiştirmek için yönetimle iletişime geçin.">
            {(props) => <Input {...props} value={profile.email ?? authEmail} readOnly disabled type="email" />}
          </FormField>
          <FormError message={error} />
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            Kaydet
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

type PrefValues = Record<PrefKey, boolean>

function PrefsCard({ profile }: { profile: MyProfile }) {
  const refresh = useRefreshProfile()
  const [error, setError] = useState<string | null>(null)
  const defaults = Object.fromEntries(PREF_KEYS.map((key) => [key, isOn(profile.prefs, key)])) as PrefValues
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty },
  } = useForm<PrefValues>({ defaultValues: defaults })
  const onSubmit = async (values: PrefValues) => {
    setError(null)
    try {
      const stored = await saveMyNotificationPrefs(values)
      await refresh()
      reset(Object.fromEntries(PREF_KEYS.map((key) => [key, isOn(stored, key)])) as PrefValues)
      toast.success('Bildirim tercihleriniz kaydedildi.')
    } catch (caught) {
      setError(profileErrorMessage(caught))
    }
  }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>E-posta bildirimleri</CardTitle>
        <CardDescription>Hangi konularda e-posta almak istediğinizi seçin.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <p className="rounded-lg border border-highlight/50 bg-highlight/10 p-3 text-sm">
            E-posta gönderimi henüz açık değil. Seçimleriniz şimdiden <b>yalnızca kaydedilir</b>; gönderim başladığında bunlara uyulur. Sitedeki zil (Bildirimler) her zaman açıktır.
          </p>
          <div className="space-y-3">
            {PREF_KEYS.map((key) => (
              <CheckboxField key={key} control={control} name={key} id={`pf-${key}`} label={PREF_LABEL[key].label} hint={PREF_LABEL[key].hint} />
            ))}
          </div>
          <FormError message={error} />
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            Kaydet
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function PasswordCard({ authEmail }: { authEmail: string }) {
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordChangeValues>({ resolver: zodResolver(passwordChangeSchema), defaultValues: { current: '', password: '', confirm: '' } })

  const onSubmit = async (values: PasswordChangeValues) => {
    setError(null)
    const result = await changeMyPassword(authEmail, values.current, values.password)
    if (!result.ok) {
      setError(passwordChangeMessage(result.reason))
      return
    }
    reset()
    if (result.othersClosed) toast.success('Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.')
    else toast.warning('Şifreniz değiştirildi, ancak diğer cihazlardaki oturumlar kapatılamadı. Aşağıdaki düğmeyi kullanın.')
  }

  const closeOthers = async () => {
    setClosing(true)
    const result = await signOutOtherSessions()
    setClosing(false)
    if (result.ok) toast.success('Diğer cihazlardaki oturumlar kapatıldı.')
    else toast.error('Oturumlar şu anda kapatılamadı. Lütfen tekrar deneyin.')
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Şifre</CardTitle>
        <CardDescription>Şifrenizi değiştirdiğinizde diğer cihazlardaki oturumlar kapatılır.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormField id="pf-current" label="Mevcut şifre" required error={errors.current?.message}>
            {(props) => <Input {...props} {...register('current')} type="password" autoComplete="current-password" />}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="pf-new" label="Yeni şifre" required error={errors.password?.message} hint="En az 8 karakter.">
              {(props) => <Input {...props} {...register('password')} type="password" autoComplete="new-password" />}
            </FormField>
            <FormField id="pf-confirm" label="Yeni şifre (tekrar)" required error={errors.confirm?.message}>
              {(props) => <Input {...props} {...register('confirm')} type="password" autoComplete="new-password" />}
            </FormField>
          </div>
          <FormError message={error} />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            Şifreyi değiştir
          </Button>
        </form>
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm text-muted-foreground">Telefonunuzu ya da bilgisayarınızı kaybettiyseniz, başka cihazlarda açık kalan oturumları şimdi kapatabilirsiniz. Bu cihazdaki oturumunuz açık kalır.</p>
          <Button type="button" variant="outline" onClick={() => void closeOthers()} disabled={closing}>
            {closing && <Loader2 className="animate-spin" aria-hidden="true" />}
            Diğer cihazlardaki oturumları kapat
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

const ROLE_LABEL: Record<Role, string> = { admin: 'Yönetici', resident: 'Sakin' }

function AccountCard({ userId, roles, profile }: { userId: string; roles: Role[]; profile: MyProfile }) {
  const isResident = roles.includes('resident')
  const isAdmin = roles.includes('admin')
  const units = useQuery({ queryKey: residentKeys.units(userId), queryFn: () => fetchMyUnits(userId), enabled: isResident })
  const sites = useQuery({ queryKey: adminKeys.sites(userId), queryFn: () => fetchAdminSites(userId), enabled: isAdmin })
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Hesabım</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Rolünüz</dt>
          <dd>{roles.length === 0 ? '—' : roles.map((r) => ROLE_LABEL[r]).join(' ve ')}</dd>
          {isResident && (
            <>
              <dt className="text-muted-foreground">Dairenizdeki yeriniz</dt>
              <dd>
                {units.isPending && 'Yükleniyor…'}
                {units.isError && 'Daireleriniz şu anda okunamadı.'}
                {units.data && units.data.length === 0 && '—'}
                {units.data && units.data.length > 0 && (
                  <ul className="space-y-1">
                    {units.data.map((u) => (
                      <li key={u.unitId}>
                        {u.siteName} · {unitLabel(u)} · {relationLabel(u)}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </>
          )}
          {isAdmin && (
            <>
              <dt className="text-muted-foreground">Yönettiğiniz siteler</dt>
              <dd>
                {sites.isPending && 'Yükleniyor…'}
                {sites.isError && 'Siteleriniz şu anda okunamadı.'}
                {sites.data && (sites.data.length === 0 ? '—' : sites.data.map((s) => s.name).join(', '))}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">KVKK aydınlatma metni</dt>
          <dd>
            {profile.kvkkAt ? `Okuduğunuzu ${formatDateTime(profile.kvkkAt)} tarihinde onayladınız.` : 'Onay kaydı yok.'}{' '}
            <Link to="/kvkk" className="font-medium text-primary underline-offset-4 hover:underline">
              Metni oku
            </Link>
          </dd>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">Verilerinizin düzeltilmesi, silinmesi ya da diğer KVKK başvuruları için yönetimle iletişime geçin.</p>
      </CardContent>
    </Card>
  )
}

/** Profilim: personal information, e-mail choices, password, and account facts. For residents and for admins. */
export function ProfilePage() {
  const auth = useAuthState()
  const userId = useUserId()
  const profile = useMyProfile(userId)
  const session = auth.data?.status === 'signed-in' ? auth.data : null

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:py-8">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">Profilim</h1>
        <p className="mt-1 text-sm text-muted-foreground">Bilgilerinizi, bildirim tercihlerinizi ve şifrenizi buradan yönetin.</p>
      </header>
      {(profile.isPending || !session) && <LoadingBlock />}
      {profile.isError && <ErrorBlock text="Profiliniz şu anda okunamadı. Lütfen tekrar deneyin." onRetry={() => void profile.refetch()} />}
      {session && userId && profile.data && (
        <>
          <ContactCard key={`c-${profile.dataUpdatedAt}`} userId={userId} profile={profile.data} authEmail={session.session.user.email ?? ''} />
          <PrefsCard key={`p-${profile.dataUpdatedAt}`} profile={profile.data} />
          <PasswordCard authEmail={session.session.user.email ?? ''} />
          <AccountCard userId={userId} roles={session.roles} profile={profile.data} />
        </>
      )}
    </div>
  )
}
