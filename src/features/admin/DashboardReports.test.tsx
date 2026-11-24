import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonthlyChart } from '@/features/reports/components/MonthlyChart'
import type { AttendanceRow, CollectionRow, DebtRow, Kpis, MethodTotal, MonthRow, ResidentReportRow } from '@/features/reports/api'
import { renderRoutes, signedInState } from '@/test/render'
import { AdminDashboardPage } from './DashboardPage'
import { ReportsPage } from './ReportsPage'

const api = vi.hoisted(() => ({ fetchAdminSites: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))
const reports = vi.hoisted(() => ({
  fetchKpis: vi.fn(), fetchMonthly: vi.fn(), fetchDebts: vi.fn(), fetchCollections: vi.fn(), fetchCollectionsSummary: vi.fn(), fetchResidentReport: vi.fn(), fetchAttendance: vi.fn(),
}))
vi.mock('@/features/reports/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/reports/api')>()), ...reports }))
const xlsx = vi.hoisted(() => ({ downloadXlsx: vi.fn() }))
vi.mock('@/features/reports/lib/xlsx', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/reports/lib/xlsx')>()), ...xlsx }))

const plain = (s: string | null) => (s ?? '').replace(/\u00a0/g, ' ')
const kpis: Kpis = { month: '2026-11-01', accruedKurus: 24200, collectedKurus: 2900, collectedForMonthKurus: 1500, ratePct: 6.2, receivableKurus: 33000, overdueUnits: 1, overdueKurus: 10300, pendingNotices: 3, openRequests: 2 }
const month = (m: string, accrued: number, collected: number): MonthRow => ({ month: m, accruedKurus: accrued, collectedKurus: collected, collectedForMonthKurus: 0, ratePct: null })
const debt = (over: Partial<DebtRow> = {}): DebtRow => ({ unitId: 'u1', blockName: 'A Blok', doorNo: '1', unitLabel: 'A Blok · 1', owners: 'Mehmet Malik', phone: '0532', balanceKurus: 32300, notDueKurus: 22000, d1to30Kurus: 300, d31to60Kurus: 1200, d61to90Kurus: 4800, over90Kurus: 4000, ...over })
const pay = (over: Partial<CollectionRow> = {}): CollectionRow => ({ paymentId: 'p1', paidAt: '2026-11-23T11:05:00Z', receiptNo: 'MKB-2026-000001', unitLabel: 'A Blok · 1', payerName: 'Mehmet', method: 'cash', amountKurus: 2400, feeKurus: 0, ...over })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-24T09:00:00Z'))
  for (const fn of [...Object.values(api), ...Object.values(reports), ...Object.values(xlsx)]) fn.mockReset()
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
  api.fetchAdminSites.mockResolvedValue([{ id: 's1', name: 'Demo Sitesi', companyId: 'c1' }])
  reports.fetchKpis.mockResolvedValue(kpis)
  reports.fetchMonthly.mockResolvedValue([month('2026-10-01', 300, 1000), month('2026-11-01', 24200, 2900)])
  reports.fetchDebts.mockResolvedValue([debt()])
  reports.fetchCollections.mockResolvedValue([pay()])
  reports.fetchCollectionsSummary.mockResolvedValue([{ method: 'cash', count: 1, amountKurus: 2400, feeKurus: 0 }, { method: null, count: 1, amountKurus: 2400, feeKurus: 0 }] satisfies MethodTotal[])
  reports.fetchResidentReport.mockResolvedValue([] satisfies ResidentReportRow[])
  reports.fetchAttendance.mockResolvedValue([] satisfies AttendanceRow[])
  window.print = vi.fn()
})
afterEach(() => vi.useRealTimers())

describe('MonthlyChart', () => {
  const rows = [month('2026-09-01', 10000, 5000), month('2026-10-01', 20000, 20000), month('2026-11-01', 0, 0)]
  it('draws two columns per month, the biggest value reaching the top of the scale', () => {
    render(<MonthlyChart rows={rows} />)
    const accrued = screen.getAllByTestId('bar-accrued').map((b) => b.style.height)
    const collected = screen.getAllByTestId('bar-collected').map((b) => b.style.height)
    expect(accrued).toEqual(['50%', '100%', '0%']) // the scale tops at 200 TL: 100 / 200, 200 / 200, nothing
    expect(collected).toEqual(['25%', '100%', '0%'])
  })
  it('has a legend that names both colours', () => {
    render(<MonthlyChart rows={rows} />)
    expect(screen.getByText(/Tahakkuk \(o ayın borçları\)/)).toBeInTheDocument()
    expect(screen.getByText(/Tahsil edilen \(o ay alınan ödemeler\)/)).toBeInTheDocument()
  })
  it('gives each month an accessible name with both amounts', () => {
    render(<MonthlyChart rows={rows} />)
    const group = screen.getByRole('group', { name: /Ekim 2026/ })
    expect(plain(group.getAttribute('aria-label'))).toBe('Ekim 2026: tahakkuk ₺200,00, tahsil edilen ₺200,00')
  })
  it('shows both amounts when a month is hovered or focused, and hides them again', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<MonthlyChart rows={rows} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await user.hover(screen.getByRole('group', { name: /Eylül 2026/ }))
    const tip = screen.getByRole('status')
    expect(plain(tip.textContent)).toContain('Eylül 2026')
    expect(plain(tip.textContent)).toContain('₺100,00')
    await user.unhover(screen.getByRole('group', { name: /Eylül 2026/ }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    act(() => screen.getByRole('group', { name: /Ekim 2026/ }).focus())
    expect(plain(screen.getByRole('status').textContent)).toContain('Ekim 2026') // keyboard users get the same details
  })
  it('can show the same numbers as a table (and go back)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<MonthlyChart rows={rows} />)
    await user.click(screen.getByRole('button', { name: 'Tabloyu göster' }))
    const table = screen.getByRole('table', { name: 'Aylara göre tahakkuk ve tahsilat' })
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    expect(plain(within(table).getByRole('row', { name: /Ekim 2026/ }).textContent)).toBe('Ekim 2026₺200,00₺200,00')
    expect(screen.queryByTestId('bar-accrued')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Grafiği göster' }))
    expect(screen.getAllByTestId('bar-accrued')).toHaveLength(3)
  })
  it('does not crash with no data', () => {
    render(<MonthlyChart rows={[]} />)
    expect(screen.getByRole('figure')).toBeInTheDocument()
  })
})

describe('Genel Bakış (dashboard)', () => {
  const open = () => renderRoutes([{ path: '/yonetim', element: <AdminDashboardPage /> }], { path: '/yonetim', authState: signedInState(['admin']) })

  it('shows the seven numbers of the month, each in words', async () => {
    open()
    const row = await screen.findByLabelText('Özet rakamlar')
    const text = plain(row.textContent)
    expect(text).toContain('Bu ay tahakkuk₺242,00Kasım 2026 borçları')
    expect(text).toContain('Bu ay tahsil edilen₺29,00')
    expect(text).toContain('Bu ayın borçlarından ödenen%6,2₺15,00 / ₺242,00')
    expect(text).toContain('Toplam alacak₺330,00')
    expect(text).toContain('Gecikmiş daire1₺103,00 gecikmiş tutar')
    expect(text).toContain('Bekleyen havale3')
    expect(text).toContain('Açık talep2')
  })
  it('says the rate is empty (not 0 %) when nothing was accrued', async () => {
    reports.fetchKpis.mockResolvedValue({ ...kpis, accruedKurus: 0, ratePct: null, collectedForMonthKurus: 0 })
    open()
    const row = await screen.findByLabelText('Özet rakamlar')
    expect(plain(row.textContent)).toContain('Bu ayın borçlarından ödenen—Bu ay borçlandırma yok')
  })
  it('links the boxes to the page that explains them', async () => {
    open()
    await screen.findByLabelText('Özet rakamlar')
    const href = (name: RegExp) => screen.getByRole('link', { name }).getAttribute('href')
    expect(href(/^Bekleyen havale/)).toBe('/yonetim/havale-onaylari')
    expect(href(/^Açık talep/)).toBe('/yonetim/talepler')
    expect(href(/^Toplam alacak/)).toBe('/yonetim/raporlar?r=borclar')
    expect(href(/^Bu ay tahsil edilen/)).toBe('/yonetim/raporlar?r=tahsilat')
  })
  it('has the two quick buttons: an announcement, and a reminder that starts with the debtors chosen', async () => {
    open()
    expect(await screen.findByRole('link', { name: 'Duyuru Gönder' })).toHaveAttribute('href', '/yonetim/duyurular?yeni=1')
    expect(screen.getByRole('link', { name: 'Hatırlatma Gönder' })).toHaveAttribute('href', '/yonetim/duyurular?yeni=1&hedef=borclular')
  })
  it('asks for the last 12 months, the 10 biggest debts and the 10 latest payments', async () => {
    open()
    await screen.findByLabelText('Özet rakamlar')
    await waitFor(() => expect(reports.fetchMonthly).toHaveBeenCalled())
    expect(reports.fetchMonthly).toHaveBeenCalledWith('s1', '2025-12-01', '2026-11-01')
    expect(reports.fetchDebts).toHaveBeenCalledWith('s1', 10)
    expect(reports.fetchCollections).toHaveBeenCalledWith('s1', '2025-11-24', '2026-11-24', 10)
  })
  it('lists the biggest debts and the latest payments', async () => {
    open()
    const debts = await screen.findByRole('table', { name: 'En çok borcu olan daireler' })
    expect(plain(within(debts).getAllByRole('row')[1]?.textContent)).toBe('A Blok · 1Mehmet Malik₺323,00')
    const latest = await screen.findByRole('table', { name: 'Son ödemeler' })
    expect(plain(within(latest).getAllByRole('row')[1]?.textContent)).toBe('23.11.2026 14:05A Blok · 1Nakit₺24,00')
  })
  it('says so when there is no debt and no payment', async () => {
    reports.fetchDebts.mockResolvedValue([])
    reports.fetchCollections.mockResolvedValue([])
    open()
    expect(await screen.findByText('Borcu olan daire yok.')).toBeInTheDocument()
    expect(screen.getByText('Henüz ödeme yok.')).toBeInTheDocument()
  })
  it('shows an error with "try again" for each part that fails, not a blank page', async () => {
    reports.fetchKpis.mockRejectedValue({ code: '42501' })
    reports.fetchDebts.mockRejectedValue(new Error('boom'))
    open()
    expect(await screen.findByText('Bu rapor için yetkiniz yok.')).toBeInTheDocument()
    expect((await screen.findAllByText(/Rapor şu anda hazırlanamadı/)).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Tekrar dene' }).length).toBeGreaterThan(1)
  })
})

describe('Raporlar', () => {
  const open = (path = '/yonetim/raporlar') => renderRoutes([{ path: '/yonetim/raporlar', element: <ReportsPage /> }], { path, authState: signedInState(['admin']) })

  it('opens on the debt list with the aging columns and a total row', async () => {
    open()
    const table = await screen.findByRole('table', { name: 'Borç Listesi (yaşlandırma)' })
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Daire', 'Kat maliki', 'Telefon', 'Vadesi gelmemiş', '1–30 gün', '31–60 gün', '61–90 gün', '90+ gün', 'Toplam borç'])
    const rows = within(table).getAllByRole('row')
    expect(plain(rows[1]?.textContent)).toBe('A Blok · 1Mehmet Malik0532₺220,00₺3,00₺12,00₺48,00₺40,00₺323,00')
    expect(plain(rows[2]?.textContent)).toContain('Toplam (1 daire)')
    expect(reports.fetchDebts).toHaveBeenCalledWith('s1', null)
  })
  it('opens the report named in the address (?r=)', async () => {
    open('/yonetim/raporlar?r=sakinler')
    expect(await screen.findByText('Şu anda dairelerde oturan kayıtlı kimse yok.')).toBeInTheDocument()
    expect(reports.fetchResidentReport).toHaveBeenCalled()
    expect(reports.fetchDebts).not.toHaveBeenCalled()
  })
  it('falls back to the debt list for an address it does not know', async () => {
    open('/yonetim/raporlar?r=zzz')
    expect(await screen.findByRole('table', { name: 'Borç Listesi (yaşlandırma)' })).toBeInTheDocument()
  })
  it('switches reports with the tabs, and each report starts again with its own question', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open()
    await screen.findByRole('table', { name: 'Borç Listesi (yaşlandırma)' })
    await user.click(screen.getByRole('tab', { name: 'Hazirun cetveli' }))
    expect(await screen.findByText('Bu sitede aktif bağımsız bölüm yok.')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Tahsilat' }))
    expect(await screen.findByRole('table', { name: 'Tahsilat Raporu' })).toBeInTheDocument()
  })
  it('exports the Excel file with the name of the report and the date', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open()
    await screen.findByRole('table', { name: 'Borç Listesi (yaşlandırma)' })
    await user.click(screen.getByRole('button', { name: /Excel’e aktar/ }))
    expect(xlsx.downloadXlsx).toHaveBeenCalledTimes(1)
    const [name, sheet] = xlsx.downloadXlsx.mock.calls[0] as [string, { name: string; rows: unknown[] }]
    expect(name).toBe('borc-listesi-2026-11-24.xlsx')
    expect(sheet.name).toBe('Borç listesi')
    expect(sheet.rows).toHaveLength(1)
  })
  it('prints with the browser (PDF is "print to PDF")', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open()
    await screen.findByRole('table', { name: 'Borç Listesi (yaşlandırma)' })
    await user.click(screen.getByRole('button', { name: /Yazdır \/ PDF/ }))
    expect(window.print).toHaveBeenCalledTimes(1)
  })
  it('prints a title block with the site and the date above the table', async () => {
    open()
    await screen.findByRole('table', { name: 'Borç Listesi (yaşlandırma)' })
    const block = screen.getAllByText('Borç Listesi (yaşlandırma)').find((el) => el.tagName === 'H1')
    expect(block).toBeDefined()
    expect(block?.parentElement?.className).toContain('print:block')
    expect(plain(block?.parentElement?.textContent ?? '')).toContain('Demo Sitesi · Düzenlenme tarihi: 24.11.2026')
  })
  it('turns both buttons off when the report is empty', async () => {
    reports.fetchDebts.mockResolvedValue([])
    open()
    expect(await screen.findByText('Borcu olan daire yok.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Excel’e aktar/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Yazdır \/ PDF/ })).toBeDisabled()
  })
  it('shows an error with "try again" when a report cannot be made', async () => {
    reports.fetchDebts.mockRejectedValue(new Error('boom'))
    open()
    expect(await screen.findByText(/Rapor şu anda hazırlanamadı/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Excel’e aktar/ })).toBeDisabled()
  })

  describe('Tahsilat', () => {
    it('asks for the last 30 days, shows the rows, a total and the summary by method', async () => {
      open('/yonetim/raporlar?r=tahsilat')
      const table = await screen.findByRole('table', { name: 'Tahsilat Raporu' })
      expect(reports.fetchCollections).toHaveBeenCalledWith('s1', '2026-10-26', '2026-11-24', null)
      expect(plain(within(table).getAllByRole('row')[1]?.textContent)).toBe('23.11.2026 14:05MKB-2026-000001A Blok · 1MehmetNakit₺24,00₺0,00')
      const summary = await screen.findByLabelText('Yönteme göre toplam')
      expect(plain(summary.textContent)).toContain('Nakit (1 ödeme)₺24,00')
      expect(plain(summary.textContent)).toContain('Toplam (1 ödeme)₺24,00')
      expect(plain(summary.textContent)).toContain('İptal edilen ödemeler sayılmaz')
    })
    it('does not ask the database a question it would refuse: an end before the start shows a message instead', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      open('/yonetim/raporlar?r=tahsilat')
      await screen.findByRole('table', { name: 'Tahsilat Raporu' })
      reports.fetchCollections.mockClear()
      const from = screen.getByLabelText('Başlangıç')
      await user.clear(from)
      await user.type(from, '2026-11-30')
      expect(await screen.findByText(/Başlangıç tarihi bitişten önce olmalı/)).toBeInTheDocument()
      for (const call of reports.fetchCollections.mock.calls) expect(call[1] <= call[2]).toBe(true) // every question that WAS asked had a good range
      expect(screen.getByRole('button', { name: /Excel’e aktar/ })).toBeDisabled()
    })
    it('refuses a period longer than about 3 years', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      open('/yonetim/raporlar?r=tahsilat')
      await screen.findByRole('table', { name: 'Tahsilat Raporu' })
      const from = screen.getByLabelText('Başlangıç')
      await user.clear(from)
      await user.type(from, '2020-01-01')
      expect(await screen.findByText(/aralık yaklaşık 3 yılı geçmemeli/)).toBeInTheDocument()
    })
  })

  describe('Aylık', () => {
    it('asks for the last 12 months and shows the months by name, with a total row and no total of the rate', async () => {
      open('/yonetim/raporlar?r=aylik')
      const table = await screen.findByRole('table', { name: 'Aylık Tahakkuk – Tahsilat Raporu' })
      expect(reports.fetchMonthly).toHaveBeenCalledWith('s1', '2025-12-01', '2026-11-01')
      const rows = within(table).getAllByRole('row')
      expect(plain(rows[1]?.textContent)).toContain('Ekim 2026')
      expect(plain(rows[3]?.textContent)).toBe('Toplam₺245,00₺39,00₺0,00—')
    })
    it('refuses more than 60 months and an end before the start, with a message', async () => {
      open('/yonetim/raporlar?r=aylik')
      await screen.findByRole('table', { name: 'Aylık Tahakkuk – Tahsilat Raporu' })
      // a month box cannot be typed into in jsdom: the value is set the way the browser sets it
      fireEvent.change(screen.getByLabelText('İlk ay'), { target: { value: '2020-01' } })
      expect(await screen.findByText(/en fazla 60 ay seçebilirsiniz/)).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('İlk ay'), { target: { value: '2027-01' } })
      expect(await screen.findByText(/İlk ay son aydan önce olmalı/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Excel’e aktar/ })).toBeDisabled()
    })
  })

  describe('Hazirun cetveli', () => {
    it('prints one row per unit with the share, an empty signature column and a total row', async () => {
      reports.fetchAttendance.mockResolvedValue([
        { unitId: 'u1', blockName: 'A Blok', doorNo: '1', owners: 'Mehmet Malik, Ortak Malik', landShare: 100, sharePct: 33.3333, totalLandShare: 300, unitCount: 2 },
        { unitId: 'u2', blockName: 'A Blok', doorNo: '2', owners: null, landShare: 200, sharePct: 66.6667, totalLandShare: 300, unitCount: 2 },
      ] satisfies AttendanceRow[])
      open('/yonetim/raporlar?r=hazirun')
      const table = await screen.findByRole('table', { name: 'Hazirun Cetveli' })
      const rows = within(table).getAllByRole('row')
      expect(plain(rows[1]?.textContent)).toBe('1A Blok1Mehmet Malik, Ortak Malik100,000033,3333')
      expect(plain(rows[2]?.textContent)).toContain('(kayıtlı kat maliki yok)')
      expect(plain(rows[3]?.textContent)).toContain('2 bağımsız bölüm')
      expect(plain(rows[3]?.textContent)).toContain('300,0000')
      expect(plain(rows[3]?.textContent)).toContain('100,0000')
      expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toContain('İmza')
    })
  })
})
