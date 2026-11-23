import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { ErrorBlock, FormError, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { kurusOf } from '@/features/admin/lib/charge-schemas'
import { submitTransferNotice, uploadDekont } from '@/features/transfers/api'
import { BankAccountCards } from '@/features/transfers/components/BankAccountCards'
import { TransferNoticeList } from '@/features/transfers/components/TransferNoticeList'
import { checkDekont, dekontPath, fileSizeLabel, type DekontType } from '@/features/transfers/lib/dekont'
import { shiftDate } from '@/features/transfers/lib/lines'
import { transferErrorMessage } from '@/features/transfers/lib/notices'
import { noticeSchema, type NoticeValues } from '@/features/transfers/lib/schemas'
import { useMyNotices, useRefreshTransfers } from '@/features/transfers/queries'
import { todayIstanbul } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import { createRequestIds } from '@/lib/request-ids'
import type { MyUnit } from './api'
import { ResidentGate } from './components/ResidentGate'
import { unitLabel } from './lib/unit-label'
import { useBalance, useMyName } from './queries'

interface PickedFile {
  file: File
  type: DekontType
  mime: string
  /** A random name for the file in the bucket, made when the file is picked (a retry reuses it). */
  id: string
}

function NoticeForm({ unit }: { unit: MyUnit }) {
  const today = todayIstanbul()
  const schema = useMemo(() => noticeSchema(today), [today])
  const name = useMyName()
  const refresh = useRefreshTransfers()
  const [keyFor] = useState(() => createRequestIds())
  // Changing the key makes React build a fresh file input, which is how a chosen file is cleared.
  const [fileKey, setFileKey] = useState(0)
  const [picked, setPicked] = useState<PickedFile | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<NoticeValues>({ resolver: zodResolver(schema), defaultValues: { amount: '', sentOn: today, senderName: '', note: '' } })

  // The name on the bank slip is usually the person's own name: fill it in when it arrives (never over what they typed).
  useEffect(() => {
    if (name.data && getValues('senderName') === '') setValue('senderName', name.data)
  }, [name.data, getValues, setValue])

  const onFile = async (file: File | undefined) => {
    setError(null)
    if (!file) {
      setPicked(null)
      return
    }
    const check = await checkDekont(file)
    if (!check.ok) {
      setPicked(null)
      setFileError(check.message)
      setFileKey((key) => key + 1)
      return
    }
    setFileError(null)
    setPicked({ file, type: check.type, mime: check.mime, id: crypto.randomUUID() })
  }

  const onSubmit = async (values: NoticeValues) => {
    setError(null)
    if (!picked) {
      setFileError('Dekont dosyasını seçin.')
      return
    }
    const amountKurus = kurusOf(values.amount)
    const filePath = dekontPath(unit.unitId, picked.id, picked.type)
    try {
      // 1) the file goes into the private bucket (only into this unit's folder) 2) the database makes the notice
      await uploadDekont(filePath, picked.file, picked.mime)
      const input = { unitId: unit.unitId, amountKurus, sentOn: values.sentOn, senderName: values.senderName, note: values.note || null, filePath }
      await submitTransferNotice({ ...input, requestId: keyFor(input) })
      await refresh()
      toast.success('Bildiriminiz alındı. Yönetim kontrol edince borcunuz kapanacak.')
      reset({ amount: '', sentOn: today, senderName: values.senderName, note: '' })
      setPicked(null)
      setFileKey((key) => key + 1)
    } catch (caught) {
      setError(transferErrorMessage(caught))
    }
  }

  // When the typed fields are wrong, the missing file is shown too: the person sees everything to fix at once.
  const onInvalid = () => {
    if (!picked) setFileError('Dekont dosyasını seçin.')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate className="space-y-4 rounded-lg border bg-card p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="notice-amount" label="Gönderilen tutar" required error={errors.amount?.message} hint="Örnek: 1.500,50">
          {(props) => <Input {...props} {...register('amount')} inputMode="decimal" autoComplete="off" />}
        </FormField>
        <FormField id="notice-date" label="Gönderim tarihi" required error={errors.sentOn?.message}>
          {(props) => <Input {...props} {...register('sentOn')} type="date" max={today} min={shiftDate(today, -90)} />}
        </FormField>
      </div>
      <FormField id="notice-sender" label="Havaleyi yapanın adı" required error={errors.senderName?.message} hint="Banka dekontunda yazan ad.">
        {(props) => <Input {...props} {...register('senderName')} autoComplete="name" />}
      </FormField>
      <FormField id="notice-note" label="Açıklama (isteğe bağlı)" error={errors.note?.message}>
        {(props) => <Textarea {...props} {...register('note')} rows={2} maxLength={300} />}
      </FormField>
      <FormField id="notice-file" label="Dekont (PDF, JPG veya PNG, en fazla 5 MB)" required error={fileError ?? undefined}>
        {(props) => (
          <>
            <Input
              {...props}
              key={fileKey}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
            {picked && (
              <p className="text-sm text-muted-foreground">
                Seçilen dosya: {picked.file.name} ({fileSizeLabel(picked.file.size)})
              </p>
            )}
          </>
        )}
      </FormField>
      <FormError message={error} />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
        Bildirimi gönder
      </Button>
    </form>
  )
}

function TransferContent({ unit }: { unit: MyUnit }) {
  const balance = useBalance(unit.unitId)
  const notices = useMyNotices()
  const mine = (notices.data ?? []).filter((notice) => notice.unitId === unit.unitId)
  const owed = balance.data?.balanceKurus ?? 0

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="transfer-accounts">
        <h2 id="transfer-accounts" className="text-lg font-semibold">
          1. Parayı bu hesaba gönderin
        </h2>
        <BankAccountCards />
        <p className="text-sm text-muted-foreground">Havale açıklamasına daire bilginizi yazın: <span className="font-medium text-foreground">{unitLabel(unit)}</span></p>
      </section>

      <section className="space-y-3" aria-labelledby="transfer-form">
        <h2 id="transfer-form" className="text-lg font-semibold">
          2. Dekontu yükleyin
        </h2>
        {owed > 0 && (
          <p className="text-sm text-muted-foreground">
            Güncel borcunuz <span className="font-semibold text-foreground">{formatKurus(owed)}</span>. Bildirdiğiniz tutar bundan büyük olursa yönetim onaylayamaz (fazla ödeme henüz kayda alınamıyor).
          </p>
        )}
        <NoticeForm unit={unit} />
      </section>

      <section className="space-y-3" aria-labelledby="transfer-list">
        <h2 id="transfer-list" className="text-lg font-semibold">
          Bildirimlerim
        </h2>
        {notices.isPending && <LoadingBlock />}
        {notices.isError && <ErrorBlock text="Bildirimleriniz şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void notices.refetch()} />}
        {notices.data && <TransferNoticeList notices={mine} emptyText="Henüz bir havale bildirimi göndermediniz." />}
      </section>
    </div>
  )
}

/** Havale Bildir: the IBAN cards, the notice form with the dekont, and the person's notices with their status. */
export function TransferNoticePage() {
  return (
    <ResidentGate title="Havale Bildir" description="Bankadan para mı gönderdiniz? Dekontu yükleyin; yönetim kontrol edince borcunuz kapanır.">
      {/* key: a different unit starts with an empty form */}
      {(unit) => <TransferContent key={unit.unitId} unit={unit} />}
    </ResidentGate>
  )
}
