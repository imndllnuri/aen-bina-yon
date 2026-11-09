import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/format'
import {
  createChargeBatch,
  previewCharge,
  type AdminSite,
  type BlockRow,
  type ChargeTypeRow,
  type CreateBatchInput,
  type PreviewLine,
  type UnitRow,
} from '../api'
import { bulkChargeSchema, kurusOf, type BulkChargeValues } from '../lib/charge-schemas'
import {
  chargeErrorMessage,
  currentMonthIstanbul,
  dueDateFor,
  isTargetComplete,
  monthLabel,
  SPLIT_LABELS,
  SPLIT_METHODS,
  targetUnitCount,
  type ChargeTarget,
  type SplitMethod,
} from '../lib/charges'
import { formatKurus, sumKurus } from '@/lib/money'
import { createRequestIds } from '../lib/request-ids'
import { ChargeFields, type DetailsShape } from './ChargeFields'
import { FormError } from '@/components/StateBlocks'
import { TargetPicker } from './TargetPicker'

type Step = 'target' | 'details' | 'preview'

interface BulkChargeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  site: AdminSite
  blocks: BlockRow[]
  units: UnitRow[]
  types: ChargeTypeRow[]
  onCreated: () => Promise<void>
}

const STEPS: { id: Step; label: string }[] = [
  { id: 'target', label: 'Kime?' },
  { id: 'details', label: 'Ne kadar?' },
  { id: 'preview', label: 'Önizleme' },
]

const number = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 4 })

/**
 * The bulk wizard (plan, section 8): target -> type, amount and split -> preview per unit -> confirm.
 * The preview comes from the database function that also creates the charges, so what you see is
 * what is saved, to the kuruş.
 */
export function BulkChargeDialog(props: BulkChargeDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        {/* The wizard only exists while the dialog is open, so it starts fresh every time. */}
        <BulkChargeWizard {...props} />
      </DialogContent>
    </Dialog>
  )
}

function BulkChargeWizard({ onOpenChange, site, blocks, units, types, onCreated }: BulkChargeDialogProps) {
  const [step, setStep] = useState<Step>('target')
  const [target, setTarget] = useState<ChargeTarget>({ scope: 'site' })
  const [preview, setPreview] = useState<{ lines: PreviewLine[]; values: BulkChargeValues } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outdated, setOutdated] = useState(false)
  const [busy, setBusy] = useState(false)
  // The same request id for the same exact request: a double click or a retry cannot charge twice.
  const [keyFor] = useState(() => createRequestIds())
  const period = useMemo(() => currentMonthIstanbul(), [])
  const first = types[0]

  const form = useForm<BulkChargeValues>({
    resolver: zodResolver(bulkChargeSchema),
    defaultValues: {
      typeId: first?.id ?? '',
      split: first?.defaultSplit ?? 'per_unit',
      amount: '',
      period,
      dueDate: dueDateFor(period, 15),
      description: '',
      tenantVisible: first?.tenantVisibleDefault ?? true,
      kararNo: '',
      kararDate: '',
    },
  })
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = form

  const split = useWatch({ control, name: 'split' }) as SplitMethod
  const splitInfo = SPLIT_METHODS.find((m) => m.value === split) ?? SPLIT_METHODS[0]

  const onTypeChange = (typeId: string) => {
    const type = types.find((t) => t.id === typeId)
    if (!type) return
    setValue('split', type.defaultSplit)
    setValue('tenantVisible', type.tenantVisibleDefault)
  }

  const runPreview = async (values: BulkChargeValues) => {
    setBusy(true)
    setError(null)
    setOutdated(false)
    try {
      const lines = await previewCharge({ siteId: site.id, target, split: values.split as SplitMethod, amountKurus: kurusOf(values.amount) })
      setPreview({ lines, values })
      setStep('preview')
    } catch (caught) {
      setError(chargeErrorMessage(caught, { split: values.split as SplitMethod }))
      setStep('details')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!preview) return
    const { lines, values } = preview
    const total = sumKurus(lines.map((line) => line.amountKurus))
    const input: Omit<CreateBatchInput, 'requestId'> = {
      siteId: site.id,
      target,
      split: values.split as SplitMethod,
      amountKurus: kurusOf(values.amount),
      chargeTypeId: values.typeId,
      period: values.period,
      dueDate: values.dueDate,
      description: values.description || null,
      tenantVisible: values.tenantVisible,
      kararNo: values.kararNo || null,
      kararDate: values.kararDate || null,
      // The database refuses to save if the units or the total are no longer what this preview showed.
      expectedUnits: lines.length,
      expectedKurus: total,
    }
    setBusy(true)
    setError(null)
    try {
      await createChargeBatch({ ...input, requestId: keyFor(input) })
      await onCreated()
      toast.success(`${lines.length} daire için ${formatKurus(total)} borç oluşturuldu.`)
      onOpenChange(false)
    } catch (caught) {
      setOutdated((caught as { message?: string } | null)?.message === 'preview_outdated')
      setError(chargeErrorMessage(caught, { split: values.split as SplitMethod }))
    } finally {
      setBusy(false)
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Toplu borçlandır</DialogTitle>
        <DialogDescription>Önce hedefi ve tutarı seçin, sonra her dairenin tutarını önizleyin. Onaylamadan hiçbir şey kaydedilmez.</DialogDescription>
        <ol className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm" aria-label="Adımlar">
          {STEPS.map((s, index) => (
            <li key={s.id} aria-current={s.id === step ? 'step' : undefined} className={s.id === step ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
              {index + 1}. {s.label}
            </li>
          ))}
        </ol>
      </DialogHeader>

      {step === 'target' && (
        <div className="space-y-4">
          <TargetPicker blocks={blocks} units={units} value={target} onChange={setTarget} idPrefix="bulk" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button type="button" onClick={() => setStep('details')} disabled={!isTargetComplete(target) || targetUnitCount(target, units) === 0}>
              Devam
            </Button>
          </DialogFooter>
        </div>
      )}

      {step === 'details' && (
        <form onSubmit={handleSubmit(runPreview)} noValidate className="space-y-4">
          <ChargeFields
            form={form as unknown as UseFormReturn<DetailsShape>}
            types={types}
            amountLabel={splitInfo.amountLabel}
            onTypeChange={onTypeChange}
            idPrefix="bulk"
          >
            <FormField id="bulk-split" label="Paylaştırma yöntemi" required error={errors.split?.message} hint={splitInfo.hint}>
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
          </ChargeFields>
          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Kat malikleri kurulu kararı (isteğe bağlı)</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="bulk-karar-no" label="Karar numarası" error={errors.kararNo?.message}>
                {(props) => <Input {...props} {...register('kararNo')} maxLength={60} className="h-10" />}
              </FormField>
              <FormField id="bulk-karar-date" label="Karar tarihi" error={errors.kararDate?.message}>
                {(props) => <Input {...props} {...register('kararDate')} type="date" className="h-10" />}
              </FormField>
            </div>
          </fieldset>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStep('target')} disabled={busy}>
              Geri
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
              Önizle
            </Button>
          </DialogFooter>
        </form>
      )}

      {step === 'preview' && preview && (
        <PreviewStep
          preview={preview}
          types={types}
          error={error}
          outdated={outdated}
          busy={busy}
          onBack={() => {
            setError(null)
            setOutdated(false)
            setStep('details')
          }}
          onRefresh={() => void runPreview(preview.values)}
          onConfirm={() => void confirm()}
        />
      )}
      <span className="sr-only" aria-live="polite">
        Adım {stepIndex + 1} / {STEPS.length}
      </span>
    </>
  )
}

function PreviewStep({
  preview,
  types,
  error,
  outdated,
  busy,
  onBack,
  onRefresh,
  onConfirm,
}: {
  preview: { lines: PreviewLine[]; values: BulkChargeValues }
  types: ChargeTypeRow[]
  error: string | null
  outdated: boolean
  busy: boolean
  onBack: () => void
  onRefresh: () => void
  onConfirm: () => void
}) {
  const { lines, values } = preview
  const total = sumKurus(lines.map((line) => line.amountKurus))
  const weighted = lines.some((line) => line.weight !== null)
  const weightLabel = values.split === 'gross_m2' ? 'Brüt m²' : 'Arsa payı'
  const typeName = types.find((t) => t.id === values.typeId)?.name ?? '—'

  return (
    <div className="space-y-4">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Borç türü:</dt>
          <dd className="font-medium">{typeName}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Dönem:</dt>
          <dd className="font-medium">{monthLabel(values.period)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Yöntem:</dt>
          <dd className="font-medium">{SPLIT_LABELS[values.split as SplitMethod]}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Son ödeme:</dt>
          <dd className="font-medium">{formatDate(values.dueDate)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Kiracıya yansıt:</dt>
          <dd className="font-medium">{values.tenantVisible ? 'Evet' : 'Hayır'}</dd>
        </div>
      </dl>

      <div className="max-h-72 overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Daire</TableHead>
              {weighted && <TableHead className="text-right">{weightLabel}</TableHead>}
              <TableHead className="text-right">Tutar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.unitId}>
                <TableCell>
                  {line.blockName} · {line.doorNo}
                </TableCell>
                {weighted && <TableCell className="text-right tabular-nums">{line.weight === null ? '—' : number.format(line.weight)}</TableCell>}
                <TableCell className="text-right tabular-nums">{formatKurus(line.amountKurus)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={weighted ? 2 : 1} className="font-semibold">
                Toplam ({lines.length} daire)
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums" aria-live="polite">
                {formatKurus(total)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <FormError message={error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
          Geri
        </Button>
        {outdated ? (
          <Button type="button" onClick={onRefresh} disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            Önizlemeyi yenile
          </Button>
        ) : (
          <Button type="button" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            Borçlandır
          </Button>
        )}
      </DialogFooter>
    </div>
  )
}
