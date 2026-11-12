import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createChargeBatch, type AdminSite, type BlockRow, type ChargeTypeRow, type CreateBatchInput, type UnitRow } from '../api'
import { chargeErrorMessage, currentMonthIstanbul, dueDateFor } from '../lib/charges'
import { kurusOf, singleChargeSchema, type SingleChargeValues } from '../lib/charge-schemas'
import { formatKurus } from '@/lib/money'
import { createRequestIds } from '@/lib/request-ids'
import { ChargeFields, type DetailsShape } from './ChargeFields'
import { FormError } from '@/components/StateBlocks'

interface SingleChargeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  site: AdminSite
  blocks: BlockRow[]
  units: UnitRow[]
  types: ChargeTypeRow[]
  onCreated: () => Promise<void>
}

/** One charge for one unit. In the database it is a batch of one unit with the split "per_unit". */
export function SingleChargeDialog(props: SingleChargeDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {/* The form only exists while the dialog is open, so it starts fresh every time. */}
        <SingleChargeForm {...props} />
      </DialogContent>
    </Dialog>
  )
}

function SingleChargeForm({ onOpenChange, site, blocks, units, types, onCreated }: SingleChargeDialogProps) {
  const [error, setError] = useState<string | null>(null)
  // The same request id for the same exact request: a double click cannot charge twice.
  const [keyFor] = useState(() => createRequestIds())
  const period = useMemo(() => currentMonthIstanbul(), [])
  const blockName = useMemo(() => new Map(blocks.map((b) => [b.id, b.name])), [blocks])
  const sortedUnits = useMemo(
    () => [...units].sort((a, b) => (blockName.get(a.blockId) ?? '').localeCompare(blockName.get(b.blockId) ?? '', 'tr')),
    [units, blockName],
  )

  const form = useForm<SingleChargeValues>({
    resolver: zodResolver(singleChargeSchema),
    defaultValues: {
      unitId: '',
      typeId: types[0]?.id ?? '',
      amount: '',
      period,
      dueDate: dueDateFor(period, 15),
      description: '',
      tenantVisible: types[0]?.tenantVisibleDefault ?? true,
    },
  })
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = form

  const onTypeChange = (typeId: string) => {
    const type = types.find((t) => t.id === typeId)
    if (type) setValue('tenantVisible', type.tenantVisibleDefault)
  }

  const onSubmit = async (values: SingleChargeValues) => {
    setError(null)
    const kurus = kurusOf(values.amount)
    const input: Omit<CreateBatchInput, 'requestId'> = {
      siteId: site.id,
      target: { scope: 'units', unit_ids: [values.unitId] },
      split: 'per_unit',
      amountKurus: kurus,
      chargeTypeId: values.typeId,
      period: values.period,
      dueDate: values.dueDate,
      description: values.description || null,
      tenantVisible: values.tenantVisible,
      kararNo: null,
      kararDate: null,
      expectedUnits: 1,
      expectedKurus: kurus,
    }
    try {
      await createChargeBatch({ ...input, requestId: keyFor(input) })
      await onCreated()
      toast.success(`${formatKurus(kurus)} borç eklendi.`)
      onOpenChange(false)
    } catch (caught) {
      setError(chargeErrorMessage(caught))
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Tek borç ekle</DialogTitle>
        <DialogDescription>Tek bir daireye borç yazın (örneğin anahtar bedeli ya da onarım payı). Birçok daireye birden borç yazmak için “Toplu borçlandır”ı kullanın.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField id="single-unit" label="Daire" required error={errors.unitId?.message}>
          {(props) => (
            <NativeSelect {...props} {...register('unitId')}>
              <option value="">Daire seçin</option>
              {sortedUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {blockName.get(unit.blockId)} · {unit.doorNo}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <ChargeFields
          form={form as unknown as UseFormReturn<DetailsShape>}
          types={types}
          amountLabel="Dairenin tutarı"
          onTypeChange={onTypeChange}
          idPrefix="single"
        />
        <FormError message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            Borç ekle
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
