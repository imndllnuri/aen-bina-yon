import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes, signedInState } from '@/test/render'
import type { NoticeRow } from '@/features/transfers/api'
import type { Balance, MyUnit } from './api'
import { TransferNoticePage } from './TransferNoticePage'

const api = vi.hoisted(() => ({ fetchMyUnits: vi.fn(), fetchMyName: vi.fn(), fetchBalance: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))
const transfers = vi.hoisted(() => ({
  fetchBankAccounts: vi.fn(),
  fetchMyNotices: vi.fn(),
  uploadDekont: vi.fn(),
  submitTransferNotice: vi.fn(),
  cancelTransferNotice: vi.fn(),
}))
vi.mock('@/features/transfers/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/transfers/api')>()), ...transfers }))
const receiptApi = vi.hoisted(() => ({ fetchReceipt: vi.fn() }))
vi.mock('@/features/receipt/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/receipt/api')>()), ...receiptApi }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const routes = [{ path: '/havale-bildirimi', element: <TransferNoticePage /> }]

const unit = (over: Partial<MyUnit> = {}): MyUnit => ({ unitId: 'u1', doorNo: '1', blockName: 'A Blok', siteName: 'Demo Sitesi', relations: ['owner'], ...over })
const balance: Balance = { lineCount: 2, chargedKurus: 200000, paidKurus: 0, balanceKurus: 200000, overdueKurus: 0, overdueCount: 0, nextDueDate: '2026-11-25' }
const notice = (over: Partial<NoticeRow> = {}): NoticeRow => ({
  id: 'n1', unitId: 'u1', amountKurus: 150000, sentOn: '2026-11-20', senderName: 'Ayşe Kaya', note: null, filePath: 'u1/x.pdf', status: 'pending',
  createdAt: '2026-11-21T08:00:00Z', reviewedAt: null, rejectReason: null, paymentId: null, paymentStatus: null, receiptNo: null, ...over,
})
const accounts = [
  { companyId: 'c1', bank: 'Örnek Banka', holder: 'Site Yönetimi', iban: 'TR330006100519786457841326' },
  { companyId: 'c1', bank: 'İkinci Banka', holder: 'Site Yönetimi', iban: 'TR820006200000012345678901' },
]

const pdfFile = (name = 'dekont.pdf') => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], name, { type: 'application/pdf' })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-23T09:00:00Z'))
  for (const fn of [...Object.values(api), ...Object.values(transfers), ...Object.values(receiptApi), ...Object.values(toast)]) fn.mockReset()
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
  api.fetchMyUnits.mockResolvedValue([unit()])
  api.fetchMyName.mockResolvedValue('Ayşe Kaya')
  api.fetchBalance.mockResolvedValue(balance)
  transfers.fetchBankAccounts.mockResolvedValue(accounts)
  transfers.fetchMyNotices.mockResolvedValue([])
  transfers.uploadDekont.mockResolvedValue(undefined)
  transfers.submitTransferNotice.mockResolvedValue('n-new')
  transfers.cancelTransferNotice.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

const open = () => renderRoutes(routes, { path: '/havale-bildirimi', authState: signedInState(['resident']) })
// Fake timers only fake Date, so user-event works normally.
const setup = () => userEvent.setup()

async function fillForm(user: ReturnType<typeof userEvent.setup>, over: { amount?: string; file?: File | null } = {}) {
  await user.type(await screen.findByLabelText(/Gönderilen tutar/), over.amount ?? '1.500,50')
  if (over.file !== null) await user.upload(screen.getByLabelText(/Dekont \(PDF/), over.file ?? pdfFile())
}

describe('Havale Bildir: the bank accounts', () => {
  it('shows the IBAN cards in groups of four, with the unit to write in the transfer description', async () => {
    open()
    const ibans = await screen.findAllByTestId('iban')
    expect(ibans.map((el) => el.textContent)).toEqual(['TR33 0006 1005 1978 6457 8413 26', 'TR82 0006 2000 0001 2345 6789 01'])
    expect(screen.getByText('Örnek Banka')).toBeInTheDocument()
    expect(screen.getAllByText('A Blok · 1').length).toBeGreaterThan(0)
  })

  it('copies the IBAN without spaces', async () => {
    const user = setup() // user-event puts its own clipboard in place; spy on that one
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    open()
    await user.click(await screen.findByRole('button', { name: 'Örnek Banka IBAN’ını kopyala' }))
    expect(writeText).toHaveBeenCalledWith('TR330006100519786457841326')
    expect(await screen.findByText('Kopyalandı')).toBeInTheDocument()
  })

  it('says so when the management has not added an account yet', async () => {
    transfers.fetchBankAccounts.mockResolvedValue([])
    open()
    expect(await screen.findByText(/henüz bir banka hesabı eklememiş/)).toBeInTheDocument()
  })

  it('tells the person what they owe, and that a bigger notice cannot be approved', async () => {
    open()
    expect(await screen.findByText(/Güncel borcunuz/)).toBeInTheDocument()
    expect(screen.getByText(/₺2\.000,00/)).toBeInTheDocument()
    expect(screen.getByText(/fazla ödeme henüz kayda alınamıyor/)).toBeInTheDocument()
  })
})

describe('Havale Bildir: the form', () => {
  it('fills the name from the profile and today as the date', async () => {
    open()
    await waitFor(() => expect(screen.getByLabelText(/Havaleyi yapanın adı/)).toHaveValue('Ayşe Kaya'))
    expect(screen.getByLabelText(/Gönderim tarihi/)).toHaveValue('2026-11-23')
  })

  it('shows friendly messages and sends nothing when the form is empty', async () => {
    const user = setup()
    open()
    await user.click(await screen.findByRole('button', { name: 'Bildirimi gönder' }))
    expect(await screen.findByText('Tutarı yazın.')).toBeInTheDocument()
    expect(screen.getByText('Dekont dosyasını seçin.')).toBeInTheDocument()
    expect(transfers.uploadDekont).not.toHaveBeenCalled()
    expect(transfers.submitTransferNotice).not.toHaveBeenCalled()
  })

  it('refuses a file that is not a PDF, JPG or PNG even if it is called dekont.pdf', async () => {
    const user = userEvent.setup({ applyAccept: false })
    open()
    const program = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03])], 'dekont.pdf', { type: 'application/pdf' })
    await user.upload(await screen.findByLabelText(/Dekont \(PDF/), program)
    expect(await screen.findByText('Yalnızca PDF, JPG veya PNG dosyası yükleyebilirsiniz.')).toBeInTheDocument()
    expect(screen.queryByText(/Seçilen dosya/)).not.toBeInTheDocument()
  })

  it('refuses a file over 5 MB', async () => {
    const user = setup()
    open()
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'buyuk.pdf', { type: 'application/pdf' })
    await user.upload(await screen.findByLabelText(/Dekont \(PDF/), big)
    expect(await screen.findByText(/5 MB’tan büyük olamaz/)).toBeInTheDocument()
  })

  it('refuses an amount below 1 TL and a date in the future', async () => {
    const user = setup()
    open()
    await fillForm(user, { amount: '0,50' })
    fireEvent.change(screen.getByLabelText(/Gönderim tarihi/), { target: { value: '2026-11-24' } })
    await user.click(screen.getByRole('button', { name: 'Bildirimi gönder' }))
    expect(await screen.findByText('En az 1 ₺ yazın.')).toBeInTheDocument()
    expect(screen.getByText('Gelecekteki bir tarih seçilemez.')).toBeInTheDocument()
    expect(transfers.submitTransferNotice).not.toHaveBeenCalled()
  })

  it('uploads the file into the folder of the unit FIRST, then makes the notice with the same path', async () => {
    const user = setup()
    open()
    await fillForm(user)
    await user.type(screen.getByLabelText(/Açıklama/), 'Kasım aidatı')
    await user.click(screen.getByRole('button', { name: 'Bildirimi gönder' }))

    await waitFor(() => expect(transfers.submitTransferNotice).toHaveBeenCalledTimes(1))
    const [path, file, mime] = transfers.uploadDekont.mock.calls[0]
    expect(path).toMatch(/^u1\/[0-9a-f-]{36}\.pdf$/)
    expect(file.name).toBe('dekont.pdf')
    expect(mime).toBe('application/pdf')
    expect(transfers.submitTransferNotice).toHaveBeenCalledWith({
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      unitId: 'u1',
      amountKurus: 150050,
      sentOn: '2026-11-23',
      senderName: 'Ayşe Kaya',
      note: 'Kasım aidatı',
      filePath: path,
    })
    expect(transfers.uploadDekont.mock.invocationCallOrder[0]).toBeLessThan(transfers.submitTransferNotice.mock.invocationCallOrder[0])
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Bildiriminiz alındı/))
    // the form is empty again and the list is loaded again
    await waitFor(() => expect(screen.getByLabelText(/Gönderilen tutar/)).toHaveValue(''))
    expect(screen.queryByText(/Seçilen dosya/)).not.toBeInTheDocument()
    expect(transfers.fetchMyNotices.mock.calls.length).toBeGreaterThan(1)
  })

  it('sends a JPG as image/jpeg with the .jpg ending', async () => {
    const user = setup()
    open()
    const jpg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])], 'foto.jpeg', { type: 'image/jpeg' })
    await fillForm(user, { file: jpg })
    await user.click(screen.getByRole('button', { name: 'Bildirimi gönder' }))
    await waitFor(() => expect(transfers.uploadDekont).toHaveBeenCalled())
    expect(transfers.uploadDekont.mock.calls[0][0]).toMatch(/^u1\/[0-9a-f-]{36}\.jpg$/)
    expect(transfers.uploadDekont.mock.calls[0][2]).toBe('image/jpeg')
  })

  it('a retry after a failure sends the SAME request id and the SAME file path (so nothing is made twice)', async () => {
    const user = setup()
    transfers.submitTransferNotice.mockRejectedValueOnce(new Error('network')).mockResolvedValue('n-new')
    open()
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Bildirimi gönder' }))
    expect(await screen.findByText(/şu anda yapılamadı/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Bildirimi gönder' }))
    await waitFor(() => expect(transfers.submitTransferNotice).toHaveBeenCalledTimes(2))
    const [first, second] = transfers.submitTransferNotice.mock.calls.map((call) => call[0])
    expect(second.requestId).toBe(first.requestId)
    expect(second.filePath).toBe(first.filePath)
  })

  it('a changed amount after a failure is a NEW request', async () => {
    const user = setup()
    transfers.submitTransferNotice.mockRejectedValueOnce(new Error('network')).mockResolvedValue('n-new')
    open()
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Bildirimi gönder' }))
    await screen.findByText(/şu anda yapılamadı/)
    await user.clear(screen.getByLabelText(/Gönderilen tutar/))
    await user.type(screen.getByLabelText(/Gönderilen tutar/), '1.600')
    await user.click(screen.getByRole('button', { name: 'Bildirimi gönder' }))
    await waitFor(() => expect(transfers.submitTransferNotice).toHaveBeenCalledTimes(2))
    const [first, second] = transfers.submitTransferNotice.mock.calls.map((call) => call[0])
    expect(second.requestId).not.toBe(first.requestId)
    expect(second.amountKurus).toBe(160000)
  })

  it.each([
    ['file_invalid', /Dekont dosyası yüklenemedi/],
    ['too_many_pending', /bekleyen 5 bildirim/],
    ['date_invalid', /Tarih geçerli değil/],
  ])('shows a Turkish sentence for the database answer %s', async (code, text) => {
    const user = setup()
    transfers.submitTransferNotice.mockRejectedValue({ message: code })
    open()
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Bildirimi gönder' }))
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('shows the storage error when the upload itself fails (and makes no notice)', async () => {
    const user = setup()
    transfers.uploadDekont.mockRejectedValue({ message: 'too big', statusCode: '413' })
    open()
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Bildirimi gönder' }))
    expect(await screen.findByText(/Dosya çok büyük/)).toBeInTheDocument()
    expect(transfers.submitTransferNotice).not.toHaveBeenCalled()
  })
})

describe('Havale Bildir: my notices', () => {
  it('shows every state: waiting, rejected with the reason, approved with the receipt, approved but cancelled later', async () => {
    transfers.fetchMyNotices.mockResolvedValue([
      notice({ id: 'n1' }),
      notice({ id: 'n2', status: 'rejected', rejectReason: 'Tutar hesabımıza geçmedi', amountKurus: 99900 }),
      notice({ id: 'n3', status: 'approved', paymentId: 'p3', paymentStatus: 'approved', receiptNo: 'MKB-2026-000010', amountKurus: 50000 }),
      notice({ id: 'n4', status: 'approved', paymentId: 'p4', paymentStatus: 'voided', receiptNo: 'MKB-2026-000011', amountKurus: 25000 }),
      notice({ id: 'n5', status: 'cancelled', amountKurus: 12300 }),
    ])
    open()
    await screen.findByText('Red nedeni: Tutar hesabımıza geçmedi')
    const items = screen.getAllByRole('listitem').filter((li) => li.textContent?.includes('Gönderen:'))
    expect(items).toHaveLength(5)
    expect(within(items[0]).getByText('Onay bekliyor')).toBeInTheDocument()
    expect(within(items[0]).getByRole('button', { name: 'Geri çek' })).toBeInTheDocument()
    expect(within(items[1]).getByText('Reddedildi')).toBeInTheDocument()
    expect(within(items[1]).getByText('Red nedeni: Tutar hesabımıza geçmedi')).toBeInTheDocument()
    expect(within(items[1]).queryByRole('button', { name: 'Geri çek' })).not.toBeInTheDocument()
    expect(within(items[2]).getByText('Onaylandı')).toBeInTheDocument()
    expect(within(items[2]).getByText('Makbuz no: MKB-2026-000010')).toBeInTheDocument()
    expect(within(items[2]).getByRole('button', { name: /Makbuz/ })).toBeInTheDocument()
    // the notice stays "approved" in the database, but the person must not read "Onaylandı" any more
    expect(within(items[3]).getByText('Ödeme iptal edildi')).toBeInTheDocument()
    expect(within(items[3]).queryByText('Onaylandı')).not.toBeInTheDocument()
    expect(within(items[3]).getByText(/yönetim tarafından iptal edildi/)).toBeInTheDocument()
    expect(within(items[4]).getByText('Geri çekildi')).toBeInTheDocument()
  })

  it('shows only the notices of the unit being looked at', async () => {
    api.fetchMyUnits.mockResolvedValue([unit(), unit({ unitId: 'u2', doorNo: '2' })])
    transfers.fetchMyNotices.mockResolvedValue([notice({ id: 'n1', amountKurus: 111100 }), notice({ id: 'n2', unitId: 'u2', amountKurus: 222200 })])
    open()
    expect(await screen.findByText('₺1.111,00')).toBeInTheDocument()
    expect(screen.queryByText('₺2.222,00')).not.toBeInTheDocument()
  })

  it('has a friendly empty state', async () => {
    open()
    expect(await screen.findByText('Henüz bir havale bildirimi göndermediniz.')).toBeInTheDocument()
  })

  it('withdraws a waiting notice after a question', async () => {
    const user = setup()
    transfers.fetchMyNotices.mockResolvedValue([notice({ id: 'n1' })])
    open()
    await user.click(await screen.findByRole('button', { name: 'Geri çek' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/₺1\.500,00 tutarındaki havale bildirimi geri çekilecek/)).toBeInTheDocument()
    expect(transfers.cancelTransferNotice).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Geri çek' }))
    await waitFor(() => expect(transfers.cancelTransferNotice).toHaveBeenCalledWith('n1'))
    expect(toast.success).toHaveBeenCalledWith('Bildirim geri çekildi.')
    await waitFor(() => expect(transfers.fetchMyNotices.mock.calls.length).toBeGreaterThan(1))
  })

  it('explains it when the notice was reviewed in the meantime', async () => {
    const user = setup()
    transfers.fetchMyNotices.mockResolvedValue([notice({ id: 'n1' })])
    transfers.cancelTransferNotice.mockRejectedValue({ message: 'not_pending' })
    open()
    await user.click(await screen.findByRole('button', { name: 'Geri çek' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Geri çek' }))
    expect(await screen.findByText(/artık beklemiyor/)).toBeInTheDocument()
  })
})
