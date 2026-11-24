import { formatDate, monthLabel, TIME_ZONE } from '@/lib/format'
import { formatKurus, sumKurus } from '@/lib/money'
import type { AttendanceRow, CollectionRow, DebtRow, MonthRow, ResidentReportRow } from '../api'
import type { XCell, XSheet } from './xlsx'

// The five reports as tables: the same cells are drawn on the screen, printed, and written into the Excel file.
// All sums of money are sums of whole kuruş (integers). The shares of the hazirun cetveli come from the database.

export const METHOD_LABEL: Record<string, string> = { card: 'Kart', havale: 'Havale / EFT', cash: 'Nakit', pos: 'POS' }
export const methodLabel = (method: string | null) => (method === null ? 'Toplam' : (METHOD_LABEL[method] ?? method))

const str = (v: string | null): XCell => ({ t: 'str', v })
const money = (kurus: number): XCell => ({ t: 'money', kurus })

/** "2026-11-23T14:05:00+03:00" -> "2026-11-23T14:05" as the clock of Istanbul shows it. */
export function istanbulLocal(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

const percent = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const share4 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })

/** What a cell looks like on the screen and on paper. */
export function formatCell(cell: XCell): string {
  switch (cell.t) {
    case 'str':
      return cell.v ?? ''
    case 'money':
      return formatKurus(cell.kurus)
    case 'int':
      return String(cell.v)
    case 'pct':
      return cell.v === null ? '—' : `${percent.format(cell.v)} %`
    case 'dec4':
      return cell.v === null ? '' : share4.format(cell.v)
    case 'date':
      return cell.v ? formatDate(cell.v) : ''
    case 'datetime': {
      if (!cell.v) return ''
      const [d, t] = cell.v.split('T')
      return `${formatDate(d as string)} ${t ?? ''}`.trim()
    }
    case 'blank':
      return ''
  }
}

/** Numbers and money are written to the right. */
export const isNumeric = (cell: XCell | undefined) => cell?.t === 'money' || cell?.t === 'int' || cell?.t === 'pct' || cell?.t === 'dec4'

export type ReportId = 'borclar' | 'tahsilat' | 'aylik' | 'sakinler' | 'hazirun'

export const REPORTS: { id: ReportId; label: string; hint: string }[] = [
  { id: 'borclar', label: 'Borç listesi', hint: 'Her dairenin bugünkü borcu, gecikme süresine göre.' },
  { id: 'tahsilat', label: 'Tahsilat', hint: 'Seçilen günler arasında alınan ödemeler.' },
  { id: 'aylik', label: 'Aylık tahakkuk – tahsilat', hint: 'Ay ay: borçlandırılan ve tahsil edilen tutar.' },
  { id: 'sakinler', label: 'Sakin listesi', hint: 'Bugün dairelerde oturan herkes.' },
  { id: 'hazirun', label: 'Hazirun cetveli', hint: 'Kat malikleri kurulu için katılım listesi (imza sütunlu).' },
]

export const REPORT_TITLE: Record<ReportId, string> = {
  borclar: 'Borç Listesi (yaşlandırma)',
  tahsilat: 'Tahsilat Raporu',
  aylik: 'Aylık Tahakkuk – Tahsilat Raporu',
  sakinler: 'Sakin Listesi',
  hazirun: 'Hazirun Cetveli',
}

export function debtsSheet(rows: DebtRow[]): XSheet {
  const total = (pick: (r: DebtRow) => number) => money(sumKurus(rows.map(pick)))
  return {
    name: 'Borç listesi',
    head: ['Daire', 'Kat maliki', 'Telefon', 'Vadesi gelmemiş', '1–30 gün', '31–60 gün', '61–90 gün', '90+ gün', 'Toplam borç'],
    rows: rows.map((r) => [
      str(r.unitLabel),
      str(r.owners),
      str(r.phone),
      money(r.notDueKurus),
      money(r.d1to30Kurus),
      money(r.d31to60Kurus),
      money(r.d61to90Kurus),
      money(r.over90Kurus),
      money(r.balanceKurus),
    ]),
    total: rows.length === 0 ? undefined : [str(`Toplam (${rows.length} daire)`), str(null), str(null), total((r) => r.notDueKurus), total((r) => r.d1to30Kurus), total((r) => r.d31to60Kurus), total((r) => r.d61to90Kurus), total((r) => r.over90Kurus), total((r) => r.balanceKurus)],
    widths: [16, 30, 16, 16, 14, 14, 14, 14, 16],
    landscape: true,
  }
}

export function collectionsSheet(rows: CollectionRow[]): XSheet {
  return {
    name: 'Tahsilat',
    head: ['Tarih', 'Makbuz no', 'Daire', 'Ödeyen', 'Yöntem', 'Tutar', 'Komisyon'],
    rows: rows.map((r) => [{ t: 'datetime', v: istanbulLocal(r.paidAt) }, str(r.receiptNo), str(r.unitLabel), str(r.payerName), str(methodLabel(r.method)), money(r.amountKurus), money(r.feeKurus)]),
    total: rows.length === 0 ? undefined : [str(`Toplam (${rows.length} ödeme)`), str(null), str(null), str(null), str(null), money(sumKurus(rows.map((r) => r.amountKurus))), money(sumKurus(rows.map((r) => r.feeKurus)))],
    widths: [18, 18, 16, 28, 16, 16, 14],
  }
}

export function monthlySheet(rows: MonthRow[]): XSheet {
  return {
    name: 'Aylık',
    head: ['Ay', 'Tahakkuk', 'Bu ay tahsil edilen', 'Bu ayın borçlarından ödenen', 'Oran (ödenen / tahakkuk)'],
    rows: rows.map((r) => [str(monthLabel(r.month)), money(r.accruedKurus), money(r.collectedKurus), money(r.collectedForMonthKurus), { t: 'pct', v: r.ratePct }]),
    total:
      rows.length === 0
        ? undefined
        : [str('Toplam'), money(sumKurus(rows.map((r) => r.accruedKurus))), money(sumKurus(rows.map((r) => r.collectedKurus))), money(sumKurus(rows.map((r) => r.collectedForMonthKurus))), { t: 'pct', v: null }],
    widths: [18, 18, 20, 28, 24],
  }
}

export function residentsSheet(rows: ResidentReportRow[]): XSheet {
  return {
    name: 'Sakinler',
    head: ['Daire', 'Kat', 'Brüt m²', 'Arsa payı', 'İlişki', 'Ad soyad', 'Telefon', 'E-posta', 'Taşınma tarihi', 'Hesap'],
    rows: rows.map((r) => [
      str(`${r.blockName} · ${r.doorNo}`),
      r.floor === null ? { t: 'blank' } : { t: 'int', v: r.floor },
      { t: 'dec4', v: r.grossM2 },
      { t: 'dec4', v: r.landShare },
      str(r.relation === 'owner' ? 'Kat maliki' : 'Kiracı'),
      str(r.fullName),
      str(r.phone),
      str(r.email),
      { t: 'date', v: r.startDate },
      str(r.isActive ? 'Aktif' : 'Pasif'),
    ]),
    widths: [16, 8, 12, 14, 14, 28, 18, 30, 16, 10],
    landscape: true,
  }
}

export function attendanceSheet(rows: AttendanceRow[]): XSheet {
  const first = rows[0]
  return {
    name: 'Hazirun cetveli',
    head: ['Sıra', 'Blok', 'Kapı no', 'Kat maliki', 'Arsa payı', 'Pay (%)', 'İmza'],
    rows: rows.map((r, i) => [{ t: 'int', v: i + 1 }, str(r.blockName), str(r.doorNo), str(r.owners ?? '(kayıtlı kat maliki yok)'), { t: 'dec4', v: r.landShare }, { t: 'dec4', v: r.sharePct }, { t: 'blank' }]),
    total: first
      ? [str(null), str('TOPLAM'), str(`${first.unitCount} bağımsız bölüm`), str(null), { t: 'dec4', v: first.totalLandShare }, { t: 'dec4', v: first.totalLandShare > 0 ? 100 : null }, str(null)]
      : undefined,
    widths: [7, 14, 10, 40, 14, 12, 34],
  }
}

/** A file name that is safe on every system: "borc-listesi-2026-11-24.xlsx" */
export function fileNameFor(id: ReportId, today: string): string {
  const slug: Record<ReportId, string> = { borclar: 'borc-listesi', tahsilat: 'tahsilat', aylik: 'aylik-tahakkuk-tahsilat', sakinler: 'sakin-listesi', hazirun: 'hazirun-cetveli' }
  return `${slug[id]}-${today}.xlsx`
}
