import { Phone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { NativeSelect } from '@/components/NativeSelect'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { AdminRequestListItem } from '@/features/requests/api'
import { PriorityBadge, SlaBadge, StatusBadge } from '@/features/requests/components/Badges'
import { CATEGORIES, categoryLabel, isOpenStatus, PRIORITIES, STEPS } from '@/features/requests/lib/catalog'
import { useSiteRequests } from '@/features/requests/queries'
import { formatDate } from '@/lib/format'
import type { AdminSite } from './api'
import { AdminRequestDialog } from './components/AdminRequestDialog'
import { SiteGate } from './components/SiteGate'

type Tab = 'open' | 'all' | 'done'
type View = 'list' | 'board'

/** Urgent = the highest number (the list PRIORITIES runs from low to urgent); an unknown code counts as the lowest. */
const priorityRank = (code: string) => PRIORITIES.findIndex((p) => p.code === code)

/** Open requests: the most urgent first, then the one that waited longest. Others: newest first. */
function sortFor(tab: Tab, rows: AdminRequestListItem[]): AdminRequestListItem[] {
  const list = [...rows]
  if (tab === 'open') return list.sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || a.createdAt.localeCompare(b.createdAt))
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function RequestTable({ rows, emptyText }: { rows: AdminRequestListItem[]; emptyText: string }) {
  if (rows.length === 0) {
    return (
      <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        {emptyText}
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Daire</TableHead>
            <TableHead>Talep</TableHead>
            <TableHead>Sakin</TableHead>
            <TableHead>Durum</TableHead>
            <TableHead>Açılış</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">İşlemler</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap font-medium">{row.unitLabel}</TableCell>
              <TableCell className="max-w-xs">
                <div className="truncate font-medium">{row.title}</div>
                <div className="text-xs text-muted-foreground">{categoryLabel(row.category)}</div>
              </TableCell>
              <TableCell>{row.requesterName ?? '—'}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge status={row.status} />
                  <PriorityBadge priority={row.priority} />
                  <SlaBadge request={row} />
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(row.createdAt)}</TableCell>
              <TableCell className="text-right">
                <Button asChild variant={row.status === 'acik' ? 'default' : 'ghost'} size="sm">
                  <Link to={`/yonetim/talepler/${row.id}`} aria-label={`${row.unitLabel} ${row.title} talebini aç`}>
                    {row.status === 'acik' ? 'İncele' : 'Ayrıntı'}
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** The board: one column per step. (The status is changed on the request's own page.) */
function Board({ rows }: { rows: AdminRequestListItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Talep panosu">
      {STEPS.map((step) => {
        const column = sortFor(isOpenStatus(step.code) ? 'open' : 'all', rows.filter((row) => row.status === step.code))
        return (
          <section key={step.code} className="space-y-2 rounded-lg border bg-muted/30 p-2" aria-label={`${step.label} sütunu`}>
            <h3 className="px-1 text-sm font-semibold">
              {step.label} ({column.length})
            </h3>
            {column.length === 0 && <p className="px-1 text-xs text-muted-foreground">Talep yok.</p>}
            <ul className="space-y-2">
              {column.map((row) => (
                <li key={row.id}>
                  <Link to={`/yonetim/talepler/${row.id}`} className="block rounded-md border bg-card p-2.5 text-sm shadow-xs hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                    <div className="font-medium">{row.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {row.unitLabel} · {formatDate(row.createdAt)}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <PriorityBadge priority={row.priority} />
                      <SlaBadge request={row} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function RequestsContent({ site }: { site: AdminSite }) {
  const requests = useSiteRequests(site.id)
  const [tab, setTab] = useState<Tab>('open')
  const [view, setView] = useState<View>('list')
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')

  const all = useMemo(() => requests.data ?? [], [requests.data])
  const searched = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr')
    return all.filter((row) => (category === '' || row.category === category) && (needle === '' || `${row.title} ${row.unitLabel} ${row.requesterName ?? ''}`.toLocaleLowerCase('tr').includes(needle)))
  }, [all, category, query])
  const openCount = searched.filter((row) => isOpenStatus(row.status)).length
  const shown = sortFor(
    tab,
    searched.filter((row) => (tab === 'open' ? isOpenStatus(row.status) : tab === 'done' ? !isOpenStatus(row.status) : true)),
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList>
            <TabsTrigger value="open">Açık ve devam eden ({openCount})</TabsTrigger>
            <TabsTrigger value="done">Tamamlanan</TabsTrigger>
            <TabsTrigger value="all">Tümü ({searched.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="space-y-1.5">
          <label htmlFor="req-category" className="text-sm font-medium">
            Kategori
          </label>
          <NativeSelect id="req-category" value={category} onChange={(event) => setCategory(event.target.value)} className="w-44">
            <option value="">Tümü</option>
            {CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="req-search" className="text-sm font-medium">
            Ara
          </label>
          <Input id="req-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Başlık, daire ya da sakin" className="w-56" />
        </div>
        <div className="ml-auto flex gap-1" role="group" aria-label="Görünüm">
          <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" aria-pressed={view === 'list'} onClick={() => setView('list')}>
            Liste
          </Button>
          <Button variant={view === 'board' ? 'default' : 'outline'} size="sm" aria-pressed={view === 'board'} onClick={() => setView('board')}>
            Pano
          </Button>
        </div>
      </div>

      {requests.isPending && <LoadingBlock />}
      {requests.isError && <ErrorBlock text="Talepler şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void requests.refetch()} />}
      {requests.data && view === 'list' && (
        <RequestTable
          rows={shown}
          emptyText={all.length === 0 ? 'Henüz talep yok. Sakinler “Taleplerim” sayfasından açar; telefonla gelen talebi siz de açabilirsiniz.' : 'Bu süzgece uyan talep yok.'}
        />
      )}
      {requests.data && view === 'board' && <Board rows={searched} />}
    </div>
  )
}

/** Talepler: every request of the site as a list or a board, newest and most urgent first; open one to answer it. */
export function AdminRequestsPage() {
  const [creating, setCreating] = useState(false)
  return (
    <SiteGate
      title="Talepler"
      description="Sakinlerin arıza ve istekleri. Önce acil olanlar ve en uzun bekleyenler gelir."
      actions={() => (
        <Button onClick={() => setCreating(true)}>
          <Phone aria-hidden="true" /> Telefonla talep aç
        </Button>
      )}
    >
      {(site) => (
        <>
          <RequestsContent site={site} />
          {creating && <AdminRequestDialog key={site.id} site={site} onOpenChange={(open) => !open && setCreating(false)} />}
        </>
      )}
    </SiteGate>
  )
}
