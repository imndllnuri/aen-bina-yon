import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes, signedInState } from '@/test/render'
import type { AllocationPreview, PreviewInput } from '@/features/transfers/api'
import type { AdminPaymentRow, ResidentRow, UnitRow } from './api'
import { AdminPaymentsPage } from './PaymentsPage'

const api = vi.hoisted(() => ({ fetchAdminSites: vi.fn(), fetchAdminPayments: vi.fn(), voidPayment: vi.fn(), fetchBlocks: vi.fn(), fetchUnits: vi.fn(), fetchResidents: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))
const transfers = vi.hoisted(() => ({ previewAllocation: vi.fn(), recordManualPayment: vi.fn() }))
vi.mock('@/features/transfers/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/transfers/api')>()), ...transfers }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
const receiptApi = vi.hoisted(() => ({ fetchReceipt: vi.fn() }))
vi.mock('@/features/receipt/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/receipt/api')>()), ...receiptApi }))

const routes = [{ path: '/yonetim/tahsilatlar', element: <AdminPaymentsPage /> }]
const row = (over: Partial<AdminPaymentRow> = {}): AdminPaymentRow => ({
  id: 'p1', receiptNo: 'MKB-2026-000001', paidAt: '2026-11-09T10:30:00Z', unitLabel: 'A Blok · 1', payerName: 'Mehmet Malik', amountKurus: 60000, feeKurus: 0,
  method: 'card', provider: 'mock', installments: 1, status: 'approved', voidReason: null, note: null, ...over,
})

const unit = (id: string, doorNo: string): UnitRow => ({ id, blockId: 'b1', doorNo, floor: null, type: 'daire', grossM2: null, landShare: null, status: 'active', residencies: [] })
const resident = (over: Partial<ResidentRow>): ResidentRow => ({
  residencyId: 'r', relation: 'owner', startDate: '2025-01-01', endDate: null, unitId: 'u1', doorNo: '1', blockName: 'A Blok', profileId: 'p', fullName: 'Kişi', email: null,
  phone: null, isActive: true, kvkkConsentAt: '2026-01-01T00:00:00Z', ...over,
})
const RESIDENTS: ResidentRow[] = [
  resident({ residencyId: 'r1', profileId: 'p-owner', fullName: 'Mehmet Malik', relation: 'owner' }),
  resident({ residencyId: 'r2', profileId: 'p-tenant', fullName: 'Kemal Kiracı', relation: 'tenant', startDate: '2026-01-01' }),
  resident({ residencyId: 'r3', profileId: 'p-former', fullName: 'Eski Kiracı', relation: 'tenant', startDate: '2024-01-01', endDate: '2025-06-01' }),
  resident({ residencyId: 'r4', profileId: 'p-off', fullName: 'Pasif Kişi', isActive: false }),
  resident({ residencyId: 'r5', profileId: 'p-next', fullName: 'Yarın Taşınan', relation: 'tenant', startDate: '2026-12-31' }),
  resident({ residencyId: 'r6', profileId: 'p-other', fullName: 'Başka Daire', unitId: 'u2', doorNo: '2' }),
]
// What the database would answer: the amount goes over the open lines, oldest first.
const OPEN = [
  { chargeId: 'l1', typeName: 'Aidat', description: null, period: '2026-09-01', dueDate: '2026-09-15', remainingKurus: 10000, applyKurus: 0 },
  { chargeId: 'l2', typeName: 'Aidat', description: null, period: '2026-10-01', dueDate: '2026-10-15', remainingKurus: 20000, applyKurus: 0 },
]
function fakePreview(input: PreviewInput): Promise<AllocationPreview> {
  const pool = input.chargeIds ? OPEN.filter((l) => input.chargeIds!.includes(l.chargeId)) : OPEN
  let left = input.amountKurus
  const lines = pool.map((l) => {
    const apply = Math.min(l.remainingKurus, left)
    left -= apply
    return { ...l, applyKurus: apply }
  })
  return Promise.resolve({ lines, excessKurus: left })
}

beforeEach(() => {
  for (const fn of [...Object.values(api), ...Object.values(receiptApi), ...Object.values(transfers), ...Object.values(toast)]) fn.mockReset()
  api.fetchAdminSites.mockResolvedValue([{ id: 's1', name: 'Demo Sitesi', companyId: 'c1' }])
  api.fetchAdminPayments.mockResolvedValue([row(), row({ id: 'p2', receiptNo: 'MKB-2026-000002', status: 'voided', voidReason: 'Deneme ödemesi', feeKurus: 750 })])
  api.voidPayment.mockResolvedValue(undefined)
  api.fetchBlocks.mockResolvedValue([{ id: 'b1', name: 'A Blok' }])
  api.fetchUnits.mockResolvedValue([unit('u2', '2'), unit('u1', '1')])
  api.fetchResidents.mockResolvedValue(RESIDENTS)
  transfers.previewAllocation.mockImplementation(fakePreview)
  transfers.recordManualPayment.mockResolvedValue('pay-new')
})

const open = () => renderRoutes(routes, { path: '/yonetim/tahsilatlar', authState: signedInState(['admin']) })

describe('Tahsilatlar', () => {
  it('lists the payments of the site with receipt number, payer, method and total (amount + fee)', async () => {
    open()
    const rows = (await screen.findAllByRole('row')).slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('MKB-2026-000001')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Mehmet Malik')).toBeInTheDocument()
    expect(within(rows[0]).getByText(/deneme/)).toBeInTheDocument() // the provider is the mock
    expect(within(rows[0]).getByText('Onaylandı')).toBeInTheDocument()
    expect(within(rows[1]).getByText(/₺607,50/)).toBeInTheDocument() // 600,00 + 7,50 commission
    expect(within(rows[1]).getByText('Neden: Deneme ödemesi')).toBeInTheDocument()
    expect(api.fetchAdminPayments).toHaveBeenCalledWith('s1')
  })

  it('cancels a payment only with a written reason, and a cancelled payment cannot be cancelled again', async () => {
    const user = userEvent.setup()
    open()
    const rows = (await screen.findAllByRole('row')).slice(1)
    expect(within(rows[1]).queryByRole('button', { name: 'Ödemeyi iptal et' })).not.toBeInTheDocument()
    await user.click(within(rows[0]).getByRole('button', { name: 'Ödemeyi iptal et' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/İptal geri alınamaz/)).toBeInTheDocument()
    await user.type(within(dialog).getByRole('textbox', { name: /İptal nedeni/ }), 'ab')
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi iptal et' }))
    expect(await within(dialog).findByText('Nedeni en az 3 karakter olarak yazın.')).toBeInTheDocument()
    expect(api.voidPayment).not.toHaveBeenCalled()
    await user.type(within(dialog).getByRole('textbox', { name: /İptal nedeni/ }), 'c')
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi iptal et' }))
    await waitFor(() => expect(api.voidPayment).toHaveBeenCalledWith('p1', 'abc'))
    await waitFor(() => expect(api.fetchAdminPayments).toHaveBeenCalledTimes(2)) // reloaded
  })

  it('has a friendly empty state and an error state', async () => {
    api.fetchAdminPayments.mockResolvedValue([])
    const first = open()
    expect(await screen.findByText(/Henüz bir tahsilat yok/)).toBeInTheDocument()
    first.queryClient.clear()
  })

  it('offers "try again" when the payments cannot be loaded', async () => {
    api.fetchAdminPayments.mockRejectedValue(new Error('network'))
    open()
    expect(await screen.findByText(/Tahsilatlar şu anda yüklenemedi/)).toBeInTheDocument()
  })
})

describe('Tahsilatlar: manual payment ("Elle ödeme gir")', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-23T09:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  const dialogOf = async (user: ReturnType<typeof userEvent.setup>) => {
    open()
    await user.click(await screen.findByRole('button', { name: 'Elle ödeme gir' }))
    return screen.findByRole('dialog')
  }
  async function fill(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, over: { unit?: string; payer?: string; amount?: string } = {}) {
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'A Blok · 1' })).toBeInTheDocument())
    await user.selectOptions(within(dialog).getByLabelText(/^Daire/), over.unit ?? 'u1')
    await user.selectOptions(within(dialog).getByLabelText(/^Ödeyen kişi/), over.payer ?? 'p-owner')
    await user.type(within(dialog).getByLabelText(/^Tutar/), over.amount ?? '250')
  }

  it('opens from the page header with the payer disabled until a unit is chosen', async () => {
    const dialog = await dialogOf(userEvent.setup())
    expect(within(dialog).getByRole('heading', { name: 'Elle ödeme gir' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^Ödeyen kişi/)).toBeDisabled()
    expect(within(dialog).getByLabelText(/Ödeme tarihi/)).toHaveValue('2026-11-23')
    expect(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' })).toBeDisabled()
  })

  it('lists the units in order, and for the chosen unit ONLY the people who live there today', async () => {
    const user = userEvent.setup()
    const dialog = await dialogOf(user)
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'A Blok · 1' })).toBeInTheDocument())
    expect(within(dialog).getAllByRole('option').map((o) => o.textContent).slice(0, 3)).toEqual(['Daire seçin', 'A Blok · 1', 'A Blok · 2'])
    await user.selectOptions(within(dialog).getByLabelText(/^Daire/), 'u1')
    const payers = within(dialog.querySelector('#manual-payer') as HTMLElement).getAllByRole('option').map((o) => o.textContent)
    expect(payers).toEqual(['Kişi seçin', 'Mehmet Malik (Kat Maliki)', 'Kemal Kiracı (Kiracı)', 'Başka biri (adını yazacağım)'])
  })

  it('shows which lines the amount would close, asked from the database with the payer', async () => {
    const user = userEvent.setup()
    const dialog = await dialogOf(user)
    await fill(user, dialog, { amount: '250' })
    const closing = await within(dialog).findByRole('list', { name: 'Kapanacak borçlar' })
    const items = within(closing).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('₺100,00')
    expect(items[1]).toHaveTextContent('₺150,00')
    expect(items[1]).toHaveTextContent('kısmi: ₺50,00 kalır')
    expect(transfers.previewAllocation).toHaveBeenCalledWith({ unitId: 'u1', payerId: 'p-owner', amountKurus: 25000, chargeIds: null })
  })

  it('saves a cash payment and reloads the list', async () => {
    const user = userEvent.setup()
    const dialog = await dialogOf(user)
    await fill(user, dialog)
    await user.type(within(dialog).getByLabelText(/^Açıklama/), 'Peşin aidat')
    await within(dialog).findByRole('list', { name: 'Kapanacak borçlar' })
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' }))
    await waitFor(() => expect(transfers.recordManualPayment).toHaveBeenCalledTimes(1))
    expect(transfers.recordManualPayment).toHaveBeenCalledWith({
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      unitId: 'u1',
      payerId: 'p-owner',
      payerName: null,
      method: 'cash',
      amountKurus: 25000,
      paidOn: '2026-11-23',
      chargeIds: null,
      note: 'Peşin aidat',
    })
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Ödeme kaydedildi/))
    await waitFor(() => expect(api.fetchAdminPayments.mock.calls.length).toBeGreaterThan(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('records office-card and havale payments with the method that was chosen, and an earlier date', async () => {
    const user = userEvent.setup()
    const dialog = await dialogOf(user)
    await fill(user, dialog, { amount: '100' })
    await user.selectOptions(within(dialog).getByLabelText(/^Yöntem/), 'pos')
    const date = within(dialog).getByLabelText(/Ödeme tarihi/)
    await user.clear(date)
    await user.type(date, '2026-11-13')
    await within(dialog).findByRole('list', { name: 'Kapanacak borçlar' })
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' }))
    await waitFor(() => expect(transfers.recordManualPayment).toHaveBeenCalled())
    expect(transfers.recordManualPayment.mock.calls[0][0]).toMatchObject({ method: 'pos', paidOn: '2026-11-13', amountKurus: 10000 })
  })

  it('wants the name when the payer is somebody else, and sends no profile', async () => {
    const user = userEvent.setup()
    const dialog = await dialogOf(user)
    await fill(user, dialog, { payer: 'other', amount: '100' })
    await within(dialog).findByRole('list', { name: 'Kapanacak borçlar' })
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' }))
    expect(await within(dialog).findByText('Ödeyen kişinin adını yazın.')).toBeInTheDocument()
    expect(transfers.recordManualPayment).not.toHaveBeenCalled()
    await user.type(within(dialog).getByLabelText(/Ödeyen kişinin adı/), 'Ali Veli')
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' }))
    await waitFor(() => expect(transfers.recordManualPayment).toHaveBeenCalled())
    expect(transfers.recordManualPayment.mock.calls[0][0]).toMatchObject({ payerId: null, payerName: 'Ali Veli' })
    expect(transfers.previewAllocation).toHaveBeenCalledWith(expect.objectContaining({ payerId: null }))
  })

  it('sends the picked lines (and only those)', async () => {
    const user = userEvent.setup()
    const dialog = await dialogOf(user)
    await fill(user, dialog, { amount: '50' })
    await within(dialog).findByRole('list', { name: 'Kapanacak borçlar' })
    await user.click(within(dialog).getByRole('radio', { name: /Borçları ben seçeyim/ }))
    await user.click(within(dialog).getByRole('checkbox', { name: /Aidat · Ekim 2026/ }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' })).toBeEnabled())
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' }))
    await waitFor(() => expect(transfers.recordManualPayment).toHaveBeenCalled())
    expect(transfers.recordManualPayment.mock.calls[0][0]).toMatchObject({ chargeIds: ['l2'], amountKurus: 5000 })
  })

  it('cannot save while the amount is bigger than what is open', async () => {
    const user = userEvent.setup()
    const dialog = await dialogOf(user)
    await fill(user, dialog, { amount: '400' }) // only 300 TL is open
    expect(await within(dialog).findByText(/₺100,00 fazla/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' })).toBeDisabled()
  })

  it('starts again from "oldest first" when the unit changes', async () => {
    const user = userEvent.setup()
    const dialog = await dialogOf(user)
    await fill(user, dialog, { amount: '50' })
    await user.click(within(dialog).getByRole('radio', { name: /Borçları ben seçeyim/ }))
    await user.selectOptions(within(dialog).getByLabelText(/^Daire/), 'u2')
    expect(within(dialog).getByLabelText(/^Ödeyen kişi/)).toHaveValue('')
    await user.selectOptions(within(dialog).getByLabelText(/^Ödeyen kişi/), 'p-other')
    expect(within(dialog).getByRole('radio', { name: /En eski borçtan başla/ })).toBeChecked()
  })

  it('shows the database answer when saving fails, and keeps what was typed', async () => {
    const user = userEvent.setup()
    transfers.recordManualPayment.mockRejectedValue({ message: 'amount_exceeds_debt' })
    const dialog = await dialogOf(user)
    await fill(user, dialog)
    await within(dialog).findByRole('list', { name: 'Kapanacak borçlar' })
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' }))
    expect(await within(dialog).findByText(/Fazla ödeme \(alacak\) henüz desteklenmiyor/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^Tutar/)).toHaveValue('250')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('a retry after a failure sends the same request id; a changed amount sends a new one', async () => {
    const user = userEvent.setup()
    transfers.recordManualPayment.mockRejectedValueOnce(new Error('network')).mockRejectedValueOnce(new Error('network')).mockResolvedValue('pay-new')
    const dialog = await dialogOf(user)
    await fill(user, dialog)
    await within(dialog).findByRole('list', { name: 'Kapanacak borçlar' })
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' }))
    await waitFor(() => expect(transfers.recordManualPayment).toHaveBeenCalledTimes(1))
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' }))
    await waitFor(() => expect(transfers.recordManualPayment).toHaveBeenCalledTimes(2))
    const [a, b] = transfers.recordManualPayment.mock.calls.map((c) => c[0])
    expect(b.requestId).toBe(a.requestId)
    await user.clear(within(dialog).getByLabelText(/^Tutar/))
    await user.type(within(dialog).getByLabelText(/^Tutar/), '260')
    await within(dialog).findByRole('list', { name: 'Kapanacak borçlar' })
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' }))
    await waitFor(() => expect(transfers.recordManualPayment).toHaveBeenCalledTimes(3))
    expect(transfers.recordManualPayment.mock.calls[2][0].requestId).not.toBe(a.requestId)
  })
})

describe('Tahsilatlar: payments entered by hand', () => {
  it('shows the method, "elle giriş" and the note; a cash payment has no installment text', async () => {
    api.fetchAdminPayments.mockResolvedValue([row({ id: 'p9', method: 'cash', provider: 'manual', note: 'Peşin aidat', payerName: 'Ali Veli' })])
    open()
    const rows = (await screen.findAllByRole('row')).slice(1)
    expect(within(rows[0]).getByText('Nakit')).toBeInTheDocument()
    expect(within(rows[0]).getByText(/elle giriş/)).toBeInTheDocument()
    expect(within(rows[0]).getByText('Not: Peşin aidat')).toBeInTheDocument()
    expect(within(rows[0]).queryByText(/Tek çekim/)).not.toBeInTheDocument()
    expect(within(rows[0]).queryByText(/deneme/)).not.toBeInTheDocument()
  })
})
