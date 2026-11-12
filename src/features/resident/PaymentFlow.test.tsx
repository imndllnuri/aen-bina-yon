import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLocation } from 'react-router'
import { renderRoutes, signedInState } from '@/test/render'
import type { Receipt } from '@/features/receipt/api'
import type { PaymentRow, Quote } from './api'
import { CheckoutPage } from './CheckoutPage'
import { PaymentResultPage } from './PaymentResultPage'
import { PaymentsPage } from './PaymentsPage'
import { ThreeDSecurePage } from './ThreeDSecurePage'

const api = vi.hoisted(() => ({ quotePayment: vi.fn(), payMock: vi.fn(), fetchMyPayments: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))
const receiptApi = vi.hoisted(() => ({ fetchReceipt: vi.fn() }))
vi.mock('@/features/receipt/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/receipt/api')>()), ...receiptApi }))
const pdf = vi.hoisted(() => ({ downloadReceipt: vi.fn() }))
vi.mock('@/features/receipt/downloadReceipt', () => pdf)
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

// Stand-ins for the next page: they show where the person arrived and what was passed on.
function Probe({ name }: { name: string }) {
  const location = useLocation()
  return (
    <div>
      <p>{name}</p>
      <pre data-testid="state">{JSON.stringify(location.state)}</pre>
      <pre data-testid="search">{location.search}</pre>
    </div>
  )
}

const routes = [
  { path: '/borclarim', element: <Probe name="BORÇLARIM" /> },
  { path: '/odeme', element: <CheckoutPage /> },
  { path: '/odeme/3d', element: <ThreeDSecurePage /> },
  { path: '/odeme/sonuc', element: <PaymentResultPage /> },
  { path: '/odemelerim', element: <PaymentsPage /> },
  { path: '/odeme-probe', element: <Probe name="PROBE" /> },
]

const quote = (over: Partial<Quote> = {}): Quote => ({
  unitId: 'u1',
  lines: [
    { chargeId: 'l1', typeName: 'Aidat', description: null, period: '2026-09-01', dueDate: '2026-09-15', amountKurus: 100000 },
    { chargeId: 'l2', typeName: 'Aidat', description: 'Ekim', period: '2026-10-01', dueDate: '2026-10-15', amountKurus: 50000 },
  ],
  principalKurus: 150000, feeKurus: 0, totalKurus: 150000, ...over,
})

const receipt = (over: Partial<Receipt> = {}): Receipt => ({
  receiptNo: 'MKB-2026-000007', paidAt: '2026-11-09T10:30:00Z', status: 'approved', voidReason: null, method: 'card', provider: 'mock', installments: 1,
  amountKurus: 150000, feeKurus: 0, totalKurus: 150000, payerName: 'Ayşe Kaya', unitLabel: 'A Blok · 1', siteName: 'Demo Sitesi', companyName: 'Firma',
  lines: [], ...over,
})

const payment = (over: Partial<PaymentRow> = {}): PaymentRow => ({
  id: 'p1', receiptNo: 'MKB-2026-000007', paidAt: '2026-11-09T10:30:00Z', amountKurus: 150000, feeKurus: 0, method: 'card', status: 'approved', installments: 1,
  unitLabel: 'A Blok · 1', payerName: 'Ayşe Kaya', mine: true, ...over,
})

beforeEach(() => {
  for (const fn of [...Object.values(api), ...Object.values(receiptApi), ...Object.values(pdf), ...Object.values(toast)]) fn.mockReset()
  api.quotePayment.mockResolvedValue(quote())
  api.payMock.mockResolvedValue('pay1')
  api.fetchMyPayments.mockResolvedValue([payment()])
  receiptApi.fetchReceipt.mockResolvedValue(receipt())
  pdf.downloadReceipt.mockResolvedValue(undefined)
})

const open = (path: string, state?: unknown) => renderRoutes(routes, { path, state, authState: signedInState(['resident']) })
const money = (text: string) => new RegExp(text.replace(/[.,]/g, (c) => `\\${c}`))
const stateOf = async () => JSON.parse((await screen.findByTestId('state')).textContent!)

describe('Ödeme (checkout)', () => {
  it('asks to choose debts first when it is opened without any', async () => {
    open('/odeme')
    expect(await screen.findByText('Önce ödemek istediğiniz borçları seçin.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Borçlarıma git' })).toHaveAttribute('href', '/borclarim')
    expect(api.quotePayment).not.toHaveBeenCalled()
  })

  it('shows the summary the DATABASE computed, with the fee line and the total', async () => {
    open('/odeme', { chargeIds: ['l1', 'l2'] })
    expect(await screen.findByText(money('₺1.000,00'))).toBeInTheDocument()
    expect(api.quotePayment).toHaveBeenCalledWith(['l1', 'l2'], 1)
    expect(screen.getByText(/Komisyon \(yönetim öder\)/)).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: 'Ödeme özeti' })
    expect(within(summary).getByText('Toplam').closest('tr')).toHaveTextContent(money('₺1.500,00'))
  })

  it('is clearly a test: a banner, and a card that cannot be edited', async () => {
    open('/odeme', { chargeIds: ['l1'] })
    expect(await screen.findByRole('note')).toHaveTextContent(/TEST MODU: Gerçek kart bilgisi girmeyin/)
    for (const name of ['Kart numarası', 'Son kullanma', 'Güvenlik kodu']) expect(screen.getByLabelText(name)).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Kart numarası')).toHaveValue('4111 1111 1111 1111')
  })

  it('asks for a new quote when the installments change, and shows the fee', async () => {
    api.quotePayment.mockImplementation(async (_ids: string[], n: number) => (n === 3 ? quote({ feeKurus: 3750, totalKurus: 153750 }) : quote()))
    const user = userEvent.setup()
    open('/odeme', { chargeIds: ['l1', 'l2'] })
    await screen.findByText(/Komisyon/)
    await user.click(screen.getByRole('radio', { name: '3 Taksit' }))
    await waitFor(() => expect(api.quotePayment).toHaveBeenCalledWith(['l1', 'l2'], 3))
    const summary = screen.getByRole('region', { name: 'Ödeme özeti' })
    await waitFor(() => expect(within(summary).getByText('Toplam').closest('tr')).toHaveTextContent(money('₺1.537,50')))
    expect(within(summary).getByText('Komisyon').closest('tr')).toHaveTextContent(money('₺37,50'))
  })

  it('needs the agreement before going on, then hands the quoted total to the next step', async () => {
    const user = userEvent.setup()
    open('/odeme', { chargeIds: ['l1', 'l2'] })
    // Wait until the quote is loaded, so "disabled" really means "the agreement is missing".
    const summary = await screen.findByRole('region', { name: 'Ödeme özeti' })
    await within(summary).findByText(money('₺1.000,00'))
    const go = screen.getByRole('button', { name: /Ödemeye geç \(₺1\.500,00\)/ })
    expect(go).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /taslak/ }))
    expect(go).toBeEnabled()
    await user.click(go)
    expect(await screen.findByRole('heading', { name: '3D Secure' })).toBeInTheDocument()
    expect(screen.getByText(money('₺1.500,00'))).toBeInTheDocument() // the quoted total travels on
  })

  it('shows the database reason in Turkish when a line cannot be paid any more', async () => {
    api.quotePayment.mockRejectedValue({ message: 'charge_not_payable', code: 'P0001' })
    open('/odeme', { chargeIds: ['l1'] })
    expect(await screen.findByText(/artık ödenemiyor/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ödemeye geç/ })).toBeDisabled()
  })
})

describe('3D Secure (fake bank screen)', () => {
  const state = { chargeIds: ['l1', 'l2'], installments: 1, expectedTotalKurus: 150000, requestId: 'req-1' }

  it('explains itself and says what happens after a refresh', async () => {
    open('/odeme/3d')
    expect(await screen.findByText(/Ödeme bilgisi bulunamadı/)).toBeInTheDocument()
    expect(api.payMock).not.toHaveBeenCalled()
  })

  it('"Onayla" asks the database to pay exactly what was quoted, then shows the result', async () => {
    const user = userEvent.setup()
    open('/odeme/3d', state)
    expect(await screen.findByText(money('₺1.500,00'))).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/TEST MODU/)
    await user.click(screen.getByRole('button', { name: 'Onayla' }))
    await waitFor(() => expect(api.payMock).toHaveBeenCalledWith({ requestId: 'req-1', chargeIds: ['l1', 'l2'], installments: 1, expectedTotalKurus: 150000 }))
    expect(await screen.findByText('Ödeme Başarılı')).toBeInTheDocument()
  })

  it('a double click pays once (the button waits for the answer)', async () => {
    let finish!: (id: string) => void
    api.payMock.mockReturnValue(new Promise<string>((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    open('/odeme/3d', state)
    const approve = await screen.findByRole('button', { name: 'Onayla' })
    await user.dblClick(approve)
    expect(api.payMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Başarısız Simüle Et' })).toBeDisabled()
    finish('pay1')
    expect(await screen.findByText('Ödeme Başarılı')).toBeInTheDocument()
  })

  it('shows why a payment was refused and lets the person try again', async () => {
    api.payMock.mockRejectedValueOnce({ message: 'quote_outdated', code: 'P0001' }).mockResolvedValue('pay1')
    const user = userEvent.setup()
    open('/odeme/3d', state)
    await user.click(await screen.findByRole('button', { name: 'Onayla' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Tutar bu arada değişti/)
    expect(screen.getByRole('button', { name: 'Onayla' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Onayla' }))
    await waitFor(() => expect(api.payMock).toHaveBeenCalledTimes(2))
    expect(api.payMock.mock.calls[1][0].requestId).toBe('req-1') // the same request: a retry cannot pay twice
  })

  it('"Başarısız Simüle Et" writes nothing and shows the failure page', async () => {
    const user = userEvent.setup()
    open('/odeme/3d', state)
    await user.click(await screen.findByRole('button', { name: 'Başarısız Simüle Et' }))
    expect(await screen.findByText('Ödeme Başarısız')).toBeInTheDocument()
    expect(api.payMock).not.toHaveBeenCalled()
  })
})

describe('Ödeme sonucu', () => {
  it('shows the receipt number and total from the database, and downloads the PDF', async () => {
    const user = userEvent.setup()
    open('/odeme/sonuc?id=pay1')
    expect(await screen.findByText('MKB-2026-000007')).toBeInTheDocument()
    expect(receiptApi.fetchReceipt).toHaveBeenCalledWith('pay1')
    expect(screen.getByText(money('₺1.500,00'))).toBeInTheDocument()
    expect(screen.getByText(/Bu bir deneme ödemesidir/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Makbuzu İndir (PDF)' }))
    await waitFor(() => expect(pdf.downloadReceipt).toHaveBeenCalledWith(expect.objectContaining({ receiptNo: 'MKB-2026-000007' })))
  })

  it('after a failure: no money was taken, charges stay unpaid, and "Tekrar dene" keeps the chosen lines', async () => {
    const user = userEvent.setup()
    const routesWithProbe = [...routes.slice(0, 1), { path: '/odeme', element: <Probe name="CHECKOUT" /> }, routes[3]]
    renderRoutes(routesWithProbe, { path: '/odeme/sonuc?durum=basarisiz', state: { chargeIds: ['l1', 'l2'] }, authState: signedInState(['resident']) })
    expect(await screen.findByText(/Hesabınızdan hiçbir tutar çekilmedi/)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Tekrar dene' }))
    expect(await stateOf()).toEqual({ chargeIds: ['l1', 'l2'] })
  })

  it('says the payment is recorded when only the receipt cannot be loaded', async () => {
    receiptApi.fetchReceipt.mockRejectedValue(new Error('network'))
    open('/odeme/sonuc?id=pay1')
    expect(await screen.findByText(/Ödemeniz kaydedildi/)).toBeInTheDocument()
  })

  it('copes with no id at all', async () => {
    open('/odeme/sonuc')
    expect(await screen.findByText('Gösterilecek bir ödeme bulunamadı.')).toBeInTheDocument()
  })
})

describe('Ödemelerim', () => {
  it('lists payments with the total (amount + fee), the receipt number and a PDF button', async () => {
    api.fetchMyPayments.mockResolvedValue([payment({ feeKurus: 750, amountKurus: 30000 }), payment({ id: 'p2', receiptNo: 'MKB-2026-000008', mine: false, payerName: 'Kemal Kiracı' }), payment({ id: 'p3', receiptNo: 'MKB-2026-000009', status: 'voided' })])
    const user = userEvent.setup()
    open('/odemelerim')
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(within(items[0]).getByText(money('₺307,50'))).toBeInTheDocument()
    expect(within(items[0]).getByText('Onaylandı')).toBeInTheDocument()
    expect(within(items[1]).getByText(/Ödeyen: Kemal Kiracı/)).toBeInTheDocument() // an owner sees the tenant's payment
    expect(within(items[0]).queryByText(/Ödeyen:/)).not.toBeInTheDocument() // their own payment needs no name
    expect(within(items[2]).getByText('İptal edildi')).toBeInTheDocument()
    await user.click(within(items[0]).getByRole('button', { name: 'Makbuz (PDF)' }))
    await waitFor(() => expect(receiptApi.fetchReceipt).toHaveBeenCalledWith('p1'))
    await waitFor(() => expect(pdf.downloadReceipt).toHaveBeenCalledTimes(1))
  })

  it('has a friendly empty state and an error state', async () => {
    api.fetchMyPayments.mockResolvedValue([])
    const first = open('/odemelerim')
    expect(await screen.findByText(/Henüz bir ödeme yapılmadı/)).toBeInTheDocument()
    first.queryClient.clear()
  })

  it('offers "try again" when the payments cannot be loaded', async () => {
    api.fetchMyPayments.mockRejectedValue(new Error('network'))
    open('/odemelerim')
    expect(await screen.findByText(/Ödemeleriniz şu anda yüklenemedi/)).toBeInTheDocument()
  })

  it('tells the person when the PDF cannot be made', async () => {
    pdf.downloadReceipt.mockRejectedValue(new Error('font'))
    const user = userEvent.setup()
    open('/odemelerim')
    await user.click(await screen.findByRole('button', { name: 'Makbuz (PDF)' }))
    await waitFor(() => expect(pdf.downloadReceipt).toHaveBeenCalled())
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Makbuz şu anda hazırlanamadı')))
    // the button works again (not stuck on "busy")
    await waitFor(() => expect(screen.getByRole('button', { name: 'Makbuz (PDF)' })).toBeEnabled())
  })
})
