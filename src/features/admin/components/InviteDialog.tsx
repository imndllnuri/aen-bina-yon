import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { todayIstanbul } from '@/lib/format'
import { inviteErrorMessage, inviteResident, type BlockRow, type InviteResult, type UnitRow } from '../api'
import { inviteSchema, RELATIONS, type InviteFormValues } from '../lib/schemas'

export interface InviteDone {
  result: Extract<InviteResult, { ok: true }>
  name: string
  phone: string | null
}

interface InviteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  blocks: BlockRow[]
  units: UnitRow[]
  onDone: (done: InviteDone) => Promise<void>
}

/** Add a resident to a unit and create their invite. The server function does the real work. */
export function InviteDialog(props: InviteDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {/* The form only exists while the dialog is open, so it starts fresh every time. */}
        <InviteForm {...props} />
      </DialogContent>
    </Dialog>
  )
}

function InviteForm({ onOpenChange, blocks, units, onDone }: InviteDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { fullName: '', email: '', phone: '', unitId: '', relation: 'owner', startDate: todayIstanbul() },
  })

  const onSubmit = async (values: InviteFormValues) => {
    setError(null)
    const result = await inviteResident({
      email: values.email,
      fullName: values.fullName,
      phone: values.phone,
      unitId: values.unitId,
      relation: values.relation as 'owner' | 'tenant',
      startDate: values.startDate,
    })
    if (!result.ok) {
      setError(inviteErrorMessage(result.error))
      return
    }
    await onDone({ result, name: values.fullName, phone: values.phone === '' ? null : values.phone })
    onOpenChange(false)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Sakin ekle ve davet et</DialogTitle>
        <DialogDescription>
          Kişi daireye bağlanır ve ona özel tek kullanımlık bir giriş bağlantısı oluşturulur. Bağlantıyı siz WhatsApp ya da başka bir yolla
          gönderirsiniz.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField id="invite-name" label="Ad soyad" required error={errors.fullName?.message}>
          {(props) => <Input {...props} {...register('fullName')} autoComplete="off" className="h-10" />}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="invite-email" label="E-posta" required error={errors.email?.message}>
            {(props) => <Input {...props} {...register('email')} type="email" autoComplete="off" className="h-10" />}
          </FormField>
          <FormField id="invite-phone" label="Telefon" error={errors.phone?.message} hint="WhatsApp mesajı için.">
            {(props) => <Input {...props} {...register('phone')} type="tel" autoComplete="off" placeholder="0532 000 00 00" className="h-10" />}
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="invite-unit" label="Daire" required error={errors.unitId?.message}>
            {(props) => (
              <NativeSelect {...props} {...register('unitId')}>
                <option value="">Seçin…</option>
                {blocks.map((block) => (
                  <optgroup key={block.id} label={block.name}>
                    {units
                      .filter((unit) => unit.blockId === block.id)
                      .map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {block.name} · {unit.doorNo}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField id="invite-relation" label="İlişki" required error={errors.relation?.message}>
            {(props) => (
              <NativeSelect {...props} {...register('relation')}>
                {RELATIONS.map((relation) => (
                  <option key={relation.value} value={relation.value}>
                    {relation.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </div>
        <FormField id="invite-start" label="Taşınma tarihi" error={errors.startDate?.message}>
          {(props) => <Input {...props} {...register('startDate')} type="date" className="h-10 sm:w-56" />}
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
            Ekle ve davet et
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
