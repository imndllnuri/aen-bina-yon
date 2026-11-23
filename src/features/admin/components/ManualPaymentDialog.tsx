import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { FormError } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { recordManualPayment, type ManualMethod } from '@/features/transfers/api'
import { useAllocation, type Selection } from '@/features/transfers/allocation'
import { AllocationPicker } from '@/features/transfers/components/AllocationPicker'
import { shiftDate } from '@/features/transfers/lib/lines'
import { transferErrorMessage } from '@/features/transfers/lib/notices'
import { manualPaymentSchema, PAYER_OTHER, type ManualPaymentValues } from '@/features/transfers/lib/schemas'
import { useRefreshTransfers } from '@/features/transfers/queries'
import { todayIstanbul } from '@/lib/format'
import { parseTryAmount } from '@/lib/money'
import { kurusOf } from '../lib/charge-schemas'
import { createRequestIds } from '@/lib/request-ids'
import type { AdminSite } from '../api'
import { useBlocks, useResidents, useUnits } from '../queries'

const METHODS: { value: ManualMethod; label: string }[] = [
  { value: 'cash', label: 'Nakit' },
  { value: 'pos', label: 'Ofiste kart (POS)' },
  { value: 'havale', label: 'Havale / EFT' },
]

export function ManualPaymentDialog({ open, onOpenChange, site }: { open: boolean; onOpenChange: (open: boolean) => void; site: AdminSite }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        {/* The form only exists while the dialog is open, so it starts empty every time. */}
        {open && <ManualPaymentForm site={site} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function ManualPaymentForm({ site, onClose }: { site: AdminSite; onClose: () => void }) {
  const today = todayIstanbul()
  const schema = useMemo(() => manualPaymentSchema(today), [today])
  const blocks = useBlocks(site.id)
  const units = useUnits(site.id)
  const residents = useResidents(site.id)
  const refresh = useRefreshTransfers()
  const [keyFor] = useState(() => createRequestIds())
  const [selection, setSelection] = useState<Selection>({ mode: 'fifo' })
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ManualPaymentValues>({
    resolver: zodResolver(schema),
    defaultValues: { unitId: '', payer: '', payerName: '', method: 'cash', amount: '', paidOn: today, note: '' },
  })
  // A different unit or payer means different open lines: start again from "oldest first".
  const resetSelection = () => setSelection({ mode: 'fifo' })

  const [unitId, payer, amountText] = useWatch({ control, name: ['unitId', 'payer', 'amount'] })
  const blockName = useMemo(() => new Map((blocks.data ?? []).map((b) => [b.id, b.name])), [blocks.data])
  const sortedUnits = useMemo(
    () =>
      [...(units.data ?? [])]
        .filter((u) => u.status !== 'archived')
        .sort((a, b) => (blockName.get(a.blockId) ?? '').localeCompare(blockName.get(b.blockId) ?? '', 'tr') || a.doorNo.localeCompare(b.doorNo, 'tr', { numeric: true })),
    [units.data, blockName],
  )
  // The people who live in the unit today (started, not moved out, account active).
  const people = useMemo(
    () =>
      (residents.data ?? []).filter((r) => r.unitId === unitId && r.isActive && r.startDate <= today && (r.endDate === null || r.endDate > today)),
    [residents.data, unitId, today],
  )

  const parsed = parseTryAmount(amountText)
  const amountKurus = parsed.ok && unitId !== '' && payer !== '' ? parsed.kurus : null
  const payerId = payer === '' || payer === PAYER_OTHER ? null : payer
  const allocation = useAllocation({ unitId, payerId, amountKurus }, selection)

  const onSubmit = async (values: ManualPaymentValues) => {
    setError(null)
    const request = {
      unitId: values.unitId,
      payerId: values.payer === PAYER_OTHER ? null : values.payer,
      payerName: values.payer === PAYER_OTHER ? values.payerName : null,
      method: values.method,
      amountKurus: kurusOf(values.amount),
      paidOn: values.paidOn,
      chargeIds: allocation.chargeIds,
      note: values.note || null,
    }
    try {
      await recordManualPayment({ ...request, requestId: keyFor(request) })
      await refresh()
      toast.success('Ödeme kaydedildi. Makbuzu listeden indirebilirsiniz.')
      onClose()
    } catch (caught) {
      setError(transferErrorMessage(caught))
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Elle ödeme gir</DialogTitle>
        <DialogDescription>
          Portal dışında alınan parayı kaydedin: nakit, ofisteki kart makinesi ya da bankadan gelen havale. Makbuz hemen oluşur.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="manual-unit" label="Daire" required error={errors.unitId?.message}>
            {(props) => (
              <NativeSelect
                {...props}
                {...register('unitId', {
                  onChange: () => {
                    setValue('payer', '')
                    resetSelection()
                  },
                })}
              >
                <option value="">Daire seçin</option>
                {sortedUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {blockName.get(unit.blockId)} · {unit.doorNo}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField id="manual-payer" label="Ödeyen kişi" required error={errors.payer?.message} hint="Dairede oturan biri seçilirse makbuzu kendi sayfasında görür.">
            {(props) => (
              <NativeSelect {...props} {...register('payer', { onChange: resetSelection })} disabled={unitId === ''}>
                <option value="">{unitId === '' ? 'Önce daire seçin' : 'Kişi seçin'}</option>
                {people.map((person) => (
                  <option key={person.profileId} value={person.profileId}>
                    {person.fullName ?? person.email ?? 'İsimsiz'} ({person.relation === 'owner' ? 'Kat Maliki' : 'Kiracı'})
                  </option>
                ))}
                <option value={PAYER_OTHER}>Başka biri (adını yazacağım)</option>
              </NativeSelect>
            )}
          </FormField>
        </div>
        {payer === PAYER_OTHER && (
          <FormField id="manual-payer-name" label="Ödeyen kişinin adı" required error={errors.payerName?.message}>
            {(props) => <Input {...props} {...register('payerName')} autoComplete="off" />}
          </FormField>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="manual-method" label="Yöntem" required error={errors.method?.message}>
            {(props) => (
              <NativeSelect {...props} {...register('method')}>
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField id="manual-amount" label="Tutar" required error={errors.amount?.message} hint="Örnek: 1.500,50">
            {(props) => <Input {...props} {...register('amount', { onChange: resetSelection })} inputMode="decimal" autoComplete="off" />}
          </FormField>
          <FormField id="manual-date" label="Ödeme tarihi" required error={errors.paidOn?.message}>
            {(props) => <Input {...props} {...register('paidOn')} type="date" max={today} min={shiftDate(today, -365)} />}
          </FormField>
        </div>
        <FormField id="manual-note" label="Açıklama (makbuzda görünür, isteğe bağlı)" error={errors.note?.message}>
          {(props) => <Textarea {...props} {...register('note')} rows={2} maxLength={300} />}
        </FormField>

        <AllocationPicker idPrefix="manual" allocation={allocation} selection={selection} onSelectionChange={setSelection} amountKurus={amountKurus} />

        <FormError message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={isSubmitting || !allocation.ready}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            Ödemeyi kaydet
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
