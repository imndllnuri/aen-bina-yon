import { Ellipsis } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDateTime } from '@/lib/format'
import { deleteChargeBatch, voidChargeBatch, type AdminSite, type BatchRow, type BlockRow } from '../api'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ReasonDialog } from '../components/ReasonDialog'
import { ErrorBlock, LoadingBlock } from '../components/StateBlocks'
import { canDeleteBatch, chargeErrorMessage, describeTarget, monthLabel, SPLIT_LABELS } from '../lib/charges'
import { formatKurus } from '../lib/money'
import { useBatches, useRefreshCharges } from '../queries'

type ConfirmState = { kind: 'void' | 'delete'; batch: BatchRow }

/** Every bulk or single charge operation: undo a whole one, or delete a fresh mistake. */
export function BatchesTab({ site, blocks }: { site: AdminSite; blocks: BlockRow[] }) {
  const batches = useBatches(site.id)
  const refresh = useRefreshCharges(site.id)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const blockNames = useMemo(() => Object.fromEntries(blocks.map((b) => [b.id, b.name])), [blocks])

  if (batches.isPending) return <LoadingBlock />
  if (batches.isError) return <ErrorBlock text="Toplu işlemler şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void batches.refetch()} />
  if (batches.data.length === 0) {
    return (
      <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Henüz borç işlemi yok. “Toplu borçlandır” ile ilk işlemi başlatın.
      </p>
    )
  }

  const now = new Date()

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Bir işlemi geri almak için “Tümünü iptal et”i kullanın: borçlar silinmez, iptal nedeniyle kayıtta kalır. Yeni yapılmış bir hatayı 15 dakika içinde silebilirsiniz.
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Oluşturulma</TableHead>
              <TableHead>Tür</TableHead>
              <TableHead>Dönem</TableHead>
              <TableHead>Hedef</TableHead>
              <TableHead>Yöntem</TableHead>
              <TableHead className="text-right">Daire</TableHead>
              <TableHead className="text-right">Toplam</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">İşlemler</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.data.map((batch) => {
              const changed = batch.activeTotalKurus !== batch.totalKurus || batch.activeCount !== batch.unitCount
              return (
                <TableRow key={batch.id} className={batch.voidedAt ? 'text-muted-foreground' : undefined}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(batch.createdAt)}</TableCell>
                  <TableCell>
                    <div>{batch.typeName}</div>
                    {batch.description && <div className="text-xs text-muted-foreground">{batch.description}</div>}
                    {batch.planId && (
                      <Badge variant="outline" className="mt-1">
                        Plandan
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{batch.period ? monthLabel(batch.period) : '—'}</TableCell>
                  <TableCell>{describeTarget(batch.target, blockNames)}</TableCell>
                  <TableCell>
                    <div>{SPLIT_LABELS[batch.splitMethod]}</div>
                    <div className="text-xs text-muted-foreground">
                      {batch.splitMethod === 'per_unit' ? `${formatKurus(batch.amountKurus)} / daire` : `Toplam ${formatKurus(batch.amountKurus)}`}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{changed ? `${batch.activeCount} / ${batch.unitCount}` : batch.unitCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div>{formatKurus(batch.activeTotalKurus)}</div>
                    {changed && <div className="text-xs text-muted-foreground">ilk: {formatKurus(batch.totalKurus)}</div>}
                  </TableCell>
                  <TableCell>
                    {batch.voidedAt ? (
                      <>
                        <Badge variant="secondary">İptal</Badge>
                        {batch.voidReason && <div className="mt-1 text-xs">Neden: {batch.voidReason}</div>}
                      </>
                    ) : (
                      <Badge variant="outline">Aktif</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {(!batch.voidedAt || canDeleteBatch(batch.createdAt, now)) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`${batch.typeName} işlemi için işlemler`}>
                            <Ellipsis />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!batch.voidedAt && (
                            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: 'void', batch })}>
                              Tümünü iptal et
                            </DropdownMenuItem>
                          )}
                          {canDeleteBatch(batch.createdAt, now) && (
                            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: 'delete', batch })}>
                              Sil (ilk 15 dakika)
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {confirm?.kind === 'void' && (
        <ReasonDialog
          open
          onOpenChange={(open) => !open && setConfirm(null)}
          title="Tüm işlemi iptal et"
          description={`${confirm.batch.typeName}: ${confirm.batch.activeCount} aktif borç (${formatKurus(confirm.batch.activeTotalKurus)}) iptal edilecek. Kayıtlar silinmez. İptal geri alınamaz.`}
          confirmLabel="Tümünü iptal et"
          onSubmit={async (reason) => {
            await voidChargeBatch(confirm.batch.id, reason)
            await refresh()
            toast.success('İşlem iptal edildi.')
          }}
        />
      )}
      {confirm?.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirm(null)}
          title="İşlemi sil"
          description={`${confirm.batch.typeName} işlemi ve ${confirm.batch.unitCount} borcu tamamen silinecek. Yalnızca yeni yapılmış hatalar için. Geri alınamaz.`}
          confirmLabel="Sil"
          destructive
          describeError={chargeErrorMessage}
          onConfirm={async () => {
            await deleteChargeBatch(confirm.batch.id)
            await refresh()
            toast.success('İşlem silindi.')
          }}
        />
      )}
    </div>
  )
}
