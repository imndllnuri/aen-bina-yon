import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDate } from '@/lib/format'
import { generatePlan, previewCharge, type AdminSite, type PlanRow } from '../api'
import { chargeErrorMessage, currentMonthIstanbul, dueDateFor, monthLabel, SPLIT_LABELS, type ChargeTarget } from '../lib/charges'
import { formatKurus, sumKurus } from '@/lib/money'
import { FormError } from '@/components/StateBlocks'

interface PlanGenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  site: AdminSite
  plan: PlanRow
  onDone: () => Promise<void>
}

/** "Bu ayı oluştur": shows what would be charged (from the database) before anything is saved. */
export function PlanGenerateDialog(props: PlanGenerateDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <GenerateBody {...props} />
      </DialogContent>
    </Dialog>
  )
}

function GenerateBody({ onOpenChange, site, plan, onDone }: PlanGenerateDialogProps) {
  const month = currentMonthIstanbul()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const preview = useQuery({
    queryKey: ['admin', 'plan-preview', plan.id, plan.amountKurus, plan.splitMethod, JSON.stringify(plan.target)],
    queryFn: () => previewCharge({ siteId: site.id, target: plan.target as ChargeTarget, split: plan.splitMethod, amountKurus: plan.amountKurus }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })

  const total = preview.data ? sumKurus(preview.data.map((line) => line.amountKurus)) : 0

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await generatePlan(plan.id)
      await onDone()
      toast.success(`${monthLabel(month)}: ${preview.data?.length ?? 0} daire için ${formatKurus(total)} borç oluşturuldu.`)
      onOpenChange(false)
    } catch (caught) {
      setError(chargeErrorMessage(caught, { split: plan.splitMethod }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{monthLabel(month)} için borç oluştur</DialogTitle>
        <DialogDescription>
          “{plan.name}” planından bu ayın borçları yazılacak. Aynı plandan aynı ay için ikinci kez oluşturulamaz.
        </DialogDescription>
      </DialogHeader>

      {preview.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Hesaplanıyor…
        </p>
      )}
      {preview.isError && <FormError message={chargeErrorMessage(preview.error, { split: plan.splitMethod })} />}
      {preview.data && (
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Daire sayısı:</dt>
            <dd className="font-medium">{preview.data.length}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Toplam:</dt>
            <dd className="font-medium">{formatKurus(total)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Yöntem:</dt>
            <dd className="font-medium">{SPLIT_LABELS[plan.splitMethod]}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Son ödeme:</dt>
            <dd className="font-medium">{formatDate(dueDateFor(month, plan.dayOfMonth))}</dd>
          </div>
        </dl>
      )}

      <FormError message={error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
          Vazgeç
        </Button>
        <Button type="button" onClick={() => void confirm()} disabled={busy || !preview.data}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          Borçları oluştur
        </Button>
      </DialogFooter>
    </>
  )
}
