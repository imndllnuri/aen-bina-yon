import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { ErrorBlock, FormError, LoadingBlock } from '@/components/StateBlocks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { deleteChargeType, saveChargeType, saveCompanyInfo, saveRules, type ChargeTypeRow, type CompanyView, type Rules } from '@/features/settings/api'
import { settingsErrorMessage } from '@/features/settings/lib/messages'
import { chargeTypeSchema, companySchema, rulesSchema, SPLIT_LABEL, type ChargeTypeValues, type CompanyValues, type RulesValues } from '@/features/settings/lib/schemas'
import { useAllChargeTypes, useCompany, useRefreshSettings } from '@/features/settings/queries'
import type { AdminSite } from './api'
import { BankAccountsCard } from './components/BankAccountsCard'
import { CheckboxField } from './components/CheckboxField'
import { ConfirmDialog } from './components/ConfirmDialog'
import { SiteGate } from './components/SiteGate'

const text = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))

function CompanyCard({ company }: { company: CompanyView }) {
  const refresh = useRefreshSettings()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<CompanyValues>({
    resolver: zodResolver(companySchema),
    defaultValues: { name: company.name, phone: company.phone ?? '', email: company.email ?? '', address: company.address ?? '', taxNo: company.taxNo ?? '' },
  })
  const onSubmit = async (values: CompanyValues) => {
    setError(null)
    try {
      await saveCompanyInfo(company.id, values)
      await refresh()
      reset(values)
      toast.success('Firma bilgileri kaydedildi.')
    } catch (caught) {
      setError(settingsErrorMessage(caught))
    }
  }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Firma bilgileri</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="co-name" label="Firma adı" required error={errors.name?.message}>
              {(props) => <Input {...props} {...register('name')} maxLength={200} autoComplete="organization" />}
            </FormField>
            <FormField id="co-tax" label="Vergi no" error={errors.taxNo?.message}>
              {(props) => <Input {...props} {...register('taxNo')} maxLength={30} autoComplete="off" />}
            </FormField>
            <FormField id="co-phone" label="Telefon" error={errors.phone?.message}>
              {(props) => <Input {...props} {...register('phone')} maxLength={30} autoComplete="tel" />}
            </FormField>
            <FormField id="co-email" label="E-posta" error={errors.email?.message}>
              {(props) => <Input {...props} {...register('email')} maxLength={200} type="email" autoComplete="email" />}
            </FormField>
          </div>
          <FormField id="co-address" label="Adres" error={errors.address?.message}>
            {(props) => <Textarea {...props} {...register('address')} rows={2} maxLength={500} />}
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

function RulesCard({ company }: { company: CompanyView }) {
  const refresh = useRefreshSettings()
  const rules: Rules = company.rules
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<RulesValues>({
    resolver: zodResolver(rulesSchema),
    defaultValues: {
      dueDay: String(rules.dueDay),
      ydoRate: text(rules.ydoRate),
      lateFeeRate: text(rules.lateFeeRate),
      lateFeeMethod: rules.lateFeeMethod,
      graceDays: String(rules.graceDays),
      commissionPayer: rules.commissionPayer,
      fee2: text(rules.fee[2]),
      fee3: text(rules.fee[3]),
      fee6: text(rules.fee[6]),
      fee9: text(rules.fee[9]),
    },
  })
  const payer = useWatch({ control, name: 'commissionPayer' })
  const onSubmit = async (values: RulesValues) => {
    setError(null)
    try {
      await saveRules(company.id, values)
      await refresh()
      reset(values)
      toast.success('Ayarlar kaydedildi.')
    } catch (caught) {
      setError(settingsErrorMessage(caught))
    }
  }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Vade, aidat artışı ve kart ödemesi</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold">Vade ve aidat artışı</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="ru-day" label="Son ödeme günü (ayın kaçı)" required error={errors.dueDay?.message} hint="Yeni borçlandırmalarda son ödeme tarihi bu güne göre hazır gelir (1–28). Kullanımda.">
                {(props) => <Input {...props} {...register('dueDay')} inputMode="numeric" className="w-28" />}
              </FormField>
              <FormField id="ru-ydo" label="Yıllık YDO oranı (%)" required error={errors.ydoRate?.message} hint="Aylık planın aidatı bundan fazla artarsa kurul karar no ve tarihi istenir. Kullanımda.">
                {(props) => <Input {...props} {...register('ydoRate')} inputMode="decimal" className="w-28" />}
              </FormField>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold">Gecikme tazminatı</legend>
            <p className="rounded-lg border bg-muted/40 p-3 text-sm">Bu üç değer <b>yalnızca kaydedilir</b>. Gecikme tazminatını hesaplayıp borç yazan bir sistem henüz yok; gelecekte bu değerleri kullanacak. Şimdilik tazminatı “Gecikme Tazminatı” borç türüyle elle yazabilirsiniz.</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField id="ru-late" label="Oran (% / ay)" required error={errors.lateFeeRate?.message} hint="Kanunda aylık %5.">
                {(props) => <Input {...props} {...register('lateFeeRate')} inputMode="decimal" />}
              </FormField>
              <FormField id="ru-method" label="Hesap yöntemi" required error={errors.lateFeeMethod?.message}>
                {(props) => (
                  <NativeSelect {...props} {...register('lateFeeMethod')}>
                    <option value="daily">Günlük (borç × oran ÷ 30 × gün)</option>
                    <option value="monthly">Başlanan her ay için</option>
                  </NativeSelect>
                )}
              </FormField>
              <FormField id="ru-grace" label="Ek süre (gün)" required error={errors.graceDays?.message} hint="Vadeden sonra tazminatın işlemeye başlamadığı gün sayısı.">
                {(props) => <Input {...props} {...register('graceDays')} inputMode="numeric" />}
              </FormField>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold">Kart ödemesi komisyonu</legend>
            <p className="rounded-lg border border-highlight/60 bg-highlight/10 p-3 text-sm">Kaydettiğiniz anda sakinlerin ödeme ekranındaki tutar değişir: “Sakin öder” seçilirse taksit oranları onların ödediği tutara eklenir. Kullanımda.</p>
            <FormField id="ru-payer" label="Komisyonu kim öder?" required error={errors.commissionPayer?.message}>
              {(props) => (
                <NativeSelect {...props} {...register('commissionPayer')} className="max-w-xs">
                  <option value="management">Yönetim öder (sakin ek ücret ödemez)</option>
                  <option value="resident">Sakin öder (taksit oranı eklenir)</option>
                </NativeSelect>
              )}
            </FormField>
            <div className="grid gap-4 sm:grid-cols-4">
              {([['fee2', '2 taksit'], ['fee3', '3 taksit'], ['fee6', '6 taksit'], ['fee9', '9 taksit']] as const).map(([name, label]) => (
                <FormField key={name} id={`ru-${name}`} label={`${label} (%)`} error={errors[name]?.message} hint={payer === 'resident' ? 'Boş = ek ücret yok' : 'Yönetim ödediği için kullanılmaz'}>
                  {(props) => <Input {...props} {...register(name)} inputMode="decimal" disabled={payer !== 'resident'} />}
                </FormField>
              ))}
            </div>
          </fieldset>

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

function ChargeTypeDialog({ companyId, type, onOpenChange }: { companyId: string; type: ChargeTypeRow | null; onOpenChange: (open: boolean) => void }) {
  const refresh = useRefreshSettings()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChargeTypeValues>({
    resolver: zodResolver(chargeTypeSchema),
    defaultValues: {
      name: type?.name ?? '',
      split: (type?.defaultSplit as ChargeTypeValues['split']) ?? 'per_unit',
      tenantVisible: type?.tenantVisibleDefault ?? true,
      active: type?.active ?? true,
      sort: String(type?.sortOrder ?? 50),
    },
  })
  const onSubmit = async (values: ChargeTypeValues) => {
    setError(null)
    try {
      await saveChargeType(companyId, type?.id ?? null, values)
      await refresh()
      toast.success(type ? 'Borç türü güncellendi.' : 'Borç türü eklendi.')
      onOpenChange(false)
    } catch (caught) {
      setError(settingsErrorMessage(caught))
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !isSubmitting && onOpenChange(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{type ? 'Borç türünü düzenle' : 'Yeni borç türü'}</DialogTitle>
          <DialogDescription>Borçlandırma sihirbazında bu ad görünür. Seçtiğiniz dağıtım ve “kiracıya yansıt” değeri sihirbazda hazır gelir; orada yine değiştirebilirsiniz.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormField id="ct-name" label="Ad" required error={errors.name?.message}>
            {(props) => <Input {...props} {...register('name')} maxLength={100} autoComplete="off" />}
          </FormField>
          <FormField id="ct-split" label="Varsayılan dağıtım" required error={errors.split?.message}>
            {(props) => (
              <NativeSelect {...props} {...register('split')}>
                {Object.entries(SPLIT_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <CheckboxField control={control} name="tenantVisible" id="ct-tenant" label="Kiracıya yansıt (kiracı bu borcu görür)" />
          <CheckboxField control={control} name="active" id="ct-active" label="Kullanımda (kapalıysa sihirbazda görünmez; eski borçlar kalır)" />
          <FormField id="ct-sort" label="Sıra" error={errors.sort?.message} hint="Küçük sayı listede önce gelir.">
            {(props) => <Input {...props} {...register('sort')} inputMode="numeric" className="w-24" />}
          </FormField>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
              Kaydet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const PROTECTED = new Set(['aidat', 'yakit', 'demirbas', 'ek_toplama', 'gecikme_tazminati', 'devir'])

function ChargeTypesCard({ companyId }: { companyId: string }) {
  const types = useAllChargeTypes(companyId)
  const refresh = useRefreshSettings()
  const [editing, setEditing] = useState<ChargeTypeRow | 'new' | null>(null)
  const [removing, setRemoving] = useState<ChargeTypeRow | null>(null)
  return (
    <Card size="sm">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Borç türleri</CardTitle>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus aria-hidden="true" /> Yeni borç türü
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {types.isPending && <LoadingBlock />}
        {types.isError && <ErrorBlock text="Borç türleri şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void types.refetch()} />}
        {types.data && (
          <ul className="divide-y rounded-lg border" aria-label="Borç türleri">
            {types.data.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t.name}</span>
                    {!t.active && <Badge variant="outline">Kapalı</Badge>}
                    {PROTECTED.has(t.code) && <Badge variant="secondary">Hazır</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {SPLIT_LABEL[t.defaultSplit] ?? t.defaultSplit} · {t.tenantVisibleDefault ? 'kiracıya yansır' : 'kiracı görmez'}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditing(t)} aria-label={`${t.name} türünü düzenle`}>
                  <Pencil aria-hidden="true" /> Düzenle
                </Button>
                {!PROTECTED.has(t.code) && (
                  <Button variant="ghost" size="sm" onClick={() => setRemoving(t)} aria-label={`${t.name} türünü sil`}>
                    <Trash2 aria-hidden="true" /> Sil
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">Hazır gelen türler silinemez, yalnızca kapatılabilir. Hiç kullanılmamış kendi türünüzü silebilirsiniz.</p>
      </CardContent>
      {editing && <ChargeTypeDialog key={editing === 'new' ? 'new' : editing.id} companyId={companyId} type={editing === 'new' ? null : editing} onOpenChange={(open) => !open && setEditing(null)} />}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRemoving(null)}
          title="Borç türünü sil"
          description={`“${removing.name}” silinecek. Bu türde hiç borç, toplu işlem ya da plan yoksa silinir; varsa silinmez.`}
          confirmLabel="Sil"
          destructive
          describeError={settingsErrorMessage}
          onConfirm={async () => {
            await deleteChargeType(removing.id)
            await refresh()
            toast.success('Borç türü silindi.')
          }}
        />
      )}
    </Card>
  )
}

function SettingsContent({ site }: { site: AdminSite }) {
  const company = useCompany(site.companyId)
  return (
    <div className="space-y-6">
      {company.isPending && <LoadingBlock />}
      {company.isError && <ErrorBlock text="Ayarlar şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void company.refetch()} />}
      {company.data && (
        <>
          {/* key: the form starts again from the saved values after each save */}
          <CompanyCard key={`co-${company.dataUpdatedAt}`} company={company.data} />
          <RulesCard key={`ru-${company.dataUpdatedAt}`} company={company.data} />
        </>
      )}
      <BankAccountsCard site={site} />
      <ChargeTypesCard companyId={site.companyId} />
      <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        Henüz yok (sonraya bırakıldı): talep kategorilerini düzenleme, mesaj şablonları, firma logosu, yönetici davet etme. Ödemenin “deneme / gerçek” anahtarı güvenlik gereği bu ekrandan değiştirilemez.
      </p>
    </div>
  )
}

/** Ayarlar: company information, the rules (due day, YDO, late fee, card commission), bank accounts and charge types. */
export function SettingsPage() {
  return (
    <SiteGate title="Ayarlar" description="Firma bilgileri, vade ve ödeme kuralları, banka hesapları ve borç türleri. Her kutunun yanında o değerin kullanımda mı yoksa yalnızca kayıtlı mı olduğu yazar.">
      {(site) => <SettingsContent site={site} />}
    </SiteGate>
  )
}
