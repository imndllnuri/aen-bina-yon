import { Ellipsis } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { NativeSelect } from '@/components/NativeSelect'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/format'
import { CHARGE_LIST_LIMIT, voidCharge, type AdminSite, type BlockRow, type ChargeRow, type ChargeTypeRow } from '../api'
import { ChargeEditDialog } from '../components/ChargeEditDialog'
import { ReasonDialog } from '../components/ReasonDialog'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { currentMonthIstanbul, matchesChargeQuery, monthLabel, monthOptions, STATUS_LABELS, summarizeCharges, type ChargeStatus } from '../lib/charges'
import { formatKurus } from '@/lib/money'
import { useCharges, useRefreshCharges } from '../queries'

const STATUS_VARIANT: Record<ChargeStatus, 'outline' | 'destructive' | 'secondary'> = { open: 'outline', overdue: 'destructive', partial: 'outline', paid: 'secondary', voided: 'secondary' }

type StatusFilter = 'all' | 'active' | 'voided'

/** The lines (tahakkuk) of the site, with filters, totals, edit and cancel. */
export function ChargesTab({ site, blocks, types }: { site: AdminSite; blocks: BlockRow[]; types: ChargeTypeRow[] }) {
  const [period, setPeriod] = useState(currentMonthIstanbul())
  const [typeId, setTypeId] = useState('')
  const [blockId, setBlockId] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<ChargeRow | null>(null)
  const [voiding, setVoiding] = useState<ChargeRow | null>(null)

  const charges = useCharges(site.id, { period: period || null, typeId: typeId || null, blockId: blockId || null })
  const refresh = useRefreshCharges(site.id)
  const months = monthOptions()

  const filters = (
    <div className="flex flex-wrap items-end gap-3" role="search" aria-label="Borç filtreleri">
      <div className="space-y-1.5">
        <Label htmlFor="charge-period">Dönem</Label>
        <NativeSelect id="charge-period" value={period} onChange={(event) => setPeriod(event.target.value)} className="w-44">
          <option value="">Tüm dönemler</option>
          {months.map((month) => (
            <option key={month.value} value={month.value}>
              {month.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="charge-type">Borç türü</Label>
        <NativeSelect id="charge-type" value={typeId} onChange={(event) => setTypeId(event.target.value)} className="w-44">
          <option value="">Tümü</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="charge-block">Blok</Label>
        <NativeSelect id="charge-block" value={blockId} onChange={(event) => setBlockId(event.target.value)} className="w-40">
          <option value="">Tümü</option>
          {blocks.map((block) => (
            <option key={block.id} value={block.id}>
              {block.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="charge-status">Durum</Label>
        <NativeSelect id="charge-status" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="w-36">
          <option value="all">Tümü</option>
          <option value="active">Aktif</option>
          <option value="voided">İptal</option>
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="charge-query">Ara</Label>
        <Input id="charge-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Daire, açıklama…" className="h-10 w-48" />
      </div>
    </div>
  )

  if (charges.isPending) return <LoadingBlock />
  if (charges.isError) return <ErrorBlock text="Borçlar şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void charges.refetch()} />

  const rows = charges.data.rows.filter((row) => {
    if (status === 'active' && row.voidedAt) return false
    if (status === 'voided' && !row.voidedAt) return false
    return matchesChargeQuery(row, query)
  })
  const summary = summarizeCharges(rows)

  return (
    <div className="space-y-4">
      {filters}

      {charges.data.truncated && (
        <p role="status" className="rounded-lg border border-highlight/60 bg-highlight/10 p-3 text-sm">
          İlk {CHARGE_LIST_LIMIT} kayıt gösteriliyor. Toplamlar yalnızca bu kayıtları kapsar. Dönem, tür ya da blok seçerek daraltın.
        </p>
      )}

      {rows.length === 0 ? (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          {period ? `${monthLabel(period)} için` : 'Bu filtreye uyan'} borç yok. “Toplu borçlandır” ya da “Tek borç ekle” ile borç yazabilirsiniz.
        </p>
      ) : (
        <>
          <p className="text-sm" aria-live="polite">
            <span className="font-semibold">{summary.activeCount}</span> aktif kayıt · toplam <span className="font-semibold">{formatKurus(summary.activeKurus)}</span>
            {summary.voidedCount > 0 && <span className="text-muted-foreground"> · {summary.voidedCount} iptal</span>}
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Daire</TableHead>
                  <TableHead>Tür / açıklama</TableHead>
                  <TableHead>Dönem</TableHead>
                  <TableHead>Son ödeme</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">İşlemler</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const state = row.status
                  return (
                    <TableRow key={row.id} className={row.voidedAt ? 'text-muted-foreground' : undefined}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {row.blockName} · {row.doorNo}
                      </TableCell>
                      <TableCell>
                        <div>{row.typeName}</div>
                        {row.description && <div className="text-xs text-muted-foreground">{row.description}</div>}
                        {row.voidReason && <div className="text-xs">Neden: {row.voidReason}</div>}
                        {!row.tenantVisible && <div className="text-xs text-muted-foreground">Kiracıya yansıtılmaz</div>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{row.period ? monthLabel(row.period) : '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(row.dueDate)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${row.voidedAt ? 'line-through' : ''}`}>{formatKurus(row.amountKurus)}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[state]}>{STATUS_LABELS[state]}</Badge>
                      </TableCell>
                      <TableCell>
                        {!row.voidedAt && row.paidKurus > 0 && <span className="text-xs text-muted-foreground">Ödeme alınmış</span>}
                        {!row.voidedAt && row.paidKurus === 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`${row.blockName} ${row.doorNo} için işlemler`}>
                                <Ellipsis />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setEditing(row)}>Düzenle</DropdownMenuItem>
                              <DropdownMenuItem variant="destructive" onSelect={() => setVoiding(row)}>
                                İptal et
                              </DropdownMenuItem>
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
        </>
      )}

      {editing && <ChargeEditDialog open onOpenChange={(open) => !open && setEditing(null)} charge={editing} onSaved={refresh} />}
      {voiding && (
        <ReasonDialog
          open
          onOpenChange={(open) => !open && setVoiding(null)}
          title={`Borcu iptal et: ${voiding.blockName} · ${voiding.doorNo}`}
          description={`${voiding.typeName}, ${formatKurus(voiding.amountKurus)}. Kayıt silinmez; iptal nedeniyle birlikte listede kalır. İptal geri alınamaz.`}
          confirmLabel="Borcu iptal et"
          onSubmit={async (reason) => {
            await voidCharge(voiding.id, reason)
            await refresh()
            toast.success('Borç iptal edildi.')
          }}
        />
      )}
    </div>
  )
}
