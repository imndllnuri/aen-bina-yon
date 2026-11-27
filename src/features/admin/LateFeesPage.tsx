import { Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { applyLateFees } from '@/features/lateFees/api'
import { lateFeeErrorMessage } from '@/features/lateFees/lib/messages'
import type { LateFeeLine, LateFeePreview } from '@/features/lateFees/lib/parse'
import { lateLabel, methodLabel, ruleWarnings, selectionTotals, unitName } from '@/features/lateFees/lib/summary'
import { useLateFeePreview, useRefreshLateFees } from '@/features/lateFees/queries'
import { formatDate, monthLabel } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import { createRequestIds } from '@/lib/request-ids'
import type { AdminSite } from './api'
import { ConfirmDialog } from './components/ConfirmDialog'
import { SiteGate } from './components/SiteGate'
import { useRefreshCharges } from './queries'

const debtLabel = (line: LateFeeLine) => `${line.typeName}${line.period ? ` · ${monthLabel(line.period)}` : ''}`

function Rules({ preview }: { preview: LateFeePreview }) {
  const warnings = ruleWarnings(preview)
  return (
    <section aria-label="Hesap kuralları" className="space-y-3 rounded-lg border bg-card p-4">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Hesap günü (bugün)</dt>
          <dd className="font-medium">{formatDate(preview.asOf)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Oran</dt>
          <dd className="font-medium">%{String(preview.rate).replace('.', ',')} / ay</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Yöntem</dt>
          <dd className="font-medium">{methodLabel(preview.method)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ek süre</dt>
          <dd className="font-medium">{preview.graceDays} gün</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        Bu değerler <Link to="/yonetim/ayarlar" className="underline underline-offset-2">Ayarlar</Link> sayfasında değişir. Hiçbir şey kendiliğinden yazılmaz: liste size gösterilir, siz onaylayınca yazılır.
      </p>
      {warnings.map((text) => (
        <p key={text} role="note" className="flex gap-2 rounded-lg border border-highlight/60 bg-highlight/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{text}</span>
        </p>
      ))}
    </section>
  )
}

function HowItWorks() {
  return (
    <details className="rounded-lg border bg-card p-4 text-sm">
      <summary className="cursor-pointer font-medium">Nasıl hesaplanıyor?</summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
        <li>Vadesi ve ek süresi geçen her borç için, her gecikme gününde <b>ödenmemiş</b> tutar üzerinden hesaplanır. Ödemelerin gerçek tarihlerine bakılır.</li>
        <li>Ödemenin yapıldığı gün de gecikmeli sayılır: para o günün başında hesapta değildi.</li>
        <li>Basit hesap: tazminata tazminat işlemez. “Gecikme Tazminatı” satırlarına ve “Devir Bakiyesi” satırlarına tazminat yazılmaz.</li>
        <li>Aynı süre iki kez yazılmaz. Daha önce yazılan düşülür, yalnızca yeni kısım yazılır. Bir tazminat satırını iptal ederseniz o tutar <b>affedilmiş</b> sayılır ve bir daha yazılmaz.</li>
        <li>Oranı, yöntemi ya da ek süreyi değiştirirseniz hesap, borcun tüm gecikme süresi için yeni değerlerle yeniden yapılır. Eksik kalan fark yazılır; fazla yazılmış olanlar aşağıda gösterilir, kendiliğinden geri alınmaz.</li>
        <li>Yanlış çalıştırdıysanız 15 dakika içinde Borçlandırma sayfasının “Toplu işlemler” sekmesinden toplu işlemi <b>silin</b>: hiçbir iz kalmaz ve yeniden hesaplayabilirsiniz.</li>
        <li>Tazminat, borcun sahibine görünür: kiracıya gösterilmeyen bir borcun tazminatı da kiracıya gösterilmez.</li>
      </ul>
    </details>
  )
}

function LateFeesContent({ site }: { site: AdminSite }) {
  const query = useLateFeePreview(site.id)
  const refreshFees = useRefreshLateFees()
  const refreshCharges = useRefreshCharges(site.id)
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [keyFor] = useState(() => createRequestIds())

  const preview = query.data
  const lines = useMemo(() => preview?.lines ?? [], [preview])
  const selected = useMemo(() => new Set(lines.filter((line) => !unticked.has(line.chargeId)).map((line) => line.chargeId)), [lines, unticked])
  const totals = useMemo(() => selectionTotals(lines, selected), [lines, selected])

  const toggle = (id: string, on: boolean) =>
    setUnticked((current) => {
      const next = new Set(current)
      if (on) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = (on: boolean) => setUnticked(on ? new Set() : new Set(lines.map((line) => line.chargeId)))

  if (query.isPending) return <LoadingBlock />
  if (query.isError || !preview) return <ErrorBlock text="Gecikme tazminatı hesabı şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void query.refetch()} />

  const allSelected = lines.length > 0 && selected.size === lines.length

  return (
    <div className="space-y-6">
      <Rules preview={preview} />

      {!preview.typeReady && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          “Gecikme Tazminatı” borç türü kapalı, bu yüzden tazminat yazılamaz. <Link to="/yonetim/ayarlar" className="underline underline-offset-2">Ayarlar</Link> sayfasındaki Borç türleri bölümünden açın.
        </p>
      )}

      <section aria-label="Yazılacak tazminatlar" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Yazılacak tazminatlar</h2>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            Listeyi yenile
          </Button>
        </div>

        {lines.length === 0 ? (
          <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            Şu anda yazılacak gecikme tazminatı yok. Vadesi geçmiş ve henüz tazminatı yazılmamış borç bulunmuyor.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Yazmak istemediğiniz satırların işaretini kaldırın. Onaylamadan hiçbir şey yazılmaz.</p>
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected ? true : selected.size > 0 ? 'indeterminate' : false}
                        onCheckedChange={(checked) => toggleAll(checked === true)}
                        aria-label="Tüm satırları seç"
                      />
                    </TableHead>
                    <TableHead>Daire</TableHead>
                    <TableHead>Borç</TableHead>
                    <TableHead>Son ödeme</TableHead>
                    <TableHead className="text-right">Ödenmemiş</TableHead>
                    <TableHead>Gecikme</TableHead>
                    <TableHead className="text-right">Yazılacak</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const on = selected.has(line.chargeId)
                    return (
                      <TableRow key={line.chargeId} className={on ? undefined : 'text-muted-foreground'}>
                        <TableCell>
                          <Checkbox checked={on} onCheckedChange={(checked) => toggle(line.chargeId, checked === true)} aria-label={`${unitName(line)} ${debtLabel(line)} için tazminat yaz`} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium">{unitName(line)}</TableCell>
                        <TableCell>
                          {debtLabel(line)}
                          {!line.tenantVisible && <div className="text-xs text-muted-foreground">Yalnızca malike görünür</div>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(line.dueDate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatKurus(line.remainingKurus)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {lateLabel(line.days, preview.method)}
                          {line.billedKurus > 0 && <div className="text-xs text-muted-foreground">daha önce yazılan: {formatKurus(line.billedKurus)}</div>}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatKurus(line.amountKurus)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={6}>
                      Seçili: {totals.count} satır{totals.count !== lines.length ? ` (toplam ${lines.length})` : ''}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatKurus(totals.kurus)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setConfirmOpen(true)} disabled={totals.count === 0 || !preview.typeReady}>
                Onayla ve yaz
              </Button>
            </div>
          </>
        )}
      </section>

      {preview.over.length > 0 && (
        <section aria-label="Fazla yazılmış tazminatlar" className="space-y-3">
          <h2 className="text-lg font-semibold">Fazla yazılmış tazminatlar</h2>
          <p className="text-sm text-muted-foreground">
            Bu borçlar için yazılan tazminat, bugünkü hesabın üstünde. Örneğin geçmiş tarihli bir ödeme sonradan girilmiş ya da oran düşürülmüş olabilir. Sistem bunu kendiliğinden geri almaz. Fazlayı kaldırmak
            için Borçlandırma sayfasında ilgili “Gecikme Tazminatı” satırını iptal edin.
          </p>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Daire</TableHead>
                  <TableHead>Borç</TableHead>
                  <TableHead className="text-right">Olması gereken</TableHead>
                  <TableHead className="text-right">Yazılan</TableHead>
                  <TableHead className="text-right">Fazla</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.over.map((line) => (
                  <TableRow key={line.chargeId}>
                    <TableCell className="whitespace-nowrap font-medium">{unitName(line)}</TableCell>
                    <TableCell>{debtLabel(line)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatKurus(line.feeKurus)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatKurus(line.billedKurus)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatKurus(-line.amountKurus)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <HowItWorks />

      {confirmOpen && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirmOpen(false)}
          title="Gecikme tazminatı yazılsın mı?"
          description={`${totals.count} borç satırı için toplam ${formatKurus(totals.kurus)} gecikme tazminatı yazılacak. Sakinler bunu borç ekranlarında görür ve bildirim alır. Yanlışsa 15 dakika içinde Borçlandırma sayfasının “Toplu işlemler” sekmesinden silebilirsiniz. Daha sonra bir satırı iptal etmek, o tazminatı affetmek demektir: aynı süre bir daha yazılmaz.`}
          confirmLabel="Evet, yaz"
          describeError={lateFeeErrorMessage}
          onConfirm={async () => {
            const input = { siteId: site.id, asOf: preview.asOf, chargeIds: totals.ids, expectedCount: totals.count, expectedKurus: totals.kurus }
            try {
              await applyLateFees({ ...input, requestId: keyFor(input) })
            } finally {
              // Whatever happened, show the real state: on "numbers changed" the person sees the new numbers behind the message.
              await Promise.all([refreshFees(), refreshCharges()])
            }
            setUnticked(new Set())
            toast.success(`${totals.count} borç satırı için ${formatKurus(totals.kurus)} gecikme tazminatı yazıldı.`)
          }}
        />
      )}
    </div>
  )
}

/** Gecikme Tazminatı: look at the fees that are due, untick what you do not want, approve. Nothing is written before that. */
export function LateFeesPage() {
  return (
    <SiteGate
      title="Gecikme Tazminatı"
      description="Vadesi geçmiş borçlar için tazminatı önce hesaplayın, listeyi kontrol edin, sonra onaylayın. Onaylamadan hiçbir şey yazılmaz."
    >
      {(site) => <LateFeesContent site={site} />}
    </SiteGate>
  )
}
