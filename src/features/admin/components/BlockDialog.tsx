import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { createBlock, describeDbError, renameBlock, type BlockRow } from '../api'
import { blockSchema, type BlockFormValues } from '../lib/schemas'

interface BlockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  block?: BlockRow
  onSaved: () => Promise<void>
}

/** Add a block, or rename one (when `block` is given). */
export function BlockDialog(props: BlockDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        {/* The form only exists while the dialog is open, so it starts fresh every time. */}
        <BlockForm {...props} />
      </DialogContent>
    </Dialog>
  )
}

function BlockForm({ onOpenChange, siteId, block, onSaved }: BlockDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BlockFormValues>({ resolver: zodResolver(blockSchema), defaultValues: { name: block?.name ?? '' } })

  const onSubmit = async ({ name }: BlockFormValues) => {
    setError(null)
    try {
      if (block) await renameBlock(block.id, name)
      else await createBlock(siteId, name)
      await onSaved()
      toast.success(block ? 'Blok adı güncellendi.' : 'Blok eklendi.')
      onOpenChange(false)
    } catch (caught) {
      setError(describeDbError(caught))
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{block ? 'Blok adını değiştir' : 'Blok ekle'}</DialogTitle>
        <DialogDescription>Örnek: A Blok, B Blok. Tek binalı sitelerde tek bir blok yeterlidir.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField id="block-name" label="Blok adı" required error={errors.name?.message}>
          {(props) => <Input {...props} {...register('name')} className="h-10" autoFocus />}
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
