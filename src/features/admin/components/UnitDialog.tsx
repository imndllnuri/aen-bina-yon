import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { createUnit, describeDbError, updateUnit, type BlockRow, type UnitRow } from '../api'
import { emptyUnitForm, toUnitRow, UNIT_STATUSES, UNIT_TYPES, unitSchema, type UnitFormValues } from '../lib/schemas'

const numberText = (value: number | null) => (value === null ? '' : String(value).replace('.', ','))

interface UnitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  blocks: BlockRow[]
  defaultBlockId?: string
  unit?: UnitRow
  onSaved: () => Promise<void>
}

/** Add a unit, or edit one (when `unit` is given). */
export function UnitDialog(props: UnitDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {/* The form only exists while the dialog is open, so it starts fresh every time. */}
        <UnitForm {...props} />
      </DialogContent>
    </Dialog>
  )
}

function UnitForm({ onOpenChange, blocks, defaultBlockId, unit, onSaved }: UnitDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UnitFormValues>({
    resolver: zodResolver(unitSchema),
    defaultValues: unit
      ? {
          blockId: unit.blockId,
          doorNo: unit.doorNo,
          floor: unit.floor === null ? '' : String(unit.floor),
          type: unit.type,
          grossM2: numberText(unit.grossM2),
          landShare: numberText(unit.landShare),
          status: unit.status,
        }
      : { ...emptyUnitForm, blockId: defaultBlockId ?? blocks[0]?.id ?? '' },
  })

  const onSubmit = async (values: UnitFormValues) => {
    setError(null)
    try {
      const row = toUnitRow(values)
      if (unit) await updateUnit(unit.id, row)
      else await createUnit(row)
      await onSaved()
      toast.success(unit ? 'Daire güncellendi.' : 'Daire eklendi.')
      onOpenChange(false)
    } catch (caught) {
      setError(describeDbError(caught))
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{unit ? 'Daireyi düzenle' : 'Daire ekle'}</DialogTitle>
        <DialogDescription>
          Brüt m² ve arsa payı isteğe bağlıdır. Giderleri m² ya da arsa payına göre bölmek için sonradan gerekecektir.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="unit-block" label="Blok" required error={errors.blockId?.message}>
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
          <FormField id="unit-door" label="Kapı no" required error={errors.doorNo?.message}>
            {(props) => <Input {...props} {...register('doorNo')} className="h-10" />}
          </FormField>
          <FormField id="unit-floor" label="Kat" error={errors.floor?.message} hint="Zemin kat için 0, bodrum için -1.">
            {(props) => <Input {...props} {...register('floor')} inputMode="numeric" className="h-10" />}
          </FormField>
          <FormField id="unit-type" label="Tip" required error={errors.type?.message}>
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
          <FormField id="unit-m2" label="Brüt m²" error={errors.grossM2?.message}>
            {(props) => <Input {...props} {...register('grossM2')} inputMode="decimal" className="h-10" />}
          </FormField>
          <FormField id="unit-share" label="Arsa payı" error={errors.landShare?.message}>
            {(props) => <Input {...props} {...register('landShare')} inputMode="decimal" className="h-10" />}
          </FormField>
          <FormField id="unit-status" label="Durum" required error={errors.status?.message}>
            {(props) => (
              <NativeSelect {...props} {...register('status')}>
                {UNIT_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
