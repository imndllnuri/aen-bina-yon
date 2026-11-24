import { Link } from 'react-router'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MonthlyChart } from '@/features/reports/components/MonthlyChart'
import { reportErrorMessage, type Kpis } from '@/features/reports/api'
import { addMonths } from '@/features/reports/lib/months'
import { methodLabel } from '@/features/reports/lib/sheets'
import { useCollections, useDebts, useKpis, useMonthly } from '@/features/reports/queries'
import { shiftDate } from '@/features/transfers/lib/lines'
import { currentMonthIstanbul, formatDateTime, monthLabel, todayIstanbul } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import type { AdminSite } from './api'
import { SiteGate } from './components/SiteGate'

const percent = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function Kpi({ label, value, hint, to }: { label: string; value: string; hint: string; to?: string }) {
  const body = (
    <CardContent className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </CardContent>
  )
  return (
    <Card size="sm" className={to ? 'transition-colors hover:bg-muted/40' : undefined}>
      {to ? (
        <Link to={to} className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={`${label}: ${value}. ${hint}`}>
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  )
}

function KpiRow({ kpis }: { kpis: Kpis }) {
  const month = monthLabel(kpis.month)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Özet rakamlar">
      <Kpi label="Bu ay tahakkuk" value={formatKurus(kpis.accruedKurus)} hint={`${month} borçları`} to="/yonetim/raporlar?r=aylik" />
      <Kpi label="Bu ay tahsil edilen" value={formatKurus(kpis.collectedKurus)} hint="Bu ay alınan ödemeler" to="/yonetim/raporlar?r=tahsilat" />
      <Kpi
        label="Bu ayın borçlarından ödenen"
        value={kpis.ratePct === null ? '—' : `%${percent.format(kpis.ratePct)}`}
        hint={kpis.ratePct === null ? 'Bu ay borçlandırma yok' : `${formatKurus(kpis.collectedForMonthKurus)} / ${formatKurus(kpis.accruedKurus)}`}
      />
      <Kpi label="Toplam alacak" value={formatKurus(kpis.receivableKurus)} hint="Tüm açık borçlar" to="/yonetim/raporlar?r=borclar" />
      <Kpi label="Gecikmiş daire" value={String(kpis.overdueUnits)} hint={`${formatKurus(kpis.overdueKurus)} gecikmiş tutar`} to="/yonetim/raporlar?r=borclar" />
      <Kpi label="Bekleyen havale" value={String(kpis.pendingNotices)} hint="Onay bekleyen bildirim" to="/yonetim/havale-onaylari" />
      <Kpi label="Açık talep" value={String(kpis.openRequests)} hint="Henüz çözülmemiş talepler" to="/yonetim/talepler" />
    </div>
  )
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-3" aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function DashboardContent({ site }: { site: AdminSite }) {
  const today = todayIstanbul()
  const thisMonth = currentMonthIstanbul()
  const kpis = useKpis(site.id)
  const monthly = useMonthly(site.id, addMonths(thisMonth, -11), thisMonth)
  const debts = useDebts(site.id, 10)
  const latest = useCollections(site.id, shiftDate(today, -365), today, 10)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/yonetim/duyurular?yeni=1">Duyuru Gönder</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/yonetim/duyurular?yeni=1&hedef=borclular">Hatırlatma Gönder</Link>
        </Button>
        <p className="basis-full text-xs text-muted-foreground">“Hatırlatma Gönder” duyuru penceresini borçlulara gidecek şekilde hazır açar; göndermeden önce metni değiştirebilirsiniz.</p>
      </div>

      {kpis.isPending && <LoadingBlock />}
      {kpis.isError && <ErrorBlock text={reportErrorMessage(kpis.error)} onRetry={() => void kpis.refetch()} />}
      {kpis.data && <KpiRow kpis={kpis.data} />}

      <Section title="Son 12 ay" action={<Link to="/yonetim/raporlar?r=aylik" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Aylık raporu aç</Link>}>
        {monthly.isPending && <LoadingBlock />}
        {monthly.isError && <ErrorBlock text={reportErrorMessage(monthly.error)} onRetry={() => void monthly.refetch()} />}
        {monthly.data && <div className="rounded-lg border bg-card p-4"><MonthlyChart rows={monthly.data} /></div>}
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="En çok borcu olan 10 daire" action={<Link to="/yonetim/raporlar?r=borclar" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Tüm liste</Link>}>
          {debts.isPending && <LoadingBlock />}
          {debts.isError && <ErrorBlock text={reportErrorMessage(debts.error)} onRetry={() => void debts.refetch()} />}
          {debts.data && debts.data.length === 0 && (
            <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              Borcu olan daire yok.
            </p>
          )}
          {debts.data && debts.data.length > 0 && (
            <div className="relative overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">En çok borcu olan daireler</caption>
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Daire</th>
                    <th scope="col" className="px-3 py-2 font-medium">Kat maliki</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Borç</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {debts.data.map((d) => (
                    <tr key={d.unitId}>
                      <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium">{d.unitLabel}</th>
                      <td className="px-3 py-2">{d.owners ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatKurus(d.balanceKurus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Son ödemeler" action={<Link to="/yonetim/tahsilatlar" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Tahsilatlar</Link>}>
          {latest.isPending && <LoadingBlock />}
          {latest.isError && <ErrorBlock text={reportErrorMessage(latest.error)} onRetry={() => void latest.refetch()} />}
          {latest.data && latest.data.length === 0 && (
            <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              Henüz ödeme yok.
            </p>
          )}
          {latest.data && latest.data.length > 0 && (
            <div className="relative overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">Son ödemeler</caption>
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Tarih</th>
                    <th scope="col" className="px-3 py-2 font-medium">Daire</th>
                    <th scope="col" className="px-3 py-2 font-medium">Yöntem</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Tutar</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {latest.data.map((p) => (
                    <tr key={p.paymentId}>
                      <td className="whitespace-nowrap px-3 py-2">{formatDateTime(p.paidAt)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{p.unitLabel}</td>
                      <td className="px-3 py-2">{methodLabel(p.method)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatKurus(p.amountKurus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

/** Genel Bakış: the numbers of the month, the last 12 months, the biggest debts and the latest payments. */
export function AdminDashboardPage() {
  return (
    <SiteGate title="Genel Bakış" description="Sitenizin bugünkü durumu. Rakamları veritabanı hesaplar; kutulara basarak ilgili sayfaya geçebilirsiniz.">
      {(site) => <DashboardContent site={site} />}
    </SiteGate>
  )
}
