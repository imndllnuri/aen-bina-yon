import { Ellipsis, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/format'
import { setPlanActive, type AdminSite, type BlockRow, type ChargeTypeRow, type PlanRow, type UnitRow } from '../api'
import { PlanDialog } from '../components/PlanDialog'
import { PlanGenerateDialog } from '../components/PlanGenerateDialog'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { chargeErrorMessage, currentMonthIstanbul, describeTarget, dueDateFor, monthLabel, SPLIT_LABELS } from '../lib/charges'
import { formatKurus } from '@/lib/money'
import { usePlans, useRefreshCharges } from '../queries'

/** Monthly plans. "Bu ayı oluştur" turns a plan into this month's charges (twice for one month is refused). */
export function PlansTab({
  site,
  blocks,
  units,
  types,
}: {
  site: AdminSite
  blocks: BlockRow[]
  units: UnitRow[]
  types: ChargeTypeRow[]
}) {
  const plans = usePlans(site.id)
  const refresh = useRefreshCharges(site.id)
  const [editing, setEditing] = useState<{ plan?: PlanRow } | null>(null)
  const [generating, setGenerating] = useState<PlanRow | null>(null)
  const blockNames = useMemo(() => Object.fromEntries(blocks.map((b) => [b.id, b.name])), [blocks])
  const month = currentMonthIstanbul()

  const toggle = async (plan: PlanRow) => {
    try {
      await setPlanActive(plan.id, !plan.active)
      await refresh()
      toast.success(plan.active ? 'Plan kapatıldı.' : 'Plan etkinleştirildi.')
    } catch (caught) {
      toast.error(chargeErrorMessage(caught))
    }
  }

  if (plans.isPending) return <LoadingBlock />
  if (plans.isError) return <ErrorBlock text="Planlar şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void plans.refetch()} />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Her ay aynı borcu yazıyorsanız (örneğin aidat) bir plan kurun. Ay başında planın yanındaki “Bu ayı oluştur” düğmesine basın. Otomatik çalışmaz.
        </p>
        <Button onClick={() => setEditing({})}>
          <Plus /> Plan ekle
        </Button>
      </div>

      {plans.data.length === 0 ? (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Henüz plan yok. “Plan ekle” ile aylık aidat planınızı kurun.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Tutar</TableHead>
                <TableHead>Hedef</TableHead>
                <TableHead>Son ödeme günü</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">İşlemler</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.data.map((plan) => (
                <TableRow key={plan.id} className={plan.active ? undefined : 'text-muted-foreground'}>
                  <TableCell>
                    <div className="font-medium">{plan.name}</div>
                    <div className="text-xs text-muted-foreground">{plan.typeName}</div>
                    {plan.kararNo && plan.kararDate && (
                      <div className="text-xs text-muted-foreground">
                        Karar {plan.kararNo} · {formatDate(plan.kararDate)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="tabular-nums">{formatKurus(plan.amountKurus)}</div>
                    <div className="text-xs text-muted-foreground">{plan.splitMethod === 'per_unit' ? 'her daire' : `toplam, ${SPLIT_LABELS[plan.splitMethod].toLocaleLowerCase('tr')}`}</div>
                  </TableCell>
                  <TableCell>{describeTarget(plan.target, blockNames)}</TableCell>
                  <TableCell>Her ayın {plan.dayOfMonth}. günü</TableCell>
                  <TableCell>
                    <Badge variant={plan.active ? 'outline' : 'secondary'}>{plan.active ? 'Aktif' : 'Kapalı'}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" disabled={!plan.active} onClick={() => setGenerating(plan)} aria-label={`${plan.name}: ${monthLabel(month)} için borç oluştur`}>
                        Bu ayı oluştur
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`${plan.name} için işlemler`}>
                            <Ellipsis />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing({ plan })}>Düzenle</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void toggle(plan)}>{plan.active ? 'Planı kapat' : 'Planı etkinleştir'}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Bu ayın son ödeme tarihi plana göre: örneğin 5. gün için {formatDate(dueDateFor(month, 5))}.</p>

      {editing && (
        <PlanDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          site={site}
          blocks={blocks}
          units={units}
          types={types}
          plan={editing.plan}
          onSaved={refresh}
        />
      )}
      {generating && <PlanGenerateDialog open onOpenChange={(open) => !open && setGenerating(null)} site={site} plan={generating} onDone={refresh} />}
    </div>
  )
}
