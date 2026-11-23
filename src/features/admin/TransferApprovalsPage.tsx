import { useState } from 'react'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDate, formatDateTime } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import { NoticeStatusBadge } from '@/features/transfers/components/NoticeStatusBadge'
import { useSiteNotices } from '@/features/transfers/queries'
import type { AdminNoticeRow } from '@/features/transfers/api'
import type { AdminSite } from './api'
import { BankAccountsCard } from './components/BankAccountsCard'
import { NoticeReviewDialog } from './components/NoticeReviewDialog'
import { SiteGate } from './components/SiteGate'

function NoticeTable({ rows, emptyText, onOpen }: { rows: AdminNoticeRow[]; emptyText: string; onOpen: (row: AdminNoticeRow) => void }) {
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
            <TableHead>Gönderen</TableHead>
            <TableHead className="text-right">Tutar</TableHead>
            <TableHead>Gönderim</TableHead>
            <TableHead>Bildirim</TableHead>
            <TableHead>Durum</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">İşlemler</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap font-medium">{row.unitLabel}</TableCell>
              <TableCell>
                <div>{row.senderFullName ?? '—'}</div>
                <div className="text-xs text-muted-foreground">Slipte: {row.senderName}</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatKurus(row.amountKurus)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(row.sentOn)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDateTime(row.createdAt)}</TableCell>
              <TableCell>
                <NoticeStatusBadge status={row.status} paymentStatus={row.paymentStatus} />
              </TableCell>
              <TableCell className="text-right">
                <Button variant={row.status === 'pending' ? 'default' : 'ghost'} size="sm" onClick={() => onOpen(row)} aria-label={`${row.unitLabel} ${formatKurus(row.amountKurus)} bildirimini aç`}>
                  {row.status === 'pending' ? 'İncele' : 'Ayrıntı'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ApprovalsContent({ site }: { site: AdminSite }) {
  const notices = useSiteNotices(site.id)
  // The row is looked up again by id from the fresh list, so the dialog never shows stale data after a refresh.
  const [openId, setOpenId] = useState<string | null>(null)

  const list = notices.data ?? []
  const waiting = list.filter((n) => n.status === 'pending')
  const opened = list.find((n) => n.id === openId) ?? null

  return (
    <div className="space-y-6">
      <BankAccountsCard site={site} />

      {notices.isPending && <LoadingBlock />}
      {notices.isError && <ErrorBlock text="Havale bildirimleri şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void notices.refetch()} />}
      {notices.data && (
        <Tabs defaultValue="pending">
          <TabsList className="print:hidden">
            <TabsTrigger value="pending">Bekleyenler ({waiting.length})</TabsTrigger>
            <TabsTrigger value="all">Tümü ({list.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="pt-3">
            <NoticeTable rows={waiting} emptyText="Bekleyen havale bildirimi yok." onOpen={(row) => setOpenId(row.id)} />
          </TabsContent>
          <TabsContent value="all" className="pt-3">
            <NoticeTable rows={list} emptyText="Henüz havale bildirimi gelmedi. Sakinler “Havale Bildir” sayfasından gönderir." onOpen={(row) => setOpenId(row.id)} />
          </TabsContent>
        </Tabs>
      )}

      {opened && <NoticeReviewDialog key={opened.id} notice={opened} onOpenChange={(open) => !open && setOpenId(null)} />}
    </div>
  )
}

/** Havale Onayları: the queue of notices, the dekont next to the facts, approve or reject; and the bank accounts residents see. */
export function TransferApprovalsPage() {
  return (
    <SiteGate title="Havale Onayları" description="Sakinlerin gönderdiği havale bildirimleri. Dekontu kontrol edin, onaylayın ya da nedenini yazarak reddedin.">
      {(site) => <ApprovalsContent site={site} />}
    </SiteGate>
  )
}
