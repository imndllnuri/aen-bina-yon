import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LateFeeLine, LateFeePreview } from '@/features/lateFees/lib/parse'
import { renderRoutes, signedInState } from '@/test/render'
import { LateFeesPage } from './LateFeesPage'

const api = vi.hoisted(() => ({ fetchAdminSites: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))
const fees = vi.hoisted(() => ({ fetchLateFeePreview: vi.fn(), applyLateFees: vi.fn() }))
vi.mock('@/features/lateFees/api', () => fees)
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const line = (over: Partial<LateFeeLine> = {}): LateFeeLine => ({
  chargeId: 'c1', unitId: 'u1', block: 'A Blok', door: '1', typeName: 'Aidat', period: '2026-10-01', dueDate: '2026-10-15', tenantVisible: true,
  principalKurus: 100000, remainingKurus: 100000, days: 44, feeKurus: 7333, billedKurus: 0, amountKurus: 7333, ...over,
})
const l1 = line()
const l2 = line({ chargeId: 'c2', unitId: 'u2', door: '2', typeName: 'Demirbaş', period: null, dueDate: '2026-11-01', days: 27, remainingKurus: 40000, amountKurus: 1800, feeKurus: 1800, tenantVisible: false })
const l3 = line({ chargeId: 'c3', unitId: 'u3', block: 'B Blok', door: '3', dueDate: '2026-11-10', days: 18, remainingKurus: 50000, amountKurus: 1500, feeKurus: 2000, billedKurus: 500 })
const preview = (over: Partial<LateFeePreview> = {}): LateFeePreview => ({ asOf: '2026-11-28', rate: 5, method: 'daily', graceDays: 0, typeReady: true, lines: [l1, l2, l3], over: [], ...over })

const open = () => renderRoutes([{ path: '/yonetim/gecikme-tazminati', element: <LateFeesPage /> }], { path: '/yonetim/gecikme-tazminati', authState: signedInState(['admin']) })
const row = async (text: RegExp) => (await screen.findByText(text)).closest('tr') as HTMLElement

beforeEach(() => {
  for (const fn of [...Object.values(api), ...Object.values(fees), ...Object.values(toast)]) fn.mockReset()
  api.fetchAdminSites.mockResolvedValue([{ id: 's1', name: 'Demo Sitesi', companyId: 'c1' }])
  fees.fetchLateFeePreview.mockResolvedValue(preview())
  fees.applyLateFees.mockResolvedValue('batch-1')
})

describe('Gecikme Tazminatı: the list', () => {
  it('has a title and says that nothing is written before approval', async () => {
    open()
    expect(await screen.findByRole('heading', { level: 1, name: 'Gecikme Tazminatı' })).toBeInTheDocument()
    expect(screen.getByText(/Onaylamadan hiçbir şey yazılmaz/)).toBeInTheDocument()
    await screen.findByText('A Blok · 1')
    expect(fees.fetchLateFeePreview).toHaveBeenCalledWith('s1')
  })
  it('shows the rules and the day of the calculation', async () => {
    open()
    const rules = await screen.findByRole('region', { name: 'Hesap kuralları' })
    expect(within(rules).getByText('28.11.2026')).toBeInTheDocument()
    expect(within(rules).getByText('%5 / ay')).toBeInTheDocument()
    expect(within(rules).getByText(/Günlük/)).toBeInTheDocument()
    expect(within(rules).getByText('0 gün')).toBeInTheDocument()
    expect(within(rules).getByRole('link', { name: 'Ayarlar' })).toHaveAttribute('href', '/yonetim/ayarlar')
  })
  it('shows one row per debt with unit, debt, due date, unpaid amount, days and the fee', async () => {
    open()
    const r = await row(/A Blok · 1/)
    expect(within(r).getByText('Aidat · Ekim 2026')).toBeInTheDocument()
    expect(within(r).getByText('15.10.2026')).toBeInTheDocument()
    expect(within(r).getByText('44 gün')).toBeInTheDocument()
    expect(within(r).getByText(/1\.000,00/)).toBeInTheDocument()
    expect(within(r).getByText(/73,33/)).toBeInTheDocument()
  })
  it('says what was written before for the same debt, and that an owner-only debt is owner-only', async () => {
    open()
    expect(within(await row(/B Blok · 3/)).getByText(/daha önce yazılan: .*5,00/)).toBeInTheDocument()
    expect(within(await row(/A Blok · 2/)).getByText('Yalnızca malike görünür')).toBeInTheDocument()
    expect(within(await row(/A Blok · 1/)).queryByText(/daha önce yazılan/)).not.toBeInTheDocument()
  })
  it('has every line ticked at first, with the total of all of them', async () => {
    open()
    await screen.findByText('A Blok · 1')
    for (const c of screen.getAllByRole('checkbox')) expect(c).toBeChecked()
    expect(screen.getByText(/Seçili: 3 satır/)).toBeInTheDocument()
    expect(screen.getByText(/106,33/)).toBeInTheDocument() // 73.33 + 18.00 + 15.00
  })
  it('lowers the total when a line is unticked, and the select-all box shows "some"', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByText('A Blok · 1')
    await user.click(screen.getByRole('checkbox', { name: /A Blok · 1 Aidat · Ekim 2026 için tazminat yaz/ }))
    expect(screen.getByText(/Seçili: 2 satır \(toplam 3\)/)).toBeInTheDocument()
    expect(screen.getByText(/33,00/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Tüm satırları seç' })).toHaveAttribute('aria-checked', 'mixed')
  })
  it('unticks everything with the select-all box, disables the button, and ticks everything again', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByText('A Blok · 1')
    await user.click(screen.getByRole('checkbox', { name: 'Tüm satırları seç' }))
    expect(screen.getByText(/Seçili: 0 satır/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Onayla ve yaz' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Tüm satırları seç' }))
    expect(screen.getByText(/Seçili: 3 satır/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Onayla ve yaz' })).toBeEnabled()
  })
  it('shows months for the monthly method', async () => {
    fees.fetchLateFeePreview.mockResolvedValue(preview({ method: 'monthly', lines: [l1] }))
    open()
    expect(await screen.findByText('2 ay (44 gün)')).toBeInTheDocument()
  })
  it('says there is nothing to write when the list is empty, and has no approve button', async () => {
    fees.fetchLateFeePreview.mockResolvedValue(preview({ lines: [] }))
    open()
    expect(await screen.findByText(/Şu anda yazılacak gecikme tazminatı yok/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Onayla ve yaz' })).not.toBeInTheDocument()
  })
  it('shows "try again" when the list cannot be loaded', async () => {
    fees.fetchLateFeePreview.mockRejectedValueOnce(new Error('boom'))
    const user = userEvent.setup()
    open()
    expect(await screen.findByText(/şu anda yüklenemedi/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByText('A Blok · 1')).toBeInTheDocument()
  })
  it('reads the list again with "Listeyi yenile"', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByText('A Blok · 1')
    await user.click(screen.getByRole('button', { name: 'Listeyi yenile' }))
    await waitFor(() => expect(fees.fetchLateFeePreview).toHaveBeenCalledTimes(2))
  })
})

describe('Gecikme Tazminatı: warnings and problems', () => {
  it('shows no warning for the legal rate with the daily method', async () => {
    open()
    await screen.findByText('A Blok · 1')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
  it('warns when the rate is above 5 % and when the started-month method is used', async () => {
    fees.fetchLateFeePreview.mockResolvedValue(preview({ rate: 7.5, method: 'monthly' }))
    open()
    await screen.findByText('A Blok · 1')
    const notes = screen.getAllByRole('note')
    expect(notes).toHaveLength(2)
    expect(notes[0]).toHaveTextContent(/%7,5/)
    expect(notes[1]).toHaveTextContent(/ilk günü bile tam ay/)
  })
  it('says the fee type is switched off and does not let the person approve', async () => {
    fees.fetchLateFeePreview.mockResolvedValue(preview({ typeReady: false }))
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent(/borç türü kapalı/)
    expect(screen.getByRole('button', { name: 'Onayla ve yaz' })).toBeDisabled()
  })
  it('lists the fees that were written too high, with the amounts, and says nothing is taken back by itself', async () => {
    fees.fetchLateFeePreview.mockResolvedValue(preview({ over: [line({ chargeId: 'c9', door: '9', feeKurus: 4000, billedKurus: 8333, amountKurus: -4333 })] }))
    open()
    const section = await screen.findByRole('region', { name: 'Fazla yazılmış tazminatlar' })
    expect(within(section).getByText('A Blok · 9')).toBeInTheDocument()
    expect(within(section).getByText(/40,00/)).toBeInTheDocument() // should be
    expect(within(section).getByText(/83,33/)).toBeInTheDocument() // written
    expect(within(section).getByText(/43,33/)).toBeInTheDocument() // too much
    expect(within(section).getByText(/kendiliğinden geri almaz/)).toBeInTheDocument()
  })
  it('has no "too high" section when there is nothing too high', async () => {
    open()
    await screen.findByText('A Blok · 1')
    expect(screen.queryByRole('region', { name: 'Fazla yazılmış tazminatlar' })).not.toBeInTheDocument()
  })
  it('explains how the fee is worked out', async () => {
    open()
    await screen.findByText('A Blok · 1')
    expect(screen.getByText('Nasıl hesaplanıyor?')).toBeInTheDocument()
    expect(screen.getByText(/affedilmiş/)).toBeInTheDocument()
  })
})

describe('Gecikme Tazminatı: approve', () => {
  const approve = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByText('A Blok · 1')
    await user.click(screen.getByRole('button', { name: 'Onayla ve yaz' }))
    return await screen.findByRole('dialog')
  }
  it('asks first and says how many lines and how much, and what undo means', async () => {
    const user = userEvent.setup()
    open()
    const dialog = await approve(user)
    expect(within(dialog).getByText('Gecikme tazminatı yazılsın mı?')).toBeInTheDocument()
    expect(within(dialog).getByText(/3 borç satırı için toplam .*106,33 gecikme tazminatı yazılacak/)).toBeInTheDocument()
    expect(within(dialog).getByText(/15 dakika içinde/)).toBeInTheDocument()
    expect(within(dialog).getByText(/affetmek demektir/)).toBeInTheDocument()
    expect(fees.applyLateFees).not.toHaveBeenCalled()
  })
  it('writes nothing when the person says no', async () => {
    const user = userEvent.setup()
    open()
    const dialog = await approve(user)
    await user.click(within(dialog).getByRole('button', { name: /Vazgeç|İptal/ }))
    expect(fees.applyLateFees).not.toHaveBeenCalled()
  })
  it('sends the ticked lines with the day, the count and the total the person saw, then reloads and says it worked', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByText('A Blok · 1')
    await user.click(screen.getByRole('checkbox', { name: /A Blok · 2 Demirbaş için tazminat yaz/ }))
    await user.click(screen.getByRole('button', { name: 'Onayla ve yaz' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Evet, yaz' }))
    await waitFor(() => expect(fees.applyLateFees).toHaveBeenCalledTimes(1))
    expect(fees.applyLateFees).toHaveBeenCalledWith({
      requestId: expect.any(String), siteId: 's1', asOf: '2026-11-28', chargeIds: ['c1', 'c3'], expectedCount: 2, expectedKurus: 8833,
    })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/2 borç satırı için .*88,33 gecikme tazminatı yazıldı/)))
    await waitFor(() => expect(fees.fetchLateFeePreview.mock.calls.length).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
  it('uses the same request id for the same retry, so a double click cannot write twice', async () => {
    fees.applyLateFees.mockRejectedValueOnce(new Error('network'))
    const user = userEvent.setup()
    open()
    const dialog = await approve(user)
    await user.click(within(dialog).getByRole('button', { name: 'Evet, yaz' }))
    expect(await within(dialog).findByText(/şu anda yapılamadı/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Evet, yaz' }))
    await waitFor(() => expect(fees.applyLateFees).toHaveBeenCalledTimes(2))
    const [first, second] = fees.applyLateFees.mock.calls.map((call) => (call[0] as { requestId: string }).requestId)
    expect(first).toBe(second)
  })
  it('shows "the numbers changed, nothing was written" and keeps the window open', async () => {
    fees.applyLateFees.mockRejectedValueOnce({ message: 'preview_outdated' })
    const user = userEvent.setup()
    open()
    const dialog = await approve(user)
    await user.click(within(dialog).getByRole('button', { name: 'Evet, yaz' }))
    expect(await within(dialog).findByText(/rakamlar değişti/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Hiçbir şey yazılmadı/)).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
    await waitFor(() => expect(fees.fetchLateFeePreview.mock.calls.length).toBeGreaterThanOrEqual(2)) // the list is read again behind the message
  })
  it('shows "nothing left to write" when somebody else wrote it first', async () => {
    fees.applyLateFees.mockRejectedValueOnce({ message: 'nothing_to_charge' })
    const user = userEvent.setup()
    open()
    const dialog = await approve(user)
    await user.click(within(dialog).getByRole('button', { name: 'Evet, yaz' }))
    expect(await within(dialog).findByText(/Yazılacak gecikme tazminatı kalmadı/)).toBeInTheDocument()
  })
})
