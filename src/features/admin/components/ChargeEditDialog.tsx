import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { updateCharge, type ChargeRow } from '../api'
import { chargeEditSchema, kurusOf, type ChargeEditValues } from '../lib/charge-schemas'
import { chargeErrorMessage } from '../lib/charges'
import { formatKurus } from '@/lib/money'
import { CheckboxField } from './CheckboxField'
import { FormError } from '@/components/StateBlocks'

interface ChargeEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  charge: ChargeRow
  onSaved: () => Promise<void>
}

const amountText = (kurus: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(kurus / 100)

/** Change the amount, due date, description or tenant visibility of an ACTIVE charge. */
export function ChargeEditDialog(props: ChargeEditDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <ChargeEditForm {...props} />
      </DialogContent>
    </Dialog>
  )
}

function ChargeEditForm({ onOpenChange, charge, onSaved }: ChargeEditDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChargeEditValues>({
    resolver: zodResolver(chargeEditSchema),
    defaultValues: {
      amount: amountText(charge.amountKurus),
      dueDate: charge.dueDate,
      description: charge.description ?? '',
      tenantVisible: charge.tenantVisible,
    },
  })

  const submit = async (values: ChargeEditValues) => {
    setError(null)
    try {
      await updateCharge(charge.id, {
        amountKurus: kurusOf(values.amount),
        dueDate: values.dueDate,
        description: values.description || null,
        tenantVisible: values.tenantVisible,
      })
      await onSaved()
      toast.success('Borç güncellendi.')
      onOpenChange(false)
    } catch (caught) {
      setError(chargeErrorMessage(caught))
    }
  }

  const typed = useWatch({ control, name: 'amount' })
  const preview = (() => {
    try {
      return `= ${formatKurus(kurusOf(typed))}`
    } catch {
      return undefined
    }
  })()

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Borcu düzenle: {charge.blockName} · {charge.doorNo}
        </DialogTitle>
        <DialogDescription>
          {charge.typeName}. Tutarı yanlış yazdıysanız burada düzeltebilirsiniz. Tamamen iptal etmek için “İptal et”i kullanın.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="edit-amount" label="Tutar" required error={errors.amount?.message} hint={preview}>
            {(props) => <Input {...props} {...register('amount')} inputMode="decimal" autoComplete="off" className="h-10" />}
          </FormField>
          <FormField id="edit-due" label="Son ödeme tarihi" required error={errors.dueDate?.message}>
            {(props) => <Input {...props} {...register('dueDate')} type="date" className="h-10" />}
          </FormField>
        </div>
        <FormField id="edit-desc" label="Açıklama" error={errors.description?.message}>
          {(props) => <Input {...props} {...register('description')} maxLength={200} className="h-10" />}
        </FormField>
        <CheckboxField control={control} name="tenantVisible" id="edit-tenant" label="Kiracıya yansıt" />
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
