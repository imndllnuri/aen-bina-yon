import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { ErrorBlock, FormError, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { saveBankAccounts, type BankAccount } from '@/features/transfers/api'
import { formatIban } from '@/features/transfers/lib/iban'
import { transferErrorMessage } from '@/features/transfers/lib/notices'
import { bankAccountsSchema, type BankAccountsValues } from '@/features/transfers/lib/schemas'
import { useBankAccounts, useRefreshTransfers } from '@/features/transfers/queries'
import type { AdminSite } from '../api'

function AccountsForm({ initial, companyId, onClose }: { initial: BankAccount[]; companyId: string; onClose: () => void }) {
  const refresh = useRefreshTransfers()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BankAccountsValues>({
    resolver: zodResolver(bankAccountsSchema),
    defaultValues: { accounts: initial.map((a) => ({ bank: a.bank, holder: a.holder, iban: formatIban(a.iban) })) },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'accounts' })

  const onSubmit = async (values: BankAccountsValues) => {
    setError(null)
    try {
      await saveBankAccounts(companyId, values.accounts)
      await refresh()
      toast.success('Banka hesapları kaydedildi.')
      onClose()
    } catch (caught) {
      setError(transferErrorMessage(caught))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {fields.length === 0 && <p className="text-sm text-muted-foreground">Henüz hesap yok. “Hesap ekle” ile ekleyin. Hesapları kaydetmezseniz sakinler IBAN göremez.</p>}
      {fields.map((field, index) => (
        <fieldset key={field.id} className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Hesap {index + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id={`acc-bank-${index}`} label="Banka" required error={errors.accounts?.[index]?.bank?.message}>
              {(props) => <Input {...props} {...register(`accounts.${index}.bank`)} />}
            </FormField>
            <FormField id={`acc-holder-${index}`} label="Hesap sahibi" required error={errors.accounts?.[index]?.holder?.message}>
              {(props) => <Input {...props} {...register(`accounts.${index}.holder`)} />}
            </FormField>
          </div>
          <FormField id={`acc-iban-${index}`} label="IBAN" required error={errors.accounts?.[index]?.iban?.message} hint="TR ile başlar, 26 karakter. Boşluklar sorun değil.">
            {(props) => <Input {...props} {...register(`accounts.${index}.iban`)} className="font-mono" autoComplete="off" />}
          </FormField>
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => remove(index)}>
            <Trash2 aria-hidden="true" /> Hesabı kaldır
          </Button>
        </fieldset>
      ))}
      {errors.accounts?.message && <p role="alert" className="text-sm text-destructive">{errors.accounts.message}</p>}
      {fields.length < 5 && (
        <Button type="button" variant="outline" size="sm" onClick={() => append({ bank: '', holder: '', iban: '' })}>
          <Plus aria-hidden="true" /> Hesap ekle
        </Button>
      )}
      <FormError message={error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
          Kaydet
        </Button>
      </DialogFooter>
    </form>
  )
}

/** The bank accounts that residents see on "Havale Bildir". The admin edits them here. */
export function BankAccountsCard({ site }: { site: AdminSite }) {
  const accounts = useBankAccounts()
  const [editing, setEditing] = useState(false)
  const mine = (accounts.data ?? []).filter((a) => a.companyId === site.companyId)

  return (
    <Card size="sm">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Banka hesapları (sakinlere gösterilir)</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={accounts.isPending || accounts.isError}>
          Hesapları düzenle
        </Button>
      </CardHeader>
      <CardContent>
        {accounts.isPending && <LoadingBlock />}
        {accounts.isError && <ErrorBlock text="Banka hesapları şu anda yüklenemedi." onRetry={() => void accounts.refetch()} />}
        {accounts.data && mine.length === 0 && (
          <p role="status" className="text-sm text-muted-foreground">
            Henüz banka hesabı eklenmemiş. Sakinler havale yapabilsin diye en az bir hesap ekleyin.
          </p>
        )}
        {mine.length > 0 && (
          <ul className="space-y-1 text-sm">
            {mine.map((account) => (
              <li key={account.iban}>
                <span className="font-medium">{account.bank}</span> · {account.holder} · <span className="font-mono">{formatIban(account.iban)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Banka hesapları</DialogTitle>
            <DialogDescription>En fazla 5 hesap. Sakinler bu IBAN’lara havale yapar ve dekontu portala yükler.</DialogDescription>
          </DialogHeader>
          {/* The form only exists while the dialog is open, so it starts from the saved list every time. */}
          {editing && <AccountsForm initial={mine} companyId={site.companyId} onClose={() => setEditing(false)} />}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
