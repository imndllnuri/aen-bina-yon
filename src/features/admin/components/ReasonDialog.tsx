import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { chargeErrorMessage } from '../lib/charges'
import { reasonSchema, type ReasonValues } from '../lib/charge-schemas'
import { FormError } from './StateBlocks'

interface ReasonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  onSubmit: (reason: string) => Promise<void>
}

/** Cancelling money needs a written reason (it stays in the ledger). */
export function ReasonDialog(props: ReasonDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        {/* The form only exists while the dialog is open, so it starts empty every time. */}
        <ReasonForm {...props} />
      </DialogContent>
    </Dialog>
  )
}

function ReasonForm({ onOpenChange, title, description, confirmLabel, onSubmit }: ReasonDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ReasonValues>({ resolver: zodResolver(reasonSchema), defaultValues: { reason: '' } })

  const submit = async (values: ReasonValues) => {
    setError(null)
    try {
      await onSubmit(values.reason)
      onOpenChange(false)
    } catch (caught) {
      setError(chargeErrorMessage(caught))
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <FormField id="reason" label="İptal nedeni" required error={errors.reason?.message}>
          {(props) => <Textarea {...props} {...register('reason')} rows={3} maxLength={300} />}
        </FormField>
        <FormError message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Vazgeç
          </Button>
          <Button type="submit" variant="destructive" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
