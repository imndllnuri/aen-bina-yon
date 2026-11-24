import { useState } from 'react'
import { NativeSelect } from '@/components/NativeSelect'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { AUDIT_PAGE, EMPTY_FILTERS, type AuditFilters, type AuditRow } from '@/features/audit/api'
import { ACTION_LABEL, changedKeys, fieldLabel, formatValue, headline, summarize, TABLE_LABEL } from '@/features/audit/lib/describe'
import { useAudit } from '@/features/audit/queries'
import { formatDateTime } from '@/lib/format'
import type { AdminSite } from './api'
import { SiteGate } from './components/SiteGate'

const ACTION_VARIANT = { insert: 'secondary', update: 'outline', delete: 'destructive' } as const

/** One row of the log in full: the changed columns before and after (update), or the whole row (insert, delete). */
function DetailDialog({ row, onOpenChange }: { row: AuditRow; onOpenChange: (open: boolean) => void }) {
  const keys = changedKeys(row)
  const data = row.action === 'delete' ? row.oldData : row.newData
  const entries = row.action === 'update' ? keys.map((k) => [k, row.oldData?.[k], row.newData?.[k]] as const) : Object.entries(data ?? {}).map(([k, v]) => [k, undefined, v] as const)
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{headline(row)}</DialogTitle>
          <DialogDescription>
            {formatDateTime(row.at)} · {row.actorName ?? (row.actorId ? 'Bilinmeyen kişi' : 'Sistem')}
            {row.rowId ? ` · kayıt no: ${row.rowId}` : ''}
          </DialogDescription>
        </DialogHeader>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu kayıtta ayrıntı yok.</p>
        ) : (
          <div className="relative overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <caption className="sr-only">Kaydın ayrıntısı</caption>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Alan</th>
                  {row.action === 'update' && <th scope="col" className="px-3 py-2 font-medium">Önce</th>}
                  <th scope="col" className="px-3 py-2 font-medium">{row.action === 'update' ? 'Sonra' : 'Değer'}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map(([key, before, after]) => (
                  <tr key={key}>
                    <th scope="row" className="px-3 py-2 text-left font-medium">{fieldLabel(key)}</th>
                    {row.action === 'update' && <td className="px-3 py-2 break-words text-muted-foreground">{formatValue(key, before)}</td>}
                    <td className="px-3 py-2 break-words">{formatValue(key, after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Bu kayıt değiştirilemez ve silinemez. Uzun metinler 300 karakterde kesilir.</p>
      </DialogContent>
    </Dialog>
  )
}

function AuditContent({ site }: { site: AdminSite }) {
  const [draft, setDraft] = useState<AuditFilters>(EMPTY_FILTERS)
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS)
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<AuditRow | null>(null)
  const log = useAudit(site, filters, page)
  const pages = log.data ? Math.max(1, Math.ceil(log.data.total / AUDIT_PAGE)) : 1
  const bad = draft.from !== '' && draft.to !== '' && draft.from > draft.to

  const apply = () => {
    if (bad) return
    setPage(0)
    setFilters(draft)
  }
  const clear = () => {
    setDraft(EMPTY_FILTERS)
    setFilters(EMPTY_FILTERS)
    setPage(0)
  }

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          apply()
        }}
        aria-label="Süzgeçler"
      >
        <div className="space-y-1.5">
          <label htmlFor="au-table" className="text-sm font-medium">Kayıt türü</label>
          <NativeSelect id="au-table" value={draft.table} onChange={(e) => setDraft({ ...draft, table: e.target.value })} className="w-48">
            <option value="">Tümü</option>
            {Object.entries(TABLE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="au-action" className="text-sm font-medium">İşlem</label>
          <NativeSelect id="au-action" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} className="w-36">
            <option value="">Tümü</option>
            {Object.entries(ACTION_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="au-actor" className="text-sm font-medium">Kim (ad)</label>
          <Input id="au-actor" value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })} className="w-44" autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="au-from" className="text-sm font-medium">Başlangıç</label>
          <Input id="au-from" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="w-40" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="au-to" className="text-sm font-medium">Bitiş</label>
          <Input id="au-to" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="w-40" />
        </div>
        <Button type="submit" disabled={bad}>Süz</Button>
        <Button type="button" variant="outline" onClick={clear}>Temizle</Button>
      </form>
      {bad && (
        <p role="alert" className="text-sm text-destructive">
          Başlangıç tarihi bitişten önce olmalı.
        </p>
      )}

      {log.isPending && <LoadingBlock />}
      {log.isError && <ErrorBlock text="İşlem geçmişi şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void log.refetch()} />}
      {log.data && log.data.rows.length === 0 && (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Bu süzgece uyan kayıt yok.
        </p>
      )}
      {log.data && log.data.rows.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            {log.data.total} kayıt · sayfa {page + 1} / {pages} · en yeni üstte
          </p>
          <div className="relative overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <caption className="sr-only">İşlem geçmişi</caption>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Zaman</th>
                  <th scope="col" className="px-3 py-2 font-medium">Kim</th>
                  <th scope="col" className="px-3 py-2 font-medium">İşlem</th>
                  <th scope="col" className="px-3 py-2 font-medium">Ne</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium"><span className="sr-only">Ayrıntı</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {log.data.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-3 py-2">{formatDateTime(row.at)}</td>
                    <td className="px-3 py-2">{row.actorName ?? (row.actorId ? 'Bilinmeyen kişi' : 'Sistem')}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={ACTION_VARIANT[row.action]}>{ACTION_LABEL[row.action]}</Badge>
                        <span>{TABLE_LABEL[row.table] ?? row.table}</span>
                      </div>
                    </td>
                    <td className="max-w-md px-3 py-2 break-words text-muted-foreground">{summarize(row) || '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setOpen(row)} aria-label={`${headline(row)}, ${formatDateTime(row.at)}: ayrıntıyı aç`}>
                        Ayrıntı
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Önceki
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
              Sonraki
            </Button>
          </div>
        </>
      )}
      {open && <DetailDialog row={open} onOpenChange={(o) => !o && setOpen(null)} />}
    </div>
  )
}

/** İşlem Geçmişi: who changed what and when, with before and after. Nobody can change or delete these records. */
export function AuditPage() {
  return (
    <SiteGate title="İşlem Geçmişi" description="Borç, ödeme, daire, sakin, duyuru, talep ve ayar değişiklikleri: kim, ne zaman, neyi değiştirdi. Kayıtlar otomatik tutulur; kimse değiştiremez ya da silemez.">
      {(site) => <AuditContent site={site} />}
    </SiteGate>
  )
}
