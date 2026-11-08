import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { describeDbError, updateProfileContact, type ResidentRow } from '../api'
import { residentContactSchema, type ResidentContactValues } from '../lib/schemas'

interface ResidentEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  resident: ResidentRow | null
  onSaved: () => Promise<void>
}

/** Edit a person's name and phone. (The e-mail is the login name and cannot be changed here.) */
export function ResidentEditDialog(props: ResidentEditDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        {props.resident && <EditForm {...props} resident={props.resident} />}
      </DialogContent>
    </Dialog>
  )
}

function EditForm({ onOpenChange, resident, onSaved }: ResidentEditDialogProps & { resident: ResidentRow }) {
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResidentContactValues>({
    resolver: zodResolver(residentContactSchema),
    defaultValues: { fullName: resident.fullName ?? '', phone: resident.phone ?? '' },
  })

  const onSubmit = async (values: ResidentContactValues) => {
    setError(null)
    try {
      await updateProfileContact(resident.profileId, { full_name: values.fullName, phone: values.phone === '' ? null : values.phone })
      await onSaved()
      toast.success('Bilgiler güncellendi.')
      onOpenChange(false)
    } catch (caught) {
      setError(describeDbError(caught))
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Sakin bilgilerini düzenle</DialogTitle>
        <DialogDescription>{resident.email}</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField id="edit-name" label="Ad soyad" required error={errors.fullName?.message}>
          {(props) => <Input {...props} {...register('fullName')} className="h-10" />}
        </FormField>
        <FormField id="edit-phone" label="Telefon" error={errors.phone?.message}>
          {(props) => <Input {...props} {...register('phone')} type="tel" className="h-10" />}
        </FormField>
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
