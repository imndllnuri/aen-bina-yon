import { FileSpreadsheet, Printer } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReportTable } from '@/features/reports/components/ReportTable'
import { reportErrorMessage } from '@/features/reports/api'
import { attendanceSheet, collectionsSheet, debtsSheet, fileNameFor, methodLabel, monthlySheet, REPORT_TITLE, REPORTS, residentsSheet, type ReportId } from '@/features/reports/lib/sheets'
import { addMonths, dateToMonthInput, MAX_MONTHS, monthInputToDate, monthsBetween } from '@/features/reports/lib/months'
import { downloadXlsx, type XSheet } from '@/features/reports/lib/xlsx'
import { useAttendance, useCollections, useCollectionsSummary, useDebts, useMonthly, useResidentReport } from '@/features/reports/queries'
import { shiftDate } from '@/features/transfers/lib/lines'
import { currentMonthIstanbul, formatDate, monthLabel, todayIstanbul } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import type { AdminSite } from './api'
import { SiteGate } from './components/SiteGate'

/** Title, buttons (Excel, print), the filters, and the table. On paper only the title block and the table are printed. */
function ReportFrame({
  id,
  site,
  sheet,
  filters,
  extra,
  state,
  emptyText,
  periodText,
}: {
  id: ReportId
  site: AdminSite
  sheet: XSheet | null
  filters?: ReactNode
  extra?: ReactNode
  state: { isPending: boolean; isError: boolean; error: unknown; refetch: () => void }
  emptyText: string
  periodText?: string
}) {
  const today = todayIstanbul()
  return (
    <section className="space-y-4" aria-label={REPORT_TITLE[id]}>
      {/* what is printed above the table */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">{REPORT_TITLE[id]}</h1>
        <p className="text-sm">
          {site.name} · Düzenlenme tarihi: {formatDate(today)}
          {periodText ? ` · ${periodText}` : ''}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        {filters}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" disabled={!sheet || sheet.rows.length === 0} onClick={() => sheet && downloadXlsx(fileNameFor(id, today), sheet)}>
            <FileSpreadsheet aria-hidden="true" /> Excel’e aktar
          </Button>
          <Button variant="outline" disabled={!sheet || sheet.rows.length === 0} onClick={() => window.print()}>
            <Printer aria-hidden="true" /> Yazdır / PDF
          </Button>
        </div>
      </div>

      {state.isPending && <LoadingBlock />}
      {state.isError && <ErrorBlock text={reportErrorMessage(state.error)} onRetry={() => state.refetch()} />}
      {extra}
      {sheet && <ReportTable sheet={sheet} caption={REPORT_TITLE[id]} emptyText={emptyText} />}
    </section>
  )
}

function DebtsReport({ site }: { site: AdminSite }) {
  const query = useDebts(site.id, null)
  const sheet = useMemo(() => (query.data ? debtsSheet(query.data) : null), [query.data])
  return (
    <ReportFrame
      id="borclar"
      site={site}
      sheet={sheet}
      state={query}
      emptyText="Borcu olan daire yok."
      extra={<p className="text-sm text-muted-foreground print:hidden">Bugünün durumudur. Yaşlandırma, her borcun <b>kalan</b> tutarına ve vade tarihinden geçen güne göre yapılır (kısmen ödenmiş borç yalnızca kalanıyla sayılır).</p>}
    />
  )
}

function CollectionsReport({ site }: { site: AdminSite }) {
  const today = todayIstanbul()
  const [from, setFrom] = useState(shiftDate(today, -29))
  const [to, setTo] = useState(today)
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to && Date.parse(to) - Date.parse(from) <= 1100 * 86_400_000
  // an invalid range is not sent: the page says why instead of asking the database a question it will refuse
  const safeFrom = valid ? from : today
  const safeTo = valid ? to : today
  const query = useCollections(site.id, safeFrom, safeTo, null)
  const summary = useCollectionsSummary(site.id, safeFrom, safeTo)
  const sheet = useMemo(() => (valid && query.data ? collectionsSheet(query.data) : null), [valid, query.data])
  return (
    <ReportFrame
      id="tahsilat"
      site={site}
      sheet={sheet}
      state={valid ? query : { ...query, isPending: false, isError: false }}
      emptyText="Bu tarihler arasında ödeme yok."
      periodText={`${formatDate(safeFrom)} – ${formatDate(safeTo)}`}
      filters={
        <>
          <div className="space-y-1.5">
            <label htmlFor="col-from" className="text-sm font-medium">
              Başlangıç
            </label>
            <Input id="col-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} max={to} className="w-44" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="col-to" className="text-sm font-medium">
              Bitiş
            </label>
            <Input id="col-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} min={from} className="w-44" />
          </div>
        </>
      }
      extra={
        <>
          {!valid && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm print:hidden">
              Başlangıç tarihi bitişten önce olmalı ve aralık yaklaşık 3 yılı geçmemeli.
            </p>
          )}
          {valid && summary.data && summary.data.length > 0 && (
            <div className="rounded-lg border bg-card p-3 text-sm" aria-label="Yönteme göre toplam">
              <h2 className="mb-2 font-medium">Yönteme göre</h2>
              <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {summary.data.map((row) => (
                  <li key={row.method ?? 'total'} className={`flex justify-between gap-3 ${row.method === null ? 'font-semibold sm:col-span-2 border-t pt-1' : ''}`}>
                    <span>
                      {methodLabel(row.method)} ({row.count} ödeme)
                    </span>
                    <span className="tabular-nums">{formatKurus(row.amountKurus)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">İptal edilen ödemeler sayılmaz. Tutar, borçları kapatan paradır; kart komisyonu ayrı yazılır.</p>
            </div>
          )}
        </>
      }
    />
  )
}

function MonthlyReport({ site }: { site: AdminSite }) {
  const thisMonth = currentMonthIstanbul()
  const [from, setFrom] = useState(addMonths(thisMonth, -11))
  const [to, setTo] = useState(thisMonth)
  const span = monthsBetween(from, to)
  const valid = span >= 0 && span < MAX_MONTHS
  const query = useMonthly(site.id, valid ? from : thisMonth, valid ? to : thisMonth)
  const sheet = useMemo(() => (valid && query.data ? monthlySheet(query.data) : null), [valid, query.data])
  const set = (setter: (value: string) => void) => (event: { target: { value: string } }) => {
    const date = monthInputToDate(event.target.value)
    if (date) setter(date)
  }
  return (
    <ReportFrame
      id="aylik"
      site={site}
      sheet={sheet}
      state={valid ? query : { ...query, isPending: false, isError: false }}
      emptyText="Bu aylar için kayıt yok."
      periodText={`${monthLabel(from)} – ${monthLabel(to)}`}
      filters={
        <>
          <div className="space-y-1.5">
            <label htmlFor="mon-from" className="text-sm font-medium">
              İlk ay
            </label>
            <Input id="mon-from" type="month" value={dateToMonthInput(from)} onChange={set(setFrom)} className="w-44" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="mon-to" className="text-sm font-medium">
              Son ay
            </label>
            <Input id="mon-to" type="month" value={dateToMonthInput(to)} onChange={set(setTo)} className="w-44" />
          </div>
        </>
      }
      extra={
        <>
          {!valid && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm print:hidden">
              İlk ay son aydan önce olmalı; en fazla {MAX_MONTHS} ay seçebilirsiniz.
            </p>
          )}
          <p className="text-sm text-muted-foreground print:hidden">
            <b>Tahakkuk</b>: o ayın (iptal edilmemiş) borçları. <b>Bu ay tahsil edilen</b>: o ay alınan ödemeler. <b>Bu ayın borçlarından ödenen</b>: o ayın borçlarına, ne zaman olursa olsun, yapılan ödemeler. Komisyon dahil değildir; iptal edilen ödemeler sayılmaz.
          </p>
        </>
      }
    />
  )
}

function ResidentsReport({ site }: { site: AdminSite }) {
  const query = useResidentReport(site.id)
  const sheet = useMemo(() => (query.data ? residentsSheet(query.data) : null), [query.data])
  return (
    <ReportFrame
      id="sakinler"
      site={site}
      sheet={sheet}
      state={query}
      emptyText="Şu anda dairelerde oturan kayıtlı kimse yok."
      extra={<p className="text-sm text-muted-foreground print:hidden">Telefon ve e-posta kişisel veridir: dosyayı yalnızca yönetim için kullanın ve gereksiz yere paylaşmayın.</p>}
    />
  )
}

function AttendanceReport({ site }: { site: AdminSite }) {
  const query = useAttendance(site.id)
  const sheet = useMemo(() => (query.data ? attendanceSheet(query.data) : null), [query.data])
  return (
    <ReportFrame
      id="hazirun"
      site={site}
      sheet={sheet}
      state={query}
      emptyText="Bu sitede aktif bağımsız bölüm yok."
      extra={<p className="text-sm text-muted-foreground print:hidden">Her bağımsız bölüm tek satırdır (birden çok kat maliki aynı hücrede), böylece arsa payı bir kez sayılır. Kayıtlı kat maliki olmayan daireler de listelenir.</p>}
    />
  )
}

function ReportsContent({ site }: { site: AdminSite }) {
  const [params, setParams] = useSearchParams()
  const asked = params.get('r')
  const current: ReportId = REPORTS.some((r) => r.id === asked) ? (asked as ReportId) : 'borclar'
  const hint = REPORTS.find((r) => r.id === current)?.hint

  return (
    <div className="space-y-5">
      <Tabs value={current} onValueChange={(value) => setParams({ r: value }, { replace: true })} className="print:hidden">
        <TabsList className="h-auto flex-wrap justify-start">
          {REPORTS.map((r) => (
            <TabsTrigger key={r.id} value={r.id}>
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {hint && <p className="text-sm text-muted-foreground print:hidden">{hint}</p>}
      {/* key: another report starts with its own filters */}
      {current === 'borclar' && <DebtsReport key="borclar" site={site} />}
      {current === 'tahsilat' && <CollectionsReport key="tahsilat" site={site} />}
      {current === 'aylik' && <MonthlyReport key="aylik" site={site} />}
      {current === 'sakinler' && <ResidentsReport key="sakinler" site={site} />}
      {current === 'hazirun' && <AttendanceReport key="hazirun" site={site} />}
    </div>
  )
}

/** Raporlar: five reports, each as a table that can be saved as an Excel file or printed (PDF). */
export function ReportsPage() {
  return (
    <SiteGate title="Raporlar" description="Borç listesi, tahsilat, aylık tahakkuk–tahsilat, sakin listesi ve hazirun cetveli. Rakamları veritabanı hesaplar.">
      {(site) => <ReportsContent site={site} />}
    </SiteGate>
  )
}
