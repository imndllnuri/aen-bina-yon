import { Archive, Building2, Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { todayIstanbul } from '@/lib/format'
import { archiveUnit, deleteBlock, type AdminSite, type BlockRow, type UnitRow } from './api'
import { BlockDialog } from './components/BlockDialog'
import { BulkUnitsDialog } from './components/BulkUnitsDialog'
import { ConfirmDialog } from './components/ConfirmDialog'
import { SiteGate } from './components/SiteGate'
import { UnitDialog } from './components/UnitDialog'
import { isCurrentResidency } from './lib/residents'
import { UNIT_TYPES } from './lib/schemas'
import { useBlocks, useRefreshSite, useUnits } from './queries'

const number = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 4 })
const typeLabel = (value: string) => UNIT_TYPES.find((type) => type.value === value)?.label ?? value

/** Residents who live in the unit today (the residency started and has not ended). */
function currentResidents(unit: UnitRow, today: string) {
  return unit.residencies.filter((r) => isCurrentResidency(r, today))
}

type ConfirmState =
  | { kind: 'archive'; unit: UnitRow }
  | { kind: 'deleteBlock'; block: BlockRow }

function UnitsContent({ site }: { site: AdminSite }) {
  const blocks = useBlocks(site.id)
  const units = useUnits(site.id)
  const refresh = useRefreshSite(site.id)
  const today = todayIstanbul()

  const [blockDialog, setBlockDialog] = useState<{ block?: BlockRow } | null>(null)
  const [unitDialog, setUnitDialog] = useState<{ unit?: UnitRow; blockId?: string } | null>(null)
  const [bulkDialog, setBulkDialog] = useState<{ blockId?: string } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  if (blocks.isPending || units.isPending) {
    return (
      <div className="space-y-3" role="status" aria-label="Yükleniyor">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }

  if (blocks.isError || units.isError) {
    return (
      <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        <p>Daireler şu anda yüklenemedi. Lütfen tekrar deneyin.</p>
        <Button
          variant="outline"
          onClick={() => {
            void blocks.refetch()
            void units.refetch()
          }}
        >
          Tekrar dene
        </Button>
      </div>
    )
  }

  const allUnits = units.data
  const hasBlocks = blocks.data.length > 0

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setBlockDialog({})} variant="outline">
          <Plus /> Blok ekle
        </Button>
        <Button onClick={() => setBulkDialog({})} variant="outline" disabled={!hasBlocks}>
          <Layers /> Toplu daire oluştur
        </Button>
        <Button onClick={() => setUnitDialog({})} disabled={!hasBlocks}>
          <Plus /> Daire ekle
        </Button>
      </div>

      {!hasBlocks && (
        <div role="status" className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
          <Building2 className="size-8 text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Henüz blok yok. Başlamak için bir blok ekleyin, sonra daireleri tek tek ya da toplu olarak oluşturun.</p>
          <Button onClick={() => setBlockDialog({})}>
            <Plus /> İlk bloğu ekle
          </Button>
        </div>
      )}

      {blocks.data.map((block) => {
        const blockUnits = allUnits.filter((unit) => unit.blockId === block.id)
        return (
          <section key={block.id} aria-labelledby={`block-${block.id}`} className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
              <h2 id={`block-${block.id}`} className="font-display text-lg font-semibold">
                {block.name} <span className="text-sm font-normal text-muted-foreground">· {blockUnits.length} daire</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setUnitDialog({ blockId: block.id })}>
                  <Plus /> Daire ekle
                </Button>
                <Button size="sm" variant="outline" onClick={() => setBulkDialog({ blockId: block.id })}>
                  <Layers /> Toplu oluştur
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={`${block.name} adını değiştir`} onClick={() => setBlockDialog({ block })}>
                  <Pencil />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${block.name} bloğunu sil`}
                  title={blockUnits.length > 0 ? 'Dairesi olan blok silinemez.' : undefined}
                  disabled={blockUnits.length > 0}
                  onClick={() => setConfirm({ kind: 'deleteBlock', block })}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>

            {blockUnits.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Bu blokta henüz daire yok.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kapı no</TableHead>
                      <TableHead>Kat</TableHead>
                      <TableHead>Tip</TableHead>
                      <TableHead className="text-right">Brüt m²</TableHead>
                      <TableHead className="text-right">Arsa payı</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead>Sakinler</TableHead>
                      <TableHead className="w-24 text-right">İşlemler</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockUnits.map((unit) => {
                      const residents = currentResidents(unit, today)
                      return (
                        <TableRow key={unit.id}>
                          <TableCell className="font-medium">{unit.doorNo}</TableCell>
                          <TableCell>{unit.floor ?? '—'}</TableCell>
                          <TableCell>{typeLabel(unit.type)}</TableCell>
                          <TableCell className="text-right tabular-nums">{unit.grossM2 === null ? '—' : number.format(unit.grossM2)}</TableCell>
                          <TableCell className="text-right tabular-nums">{unit.landShare === null ? '—' : number.format(unit.landShare)}</TableCell>
                          <TableCell>
                            <Badge variant={unit.status === 'occupied' ? 'secondary' : 'outline'}>{unit.status === 'occupied' ? 'Dolu' : 'Boş'}</Badge>
                          </TableCell>
                          <TableCell>
                            {residents.length === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <ul className="space-y-1">
                                {residents.map((r) => (
                                  <li key={r.id} className="flex flex-wrap items-center gap-1.5">
                                    <span>{r.fullName ?? r.email}</span>
                                    <Badge variant={r.relation === 'owner' ? 'default' : 'outline'}>{r.relation === 'owner' ? 'Malik' : 'Kiracı'}</Badge>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon-sm" variant="ghost" aria-label={`${block.name} ${unit.doorNo} numaralı daireyi düzenle`} onClick={() => setUnitDialog({ unit })}>
                                <Pencil />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`${block.name} ${unit.doorNo} numaralı daireyi arşivle`}
                                title={residents.length > 0 ? 'Önce sakinleri “Taşındı” olarak işaretleyin ya da daireden çıkarın.' : undefined}
                                disabled={residents.length > 0}
                                onClick={() => setConfirm({ kind: 'archive', unit })}
                              >
                                <Archive />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        )
      })}

      <BlockDialog open={blockDialog !== null} onOpenChange={(open) => !open && setBlockDialog(null)} siteId={site.id} block={blockDialog?.block} onSaved={refresh} />
      <UnitDialog
        open={unitDialog !== null}
        onOpenChange={(open) => !open && setUnitDialog(null)}
        blocks={blocks.data}
        defaultBlockId={unitDialog?.blockId}
        unit={unitDialog?.unit}
        onSaved={refresh}
      />
      <BulkUnitsDialog
        open={bulkDialog !== null}
        onOpenChange={(open) => !open && setBulkDialog(null)}
        blocks={blocks.data}
        units={allUnits}
        defaultBlockId={bulkDialog?.blockId}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={confirm?.kind === 'archive'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Daire arşivlensin mi?"
        description={
          confirm?.kind === 'archive'
            ? `${confirm.unit.doorNo} numaralı daire listeden kaldırılır. Geçmiş kayıtlar korunur.`
            : ''
        }
        confirmLabel="Arşivle"
        destructive
        onConfirm={async () => {
          if (confirm?.kind !== 'archive') return
          await archiveUnit(confirm.unit.id)
          await refresh()
          toast.success('Daire arşivlendi.')
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === 'deleteBlock'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Blok silinsin mi?"
        description={confirm?.kind === 'deleteBlock' ? `${confirm.block.name} bloğu silinecek. Bu işlem geri alınamaz.` : ''}
        confirmLabel="Sil"
        destructive
        onConfirm={async () => {
          if (confirm?.kind !== 'deleteBlock') return
          await deleteBlock(confirm.block.id)
          await refresh()
          toast.success('Blok silindi.')
        }}
      />
    </>
  )
}

export function UnitsPage() {
  return (
    <SiteGate title="Daireler" description="Site, bloklar ve daireler. Daireleri tek tek ya da toplu olarak ekleyin.">
      {(site) => <UnitsContent site={site} />}
    </SiteGate>
  )
}
