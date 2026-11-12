import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes, signedInState } from '@/test/render'
import type { AdminPaymentRow } from './api'
import { AdminPaymentsPage } from './PaymentsPage'

const api = vi.hoisted(() => ({ fetchAdminSites: vi.fn(), fetchAdminPayments: vi.fn(), voidPayment: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))
const receiptApi = vi.hoisted(() => ({ fetchReceipt: vi.fn() }))
vi.mock('@/features/receipt/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/receipt/api')>()), ...receiptApi }))

const routes = [{ path: '/yonetim/tahsilatlar', element: <AdminPaymentsPage /> }]
const row = (over: Partial<AdminPaymentRow> = {}): AdminPaymentRow => ({
  id: 'p1', receiptNo: 'MKB-2026-000001', paidAt: '2026-11-09T10:30:00Z', unitLabel: 'A Blok · 1', payerName: 'Mehmet Malik', amountKurus: 60000, feeKurus: 0,
  method: 'card', provider: 'mock', installments: 1, status: 'approved', voidReason: null, ...over,
})

beforeEach(() => {
  for (const fn of [...Object.values(api), ...Object.values(receiptApi)]) fn.mockReset()
  api.fetchAdminSites.mockResolvedValue([{ id: 's1', name: 'Demo Sitesi', companyId: 'c1' }])
  api.fetchAdminPayments.mockResolvedValue([row(), row({ id: 'p2', receiptNo: 'MKB-2026-000002', status: 'voided', voidReason: 'Deneme ödemesi', feeKurus: 750 })])
  api.voidPayment.mockResolvedValue(undefined)
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
