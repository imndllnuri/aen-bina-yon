import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { FormField } from '@/components/FormField'
import { FormError } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { adminInviteMessage } from '@/features/admins/lib/messages'
import { adminInviteSchema, type AdminInviteValues } from '@/features/admins/lib/schemas'
import { inviteAdmin, type InviteResult } from '../api'

export interface InviteAdminDone {
  result: Extract<InviteResult, { ok: true }>
  name: string
  phone: string | null
}

/** Invite a person to be an admin of the site. The server function does the real work (and the database decides who may). */
export function InviteAdminDialog({ open, onOpenChange, siteId, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; siteId: string; onDone: (done: InviteAdminDone) => Promise<void> }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {/* The form only exists while the dialog is open, so it starts fresh every time. */}
        <Form siteId={siteId} onOpenChange={onOpenChange} onDone={onDone} />
      </DialogContent>
    </Dialog>
  )
}

function Form({ siteId, onOpenChange, onDone }: { siteId: string; onOpenChange: (open: boolean) => void; onDone: (done: InviteAdminDone) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdminInviteValues>({ resolver: zodResolver(adminInviteSchema), defaultValues: { fullName: '', email: '', phone: '' } })

  const onSubmit = async (values: AdminInviteValues) => {
    setError(null)
    const result = await inviteAdmin({ siteId, email: values.email, fullName: values.fullName, phone: values.phone })
    if (!result.ok) {
      setError(adminInviteMessage(result.error))
      return
    }
    await onDone({ result, name: values.fullName, phone: values.phone === '' ? null : values.phone })
    onOpenChange(false)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Yönetici davet et</DialogTitle>
        <DialogDescription>
          Kişi bu sitenin <strong>yöneticisi</strong> olur: borçları, ödemeleri, ayarları ve diğer yöneticileri yönetebilir. Ona özel tek kullanımlık
          bir giriş bağlantısı oluşturulur; bağlantıyı siz WhatsApp ya da başka bir yolla gönderirsiniz. Yalnızca güvendiğiniz kişileri ekleyin.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField id="admin-name" label="Ad soyad" required error={errors.fullName?.message}>
          {(props) => <Input {...props} {...register('fullName')} autoComplete="off" className="h-10" />}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="admin-email" label="E-posta" required error={errors.email?.message}>
            {(props) => <Input {...props} {...register('email')} type="email" autoComplete="off" className="h-10" />}
          </FormField>
          <FormField id="admin-phone" label="Telefon" error={errors.phone?.message} hint="WhatsApp mesajı için.">
            {(props) => <Input {...props} {...register('phone')} type="tel" autoComplete="off" placeholder="0532 000 00 00" className="h-10" />}
          </FormField>
        </div>
        <FormError message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            Yönetici yap ve davet et
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
