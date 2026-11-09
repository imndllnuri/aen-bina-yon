import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { savePlan, type AdminSite, type BlockRow, type ChargeTypeRow, type PlanRow, type UnitRow } from '../api'
import { kurusOf, planSchema, type PlanValues } from '../lib/charge-schemas'
import { chargeErrorMessage, SPLIT_METHODS, type ChargeTarget, type SplitMethod } from '../lib/charges'
import { formatKurus, parseTryAmount } from '@/lib/money'
import { CheckboxField } from './CheckboxField'
import { FormError } from '@/components/StateBlocks'
import { TargetPicker } from './TargetPicker'

interface PlanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  site: AdminSite
  blocks: BlockRow[]
  units: UnitRow[]
  types: ChargeTypeRow[]
  /** Given: edit this plan. Missing: make a new one. */
  plan?: PlanRow
  onSaved: () => Promise<void>
}

const amountText = (kurus: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(kurus / 100)

/** A monthly plan: "every month, this amount, this split, due on this day". */
export function PlanDialog(props: PlanDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        {/* The form only exists while the dialog is open, so it starts fresh every time. */}
        <PlanForm {...props} />
      </DialogContent>
    </Dialog>
  )
}

function PlanForm({ onOpenChange, site, blocks, units, types, plan, onSaved }: PlanDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<ChargeTarget>(plan ? (plan.target as ChargeTarget) : { scope: 'site' })
  // The aidat increase rule: the database says when a decision (karar) is needed; then we ask for it.
  const [needsKarar, setNeedsKarar] = useState(Boolean(plan?.kararNo))
  const first = types[0]

  const form = useForm<PlanValues>({
    resolver: zodResolver(planSchema),
    defaultValues: plan
      ? {
          name: plan.name,
          typeId: plan.typeId,
          split: plan.splitMethod,
          amount: amountText(plan.amountKurus),
          day: String(plan.dayOfMonth),
          tenantVisible: plan.tenantVisible,
          description: plan.description ?? '',
          kararNo: plan.kararNo ?? '',
          kararDate: plan.kararDate ?? '',
        }
      : {
          name: '',
          typeId: first?.id ?? '',
          split: first?.defaultSplit ?? 'per_unit',
          amount: '',
          day: '5',
          tenantVisible: first?.tenantVisibleDefault ?? true,
          description: '',
          kararNo: '',
          kararDate: '',
        },
  })
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = form

  const split = useWatch({ control, name: 'split' }) as SplitMethod
  const splitInfo = SPLIT_METHODS.find((m) => m.value === split) ?? SPLIT_METHODS[0]
  const parsed = parseTryAmount(useWatch({ control, name: 'amount' }))
  const amountHint = parsed.ok ? `= ${formatKurus(parsed.kurus)}` : 'Örnek: 1.500,50'

  const onSubmit = async (values: PlanValues) => {
    setError(null)
    try {
      await savePlan({
        id: plan?.id ?? null,
        siteId: site.id,
        name: values.name,
        chargeTypeId: values.typeId,
        amountKurus: kurusOf(values.amount),
        split: values.split as SplitMethod,
        dayOfMonth: Number(values.day),
        target,
        tenantVisible: values.tenantVisible,
        description: values.description || null,
        kararNo: values.kararNo || null,
        kararDate: values.kararDate || null,
      })
      await onSaved()
      toast.success(plan ? 'Plan güncellendi.' : 'Plan eklendi.')
      onOpenChange(false)
    } catch (caught) {
      if ((caught as { message?: string } | null)?.message === 'karar_required') setNeedsKarar(true)
      setError(chargeErrorMessage(caught, { split: values.split as SplitMethod }))
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{plan ? 'Planı düzenle' : 'Aylık plan ekle'}</DialogTitle>
        <DialogDescription>
          Plan her ay “Bu ayı oluştur” ile borca dönüşür. Otomatik çalışmaz: ay başında planın yanındaki düğmeye siz basarsınız.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="plan-name" label="Plan adı" required error={errors.name?.message} hint="Örnek: Aylık aidat, A Blok yakıt">
            {(props) => <Input {...props} {...register('name')} maxLength={100} className="h-10" />}
          </FormField>
          <FormField id="plan-type" label="Borç türü" required error={errors.typeId?.message}>
            {(props) => (
              <NativeSelect
                {...props}
                {...register('typeId', {
                  onChange: (event) => {
                    // A NEW plan follows the defaults of the type. An existing plan keeps its choices.
                    const type = types.find((t) => t.id === event.target.value)
                    if (type && !plan) {
                      setValue('split', type.defaultSplit)
                      setValue('tenantVisible', type.tenantVisibleDefault)
                    }
                  },
                })}
              >
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField id="plan-split" label="Paylaştırma yöntemi" required error={errors.split?.message} hint={splitInfo.hint}>
            {(props) => (
              <NativeSelect {...props} {...register('split')}>
                {SPLIT_METHODS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField id="plan-amount" label={splitInfo.amountLabel} required error={errors.amount?.message} hint={amountHint}>
            {(props) => <Input {...props} {...register('amount')} inputMode="decimal" autoComplete="off" className="h-10" />}
          </FormField>
          <FormField id="plan-day" label="Son ödeme günü (her ayın)" required error={errors.day?.message} hint="1 ile 28 arasında. Her ayda bu gün vardır.">
            {(props) => <Input {...props} {...register('day')} inputMode="numeric" className="h-10" />}
          </FormField>
          <FormField id="plan-desc" label="Açıklama" error={errors.description?.message} hint="İsteğe bağlı. Sakin görür.">
            {(props) => <Input {...props} {...register('description')} maxLength={200} className="h-10" />}
          </FormField>
        </div>
        <TargetPicker blocks={blocks} units={units} value={target} onChange={setTarget} idPrefix="plan" />
        <CheckboxField
          control={control}
          name="tenantVisible"
          id="plan-tenant"
          label="Kiracıya yansıt"
          hint="Kapalıysa kiracı bu borcu görmez. Kat maliki her zaman görür."
        />
        {needsKarar && (
          <fieldset className="space-y-3 rounded-lg border border-highlight/60 bg-highlight/10 p-3">
            <legend className="px-1 text-sm font-medium">Kat malikleri kurulu kararı</legend>
            <p className="text-sm">Aidat artışı yıllık yeniden değerleme oranını aşıyor. Kararın numarasını ve tarihini yazın (KMK m. 37).</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="plan-karar-no" label="Karar numarası" required error={errors.kararNo?.message}>
                {(props) => <Input {...props} {...register('kararNo')} maxLength={60} className="h-10" />}
              </FormField>
              <FormField id="plan-karar-date" label="Karar tarihi" required error={errors.kararDate?.message}>
                {(props) => <Input {...props} {...register('kararDate')} type="date" className="h-10" />}
              </FormField>
            </div>
          </fieldset>
        )}
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
    </>
  )
}
