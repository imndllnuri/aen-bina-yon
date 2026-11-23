import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes, signedInState } from '@/test/render'
import type { AdminNoticeRow, AllocationPreview, PreviewInput } from '@/features/transfers/api'
import { TransferApprovalsPage } from './TransferApprovalsPage'

const api = vi.hoisted(() => ({ fetchAdminSites: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))
const transfers = vi.hoisted(() => ({
  fetchSiteNotices: vi.fn(),
  fetchBankAccounts: vi.fn(),
  saveBankAccounts: vi.fn(),
  dekontUrl: vi.fn(),
  previewAllocation: vi.fn(),
  approveTransferNotice: vi.fn(),
  rejectTransferNotice: vi.fn(),
}))
vi.mock('@/features/transfers/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/transfers/api')>()), ...transfers }))
const receiptApi = vi.hoisted(() => ({ fetchReceipt: vi.fn() }))
vi.mock('@/features/receipt/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/receipt/api')>()), ...receiptApi }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const routes = [{ path: '/yonetim/havale-onaylari', element: <TransferApprovalsPage /> }]

const notice = (over: Partial<AdminNoticeRow> = {}): AdminNoticeRow => ({
  id: 'n1', unitId: 'u1', amountKurus: 25000, sentOn: '2026-11-20', senderName: 'AYŞE KAYA', note: 'Kasım aidatı', filePath: 'u1/aaaa.jpg', status: 'pending',
  createdAt: '2026-11-21T08:00:00Z', reviewedAt: null, rejectReason: null, paymentId: null, paymentStatus: null, receiptNo: null,
  unitLabel: 'A Blok · 1', senderId: 'p1', senderFullName: 'Ayşe Kaya', senderPhone: '0532 111 22 33', ...over,
})

const line = (id: string, over: Partial<AllocationPreview['lines'][number]> = {}) => ({
  chargeId: id, typeName: 'Aidat', description: null, period: '2026-09-01', dueDate: '2026-09-15', remainingKurus: 10000, applyKurus: 0, ...over,
})

/** The database spreads the amount over the lines, oldest first; the stand-in does the same sum. */
const OPEN = [line('l1', { remainingKurus: 10000 }), line('l2', { period: '2026-10-01', dueDate: '2026-10-15', remainingKurus: 20000 }), line('l3', { typeName: 'Demirbaş', period: '2026-11-01', dueDate: '2026-11-15', remainingKurus: 30000 })]
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
  for (const fn of [...Object.values(api), ...Object.values(transfers), ...Object.values(receiptApi), ...Object.values(toast)]) fn.mockReset()
  api.fetchAdminSites.mockResolvedValue([{ id: 's1', name: 'Demo Sitesi', companyId: 'c1' }])
  transfers.fetchSiteNotices.mockResolvedValue([
    notice({ id: 'n1' }),
    notice({ id: 'n2', amountKurus: 99900, unitLabel: 'A Blok · 2', status: 'rejected', rejectReason: 'Tutar geçmedi', senderFullName: 'Ali Veli' }),
    notice({ id: 'n3', amountKurus: 50000, unitLabel: 'B Blok · 3', status: 'approved', paymentId: 'p3', paymentStatus: 'approved', receiptNo: 'MKB-2026-000042' }),
  ])
  transfers.fetchBankAccounts.mockResolvedValue([{ companyId: 'c1', bank: 'Örnek Banka', holder: 'Site Yönetimi', iban: 'TR330006100519786457841326' }])
  transfers.dekontUrl.mockResolvedValue('https://files.example/signed-dekont.jpg')
  transfers.previewAllocation.mockImplementation(fakePreview)
  transfers.approveTransferNotice.mockResolvedValue('pay1')
  transfers.rejectTransferNotice.mockResolvedValue(undefined)
  transfers.saveBankAccounts.mockResolvedValue(undefined)
})

const open = () => renderRoutes(routes, { path: '/yonetim/havale-onaylari', authState: signedInState(['admin']) })
const dataRows = async () => (await screen.findAllByRole('row')).slice(1)

describe('Havale Onayları: the queue', () => {
  it('shows the waiting notices first, with the count on the tab', async () => {
    open()
    expect(await screen.findByRole('tab', { name: 'Bekleyenler (1)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tümü (3)' })).toBeInTheDocument()
    const rows = await dataRows()
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('A Blok · 1')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Ayşe Kaya')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Slipte: AYŞE KAYA')).toBeInTheDocument()
    expect(within(rows[0]).getByText('₺250,00')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Onay bekliyor')).toBeInTheDocument()
    expect(transfers.fetchSiteNotices).toHaveBeenCalledWith('s1')
  })

  it('lists everything on the "Tümü" tab with the state of each notice', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('tab', { name: 'Tümü (3)' }))
    const rows = await screen.findAllByRole('row')
    expect(rows.slice(1).length).toBeGreaterThanOrEqual(3)
    expect(screen.getAllByText('Reddedildi').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Onaylandı').length).toBeGreaterThan(0)
  })

  it('has friendly empty and error states', async () => {
    transfers.fetchSiteNotices.mockResolvedValue([])
    open()
    expect(await screen.findByText('Bekleyen havale bildirimi yok.')).toBeInTheDocument()
  })

  it('offers "try again" when the notices cannot be loaded', async () => {
    transfers.fetchSiteNotices.mockRejectedValue(new Error('network'))
    open()
    expect(await screen.findByText(/Havale bildirimleri şu anda yüklenemedi/)).toBeInTheDocument()
  })
})

describe('Havale Onayları: review and approve', () => {
  const openFirst = async (user: ReturnType<typeof userEvent.setup>) => {
    open()
    await user.click(await screen.findByRole('button', { name: /A Blok · 1 ₺250,00 bildirimini aç/ }))
    return screen.findByRole('dialog')
  }

  it('shows the dekont next to the facts, and which lines the money would close (asked from the database)', async () => {
    const user = userEvent.setup()
    const dialog = await openFirst(user)
    expect(await within(dialog).findByAltText('Sakinin yüklediği dekont')).toHaveAttribute('src', 'https://files.example/signed-dekont.jpg')
    expect(transfers.dekontUrl).toHaveBeenCalledWith('u1/aaaa.jpg')
    expect(within(dialog).getByText('AYŞE KAYA')).toBeInTheDocument()
    expect(within(dialog).getByText(/0532 111 22 33/)).toBeInTheDocument()
    expect(within(dialog).getByText('Kasım aidatı')).toBeInTheDocument()
    const closing = await within(dialog).findByRole('list', { name: 'Kapanacak borçlar' })
    const items = within(closing).getAllByRole('listitem')
    // 250 TL over lines of 100 + 200 + 300: 100 closes line 1, 150 goes to line 2 (partly paid), line 3 is untouched
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Aidat · Eylül 2026')
    expect(items[0]).toHaveTextContent('₺100,00')
    expect(items[1]).toHaveTextContent('Aidat · Ekim 2026')
    expect(items[1]).toHaveTextContent('₺150,00')
    expect(items[1]).toHaveTextContent('kısmi: ₺50,00 kalır')
    expect(transfers.previewAllocation).toHaveBeenCalledWith({ unitId: 'u1', payerId: 'p1', amountKurus: 25000, chargeIds: null })
  })

  it('approves "oldest first" and reloads the lists', async () => {
    const user = userEvent.setup()
    const dialog = await openFirst(user)
    await within(dialog).findByRole('list', { name: 'Kapanacak borçlar' })
    await user.click(within(dialog).getByRole('button', { name: 'Onayla ve makbuz oluştur' }))
    await waitFor(() => expect(transfers.approveTransferNotice).toHaveBeenCalledWith('n1', null))
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Havale onaylandı/))
    await waitFor(() => expect(transfers.fetchSiteNotices.mock.calls.length).toBeGreaterThan(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('lets the admin pick the lines, and sends exactly those', async () => {
    const user = userEvent.setup()
    const dialog = await openFirst(user)
    await within(dialog).findByRole('list', { name: 'Kapanacak borçlar' })
    await user.click(within(dialog).getByRole('radio', { name: /Borçları ben seçeyim/ }))
    // nothing is picked yet: nothing can be approved
    expect(within(dialog).getByText('Kapatmak istediğiniz borçları işaretleyin.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Onayla ve makbuz oluştur' })).toBeDisabled()
    await user.click(within(dialog).getByRole('checkbox', { name: /Demirbaş · Kasım 2026/ }))
    // 250 TL cannot fit on one 300 TL line? it can: 250 of 300 (partly paid)
    await waitFor(() => expect(transfers.previewAllocation).toHaveBeenLastCalledWith({ unitId: 'u1', payerId: 'p1', amountKurus: 25000, chargeIds: ['l3'] }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Onayla ve makbuz oluştur' })).toBeEnabled())
    await user.click(within(dialog).getByRole('button', { name: 'Onayla ve makbuz oluştur' }))
    await waitFor(() => expect(transfers.approveTransferNotice).toHaveBeenCalledWith('n1', ['l3']))
  })

  it('cannot approve while the amount is bigger than the open debt, and says by how much', async () => {
    const user = userEvent.setup()
    transfers.fetchSiteNotices.mockResolvedValue([notice({ id: 'n1', amountKurus: 70000 })]) // 700 TL, only 600 TL is open
    open()
    await user.click(await screen.findByRole('button', { name: /bildirimini aç/ }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(/₺100,00 fazla/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Fazla ödeme \(alacak\) henüz desteklenmiyor/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Onayla ve makbuz oluştur' })).toBeDisabled()
    // the admin can still reject it with a reason
    expect(within(dialog).getByRole('button', { name: 'Reddet' })).toBeEnabled()
  })

  it('says so when the payer has no open line at all', async () => {
    const user = userEvent.setup()
    transfers.previewAllocation.mockResolvedValue({ lines: [], excessKurus: 0 })
    open()
    await user.click(await screen.findByRole('button', { name: /bildirimini aç/ }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('Bu kişi için kapatılabilecek açık borç yok.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Onayla ve makbuz oluştur' })).toBeDisabled()
  })

  it('shows the database answer when approving fails, and keeps the dialog open', async () => {
    const user = userEvent.setup()
    transfers.approveTransferNotice.mockRejectedValue({ message: 'not_pending' })
    const dialog = await openFirst(user)
    await within(dialog).findByRole('list', { name: 'Kapanacak borçlar' })
    await user.click(within(dialog).getByRole('button', { name: 'Onayla ve makbuz oluştur' }))
    expect(await within(dialog).findByText(/artık beklemiyor/)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('opens a PDF dekont in a new tab (no inline image)', async () => {
    const user = userEvent.setup()
    transfers.fetchSiteNotices.mockResolvedValue([notice({ id: 'n1', filePath: 'u1/bbbb.pdf' })])
    transfers.dekontUrl.mockResolvedValue('https://files.example/signed.pdf')
    open()
    await user.click(await screen.findByRole('button', { name: /bildirimini aç/ }))
    const dialog = await screen.findByRole('dialog')
    const link = await within(dialog).findByRole('link', { name: /PDF dekontu yeni sekmede aç/ })
    expect(link).toHaveAttribute('href', 'https://files.example/signed.pdf')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(within(dialog).queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows an error with "try again" when the dekont cannot be opened', async () => {
    const user = userEvent.setup()
    transfers.dekontUrl.mockRejectedValue(new Error('denied'))
    const dialog = await openFirst(user)
    expect(await within(dialog).findByText(/Dekont şu anda açılamadı/)).toBeInTheDocument()
  })
})

describe('Havale Onayları: reject', () => {
  it('needs a written reason, then sends it', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: /bildirimini aç/ }))
    const review = await screen.findByRole('dialog')
    await user.click(within(review).getByRole('button', { name: 'Reddet' }))
    const dialogs = await screen.findAllByRole('dialog')
    const reason = dialogs[dialogs.length - 1]
    expect(within(reason).getByRole('textbox', { name: /Red nedeni/ })).toBeInTheDocument()
    await user.type(within(reason).getByRole('textbox', { name: /Red nedeni/ }), 'ab')
    await user.click(within(reason).getByRole('button', { name: 'Reddet' }))
    expect(await within(reason).findByText(/en az 3 karakter/)).toBeInTheDocument()
    expect(transfers.rejectTransferNotice).not.toHaveBeenCalled()
    await user.type(within(reason).getByRole('textbox', { name: /Red nedeni/ }), 'c')
    await user.click(within(reason).getByRole('button', { name: 'Reddet' }))
    await waitFor(() => expect(transfers.rejectTransferNotice).toHaveBeenCalledWith('n1', 'abc'))
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Bildirim reddedildi/))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('a notice that was already reviewed shows no approve or reject buttons, only the facts', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('tab', { name: 'Tümü (3)' }))
    await user.click(await screen.findByRole('button', { name: /A Blok · 2 ₺999,00 bildirimini aç/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Tutar geçmedi')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Reddet' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Onayla ve makbuz oluştur' })).not.toBeInTheDocument()
    expect(transfers.previewAllocation).not.toHaveBeenCalled()
  })

  it('an approved notice shows its receipt number and the receipt button', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('tab', { name: 'Tümü (3)' }))
    await user.click(await screen.findByRole('button', { name: /B Blok · 3 ₺500,00 bildirimini aç/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('MKB-2026-000042')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Makbuz/ })).toBeInTheDocument()
  })
})

describe('Havale Onayları: bank accounts', () => {
  it('lists the accounts of the company of this site', async () => {
    transfers.fetchBankAccounts.mockResolvedValue([
      { companyId: 'c1', bank: 'Örnek Banka', holder: 'Site Yönetimi', iban: 'TR330006100519786457841326' },
      { companyId: 'c2', bank: 'Başka Firma Bankası', holder: 'Başka', iban: 'TR820006200000012345678901' },
    ])
    open()
    expect(await screen.findByText('Örnek Banka')).toBeInTheDocument()
    expect(screen.getByText('TR33 0006 1005 1978 6457 8413 26')).toBeInTheDocument()
    expect(screen.queryByText('Başka Firma Bankası')).not.toBeInTheDocument()
  })

  it('says so when there is no account yet', async () => {
    transfers.fetchBankAccounts.mockResolvedValue([])
    open()
    expect(await screen.findByText(/Henüz banka hesabı eklenmemiş/)).toBeInTheDocument()
  })

  it('refuses a wrong IBAN, then saves a good one for the company of the site', async () => {
    const user = userEvent.setup()
    transfers.fetchBankAccounts.mockResolvedValue([])
    open()
    await user.click(await screen.findByRole('button', { name: 'Hesapları düzenle' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Hesap ekle' }))
    await user.type(within(dialog).getByLabelText(/^Banka/), 'Örnek Banka')
    await user.type(within(dialog).getByLabelText(/Hesap sahibi/), 'Site Yönetimi')
    await user.type(within(dialog).getByLabelText(/^IBAN/), 'TR34 0006 1005 1978 6457 8413 26')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    expect(await within(dialog).findByText(/IBAN geçerli değil/)).toBeInTheDocument()
    expect(transfers.saveBankAccounts).not.toHaveBeenCalled()
    await user.clear(within(dialog).getByLabelText(/^IBAN/))
    await user.type(within(dialog).getByLabelText(/^IBAN/), 'TR33 0006 1005 1978 6457 8413 26')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() =>
      expect(transfers.saveBankAccounts).toHaveBeenCalledWith('c1', [{ bank: 'Örnek Banka', holder: 'Site Yönetimi', iban: 'TR33 0006 1005 1978 6457 8413 26' }]),
    )
    expect(toast.success).toHaveBeenCalledWith('Banka hesapları kaydedildi.')
  })

  it('can remove an account, and shows the database answer when saving fails', async () => {
    const user = userEvent.setup()
    transfers.saveBankAccounts.mockRejectedValue({ message: 'iban_invalid' })
    open()
    await user.click(await screen.findByRole('button', { name: 'Hesapları düzenle' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText(/^IBAN/)).toHaveValue('TR33 0006 1005 1978 6457 8413 26')
    await user.click(within(dialog).getByRole('button', { name: /Hesabı kaldır/ }))
    expect(within(dialog).queryByLabelText(/^IBAN/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    expect(await within(dialog).findByText(/IBAN geçerli değil/)).toBeInTheDocument()
    expect(transfers.saveBankAccounts).toHaveBeenCalledWith('c1', [])
  })
})
