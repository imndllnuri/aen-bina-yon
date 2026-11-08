import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { createUnitsBulk, describeDbError, type BlockRow, type UnitRow } from '../api'
import { findDoorConflicts, generateUnits, nextDoorNumber, validateBulk } from '../lib/bulk-units'
import { bulkSchema, parseDecimal, UNIT_TYPES, type BulkFormValues } from '../lib/schemas'

/** Reads the form text as numbers for the generator. Empty or odd text becomes NaN (= "not valid yet"). */
const asNumber = (text: string | undefined) => (text !== undefined && /^-?\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN)

/**
 * The bulk generator: "A Blok, 10 kat, katta 4 daire". Shows a preview first, and refuses when a
 * door number already exists in the block. The units are created in ONE request: all or none.
 */
interface BulkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  blocks: BlockRow[]
  units: UnitRow[]
  defaultBlockId?: string
  onSaved: () => Promise<void>
}

export function BulkUnitsDialog(props: BulkDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {/* The form only exists while the dialog is open, so it starts fresh every time. */}
        <BulkForm {...props} />
      </DialogContent>
    </Dialog>
  )
}

function BulkForm({ onOpenChange, blocks, units, defaultBlockId, onSaved }: BulkDialogProps) {
  const [error, setError] = useState<string | null>(null)
  // Start the door numbers after the highest one already used in the chosen block.
  const startBlockId = defaultBlockId ?? blocks[0]?.id ?? ''
  const startNumber = nextDoorNumber(units.filter((u) => u.blockId === startBlockId).map((u) => u.doorNo))
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BulkFormValues>({
    resolver: zodResolver(bulkSchema),
    defaultValues: { blockId: startBlockId, floors: '10', perFloor: '4', startNumber: String(startNumber), startFloor: '1', type: 'konut', grossM2: '', landShare: '' },
  })

  const values = useWatch({ control })

  const options = useMemo(
    () => ({
      floors: asNumber(values.floors),
      perFloor: asNumber(values.perFloor),
      startNumber: asNumber(values.startNumber),
      startFloor: asNumber(values.startFloor),
    }),
    [values.floors, values.perFloor, values.startNumber, values.startFloor],
  )

  const problem = validateBulk(options)
  const generated = useMemo(() => generateUnits(options), [options])
  const existing = useMemo(() => units.filter((u) => u.blockId === values.blockId).map((u) => u.doorNo), [units, values.blockId])
  const conflicts = useMemo(() => findDoorConflicts(generated, existing), [generated, existing])
  const blockName = blocks.find((b) => b.id === values.blockId)?.name

  const onSubmit = async (form: BulkFormValues) => {
    setError(null)
    if (generated.length === 0 || conflicts.length > 0) return
    try {
      await createUnitsBulk(form.blockId, generated, {
        type: form.type,
        gross_m2: parseDecimal(form.grossM2),
        land_share: parseDecimal(form.landShare),
      })
      await onSaved()
      toast.success(`${generated.length} daire oluşturuldu.`)
      onOpenChange(false)
    } catch (caught) {
      setError(describeDbError(caught))
    }
  }

  const last = generated[generated.length - 1]

  return (
    <>
      <DialogHeader>
        <DialogTitle>Toplu daire oluştur</DialogTitle>
        <DialogDescription>
          Örnek: A Blok, 10 kat, katta 4 daire. Kapı numaraları sırayla artar. Oluşturmadan önce özeti görürsünüz.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField id="bulk-block" label="Blok" required error={errors.blockId?.message}>
          {(props) => (
            <NativeSelect {...props} {...register('blockId')}>
              {blocks.map((block) => (
                <option key={block.id} value={block.id}>
                  {block.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="bulk-floors" label="Kat sayısı" required error={errors.floors?.message}>
            {(props) => <Input {...props} {...register('floors')} inputMode="numeric" className="h-10" />}
          </FormField>
          <FormField id="bulk-per-floor" label="Katta daire sayısı" required error={errors.perFloor?.message}>
            {(props) => <Input {...props} {...register('perFloor')} inputMode="numeric" className="h-10" />}
          </FormField>
          <FormField id="bulk-start-no" label="İlk kapı numarası" required error={errors.startNumber?.message}>
            {(props) => <Input {...props} {...register('startNumber')} inputMode="numeric" className="h-10" />}
          </FormField>
          <FormField id="bulk-start-floor" label="İlk kat" required error={errors.startFloor?.message} hint="Zemin kat için 0.">
            {(props) => <Input {...props} {...register('startFloor')} inputMode="numeric" className="h-10" />}
          </FormField>
          <FormField id="bulk-type" label="Tip" required error={errors.type?.message}>
            {(props) => (
              <NativeSelect {...props} {...register('type')}>
                {UNIT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="bulk-m2" label="Brüt m²" error={errors.grossM2?.message}>
              {(props) => <Input {...props} {...register('grossM2')} inputMode="decimal" className="h-10" />}
            </FormField>
            <FormField id="bulk-share" label="Arsa payı" error={errors.landShare?.message}>
              {(props) => <Input {...props} {...register('landShare')} inputMode="decimal" className="h-10" />}
            </FormField>
          </div>
        </div>

        {/* Preview: what will be created, before anything is saved. */}
        <div aria-live="polite" className="rounded-lg bg-muted p-3 text-sm">
          {problem ? (
            <p>{problem}</p>
          ) : (
            <p data-testid="bulk-preview">
              <strong>{generated.length} daire</strong> oluşturulacak
              {blockName ? ` (${blockName})` : ''}: kapı no <strong>{generated[0].door_no}</strong> – <strong>{last.door_no}</strong>, katlar{' '}
              <strong>{generated[0].floor}</strong> – <strong>{last.floor}</strong>.
            </p>
          )}
        </div>

        {conflicts.length > 0 && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            Bu kapı numaraları blokta zaten var: {conflicts.slice(0, 12).join(', ')}
            {conflicts.length > 12 ? ` ve ${conflicts.length - 12} tane daha` : ''}. İlk kapı numarasını değiştirin.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={isSubmitting || generated.length === 0 || conflicts.length > 0}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            {generated.length > 0 ? `${generated.length} daireyi oluştur` : 'Daireleri oluştur'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
