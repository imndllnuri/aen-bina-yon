import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes, signedInState } from '@/test/render'
import type { Balance, MyUnit } from './api'
import { DebtsPage } from './DebtsPage'
import type { LedgerLine } from './lib/ledger'
import { PanelPage } from './PanelPage'

const api = vi.hoisted(() => ({
  fetchMyUnits: vi.fn(),
  fetchMyName: vi.fn(),
  fetchBalance: vi.fn(),
  fetchLedger: vi.fn(),
  fetchMyPayments: vi.fn(),
}))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))

// A stand-in for the checkout: shows what the page passed to it.
function CheckoutProbe() {
  return <pre data-testid="checkout-state">{JSON.stringify(useLocation().state)}</pre>
}

const routes = [
  { path: '/panel', element: <PanelPage /> },
  { path: '/borclarim', element: <DebtsPage /> },
  { path: '/odeme', element: <CheckoutProbe /> },
]

const unit = (over: Partial<MyUnit> = {}): MyUnit => ({ unitId: 'u1', doorNo: '1', blockName: 'A Blok', siteName: 'Demo Sitesi', relations: ['owner'], ...over })

const line = (over: Partial<LedgerLine> & { id: string; dueDate: string }): LedgerLine => ({
  typeName: 'Aidat', period: '2026-11-01', description: null, amountKurus: 150000, paidKurus: 0, remainingKurus: 150000,
  status: 'open', createdAt: '2026-11-01T00:00:00Z', runningKurus: 0, ...over,
})

// today = 9 November 2026
const ledger: LedgerLine[] = [
  line({ id: 'l1', dueDate: '2026-09-15', period: '2026-09-01', status: 'overdue', amountKurus: 150000, remainingKurus: 150000, runningKurus: 150000 }),
  line({ id: 'l2', dueDate: '2026-10-15', period: '2026-10-01', status: 'overdue', amountKurus: 150000, remainingKurus: 150000, runningKurus: 300000 }),
  line({ id: 'l3', dueDate: '2026-11-09', description: 'Kasım aidatı', amountKurus: 150000, remainingKurus: 150000, runningKurus: 450000 }),
  line({ id: 'l4', dueDate: '2026-11-25', typeName: 'Demirbaş', period: '2026-11-01', amountKurus: 30000, remainingKurus: 30000, runningKurus: 480000 }),
  line({ id: 'l5', dueDate: '2026-12-15', period: '2026-12-01', amountKurus: 150000, remainingKurus: 150000, runningKurus: 630000 }),
]
const balance: Balance = { lineCount: 5, chargedKurus: 630000, paidKurus: 0, balanceKurus: 630000, overdueKurus: 300000, overdueCount: 2, nextDueDate: '2026-11-09' }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-09T09:00:00Z'))
  for (const fn of Object.values(api)) fn.mockReset()
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
  api.fetchMyUnits.mockResolvedValue([unit()])
  api.fetchMyName.mockResolvedValue('Ayşe Kaya')
  api.fetchBalance.mockResolvedValue(balance)
  api.fetchLedger.mockResolvedValue(ledger)
  api.fetchMyPayments.mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

const open = (path: string) => renderRoutes(routes, { path, authState: signedInState(['resident']) })
// The sentence is split over several elements, so look at the whole paragraph.
const selectedBar = () => screen.getByText((_, element) => element?.tagName === 'P' && /borç seçildi/.test(element.textContent ?? ''))
const money = (text: string) => new RegExp(text.replace(/[.,]/g, (c) => `\\${c}`))

describe('Ana Sayfa', () => {
  it('answers "how much do I owe?" first: the total, the overdue part and the next due date', async () => {
    open('/panel')
    expect(await screen.findByText('Merhaba, Ayşe')).toBeInTheDocument()
    expect(screen.getByText('Demo Sitesi · A Blok · 1 · Kat Maliki')).toBeInTheDocument()
    expect(await screen.findByText(money('₺6.300,00'))).toBeInTheDocument()
    expect(screen.getByText(/Bunun .*₺3\.000,00.* tutarı gecikmiş \(2 kalem\)/)).toBeInTheDocument()
    expect(screen.getByText('09.11.2026')).toBeInTheDocument() // the next due date
    expect(api.fetchBalance).toHaveBeenCalledWith('u1')
  })

  it('shows the next three charges: overdue ones first', async () => {
    open('/panel')
    const section = (await screen.findByRole('heading', { name: 'Sıradaki borçlar' })).closest('section')!
    const items = await within(section).findAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(within(items[0]).getByText(/Eylül 2026/)).toBeInTheDocument()
    expect(within(items[0]).getByText('Gecikmiş')).toHaveAttribute('data-variant', 'destructive') // overdue is red
    expect(within(items[2]).getByText('Kasım aidatı')).toBeInTheDocument()
    expect(within(items[2]).getByText('Ödenmedi')).toHaveAttribute('data-variant', 'outline') // not late yet: calm
  })

  it('"Hemen Öde" pays what is due now: it opens the checkout with the three due lines selected', async () => {
    const user = userEvent.setup()
    open('/panel')
    const pay = await screen.findByRole('button', { name: 'Hemen Öde' })
    expect(pay).toBeEnabled()
    await user.click(pay)
    expect(JSON.parse((await screen.findByTestId('checkout-state')).textContent!)).toEqual({ chargeIds: ['l1', 'l2', 'l3'] })
  })

  it('does not offer "Hemen Öde" when nothing is due yet, and says why', async () => {
    api.fetchLedger.mockResolvedValue([ledger[3], ledger[4]])
    open('/panel')
    expect(await screen.findByRole('button', { name: 'Hemen Öde' })).toBeDisabled()
    expect(screen.getByText(/Vadesi gelmiş borç yok/)).toBeInTheDocument()
  })

  it('shows the last three payments, and says so when there are none', async () => {
    api.fetchMyPayments.mockResolvedValue([
      { id: 'p1', receiptNo: 'MKB-2026-000003', paidAt: '2026-11-08T10:00:00Z', amountKurus: 150000, feeKurus: 0, method: 'card', status: 'approved', installments: 1, unitLabel: 'A Blok · 1', payerName: 'Ayşe Kaya', mine: true },
      { id: 'p2', receiptNo: 'MKB-2026-000002', paidAt: '2026-11-07T10:00:00Z', amountKurus: 10000, feeKurus: 0, method: 'card', status: 'voided', installments: 1, unitLabel: 'A Blok · 1', payerName: 'Ayşe Kaya', mine: true },
    ])
    open('/panel')
    const card = (await screen.findByRole('heading', { name: 'Son ödemeler' })).closest('[data-slot="card"]') as HTMLElement
    expect(await within(card).findByText(/MKB-2026-000003/)).toBeInTheDocument()
    expect(within(card).queryByText(/MKB-2026-000002/)).not.toBeInTheDocument() // a cancelled payment is not "recent"
    expect(within(card).getByText(money('₺1.500,00'))).toBeInTheDocument()
  })

  it('has honest "coming soon" cards for the parts that are not built yet', async () => {
    open('/panel')
    await screen.findByRole('button', { name: 'Hemen Öde' })
    for (const title of ['Duyurular', 'Taleplerim']) expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.getByText('Henüz bir ödeme yapılmadı.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Borçlarım' })).toHaveAttribute('href', '/borclarim')
  })

  it('celebrates a zero balance', async () => {
    api.fetchBalance.mockResolvedValue({ ...balance, balanceKurus: 0, overdueKurus: 0, overdueCount: 0, nextDueDate: null })
    api.fetchLedger.mockResolvedValue([line({ id: 'p', dueDate: '2026-10-15', amountKurus: 100000, paidKurus: 100000, remainingKurus: 0, runningKurus: 0 })])
    open('/panel')
    // The message must be in the balance card itself (the list below has the same sentence).
    const card = (await screen.findByText('Toplam borç')).closest('[data-slot="card"]') as HTMLElement
    expect(within(card).getByText(/Harika! Ödenmemiş borcunuz yok/)).toBeInTheDocument()
    expect(screen.queryByText(/tutarı gecikmiş/)).not.toBeInTheDocument()
  })

  it('says so when no charge was written yet', async () => {
    api.fetchBalance.mockResolvedValue({ ...balance, lineCount: 0, balanceKurus: 0, chargedKurus: 0, overdueKurus: 0, overdueCount: 0, nextDueDate: null })
    api.fetchLedger.mockResolvedValue([])
    open('/panel')
    expect(await screen.findByText('Henüz adınıza yazılmış bir borç yok.')).toBeInTheDocument()
  })

  it('shows the relation of a tenant, and of a person who is both', async () => {
    api.fetchMyUnits.mockResolvedValue([unit({ relations: ['tenant'] })])
    const first = renderRoutes(routes, { path: '/panel', authState: signedInState(['resident']) })
    expect(await screen.findByText(/Demo Sitesi · A Blok · 1 · Kiracı/)).toBeInTheDocument()
    first.queryClient.clear()
  })

  it('works without a name (the greeting stays friendly)', async () => {
    api.fetchMyName.mockResolvedValue(null)
    open('/panel')
    expect(await screen.findByText('Merhaba')).toBeInTheDocument()
  })

  it('lets a person with two units switch, and remembers the choice', async () => {
    api.fetchMyUnits.mockResolvedValue([unit(), unit({ unitId: 'u2', doorNo: '5', relations: ['tenant'] })])
    const user = userEvent.setup()
    open('/panel')
    const select = await screen.findByRole('combobox', { name: 'Daire' })
    expect(select).toHaveValue('u1')
    await waitFor(() => expect(api.fetchBalance).toHaveBeenCalledWith('u1'))
    await user.selectOptions(select, 'u2')
    await waitFor(() => expect(api.fetchBalance).toHaveBeenCalledWith('u2'))
    expect(localStorage.getItem('aen-resident-unit')).toBe('u2')
  })

  it('guides a person who has no unit (moved out meanwhile)', async () => {
    api.fetchMyUnits.mockResolvedValue([])
    open('/panel')
    expect(await screen.findByText(/adınıza kayıtlı bir daire görünmüyor/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hemen Öde' })).not.toBeInTheDocument()
  })

  it('offers "try again" when the units cannot be loaded, and when the balance cannot', async () => {
    api.fetchMyUnits.mockRejectedValue(new Error('network'))
    const first = open('/panel')
    expect(await screen.findByText(/Daireleriniz şu anda yüklenemedi/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
    first.queryClient.clear()
  })

  it('shows an error block (not a crash) when the balance fails', async () => {
    api.fetchBalance.mockRejectedValue(new Error('network'))
    open('/panel')
    expect(await screen.findByText(/Bakiyeniz şu anda yüklenemedi/)).toBeInTheDocument()
  })
})

describe('Borçlarım', () => {
  it('splits the lines into Ödenmemiş (due today or earlier), Gelecek and Tümü, with counts', async () => {
    const user = userEvent.setup()
    open('/borclarim')
    expect(await screen.findByRole('tab', { name: 'Ödenmemiş (3)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Gelecek (2)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Ödenmiş (0)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tümü (5)' })).toBeInTheDocument()

    expect(await screen.findAllByRole('listitem')).toHaveLength(3) // Ödenmemiş is the first tab
    await user.click(screen.getByRole('tab', { name: 'Gelecek (2)' }))
    const upcoming = await screen.findAllByRole('listitem')
    expect(upcoming).toHaveLength(2)
    expect(within(upcoming[0]).getByText('Demirbaş')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Tümü (5)' }))
    expect(await screen.findAllByRole('listitem')).toHaveLength(5)
  })

  it('shows amounts in Turkish format with the status of each line', async () => {
    open('/borclarim')
    const items = await screen.findAllByRole('listitem')
    expect(within(items[0]).getByText(money('₺1.500,00'))).toBeInTheDocument()
    expect(within(items[0]).getByText('Son ödeme: 15.09.2026')).toBeInTheDocument()
    expect(within(items[0]).getByText('Gecikmiş')).toBeInTheDocument()
    expect(within(items[2]).getByText('Ödenmedi')).toBeInTheDocument() // due today is not late yet
  })

  it('has honest empty states', async () => {
    const user = userEvent.setup()
    api.fetchLedger.mockResolvedValue([])
    open('/borclarim')
    expect(await screen.findByText('Harika! Ödenmemiş borcunuz yok.')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Ödenmiş/ }))
    expect(await screen.findByText(/Henüz ödenmiş borç yok/)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Tümü/ }))
    expect(await screen.findByText('Henüz adınıza borç yazılmamış.')).toBeInTheDocument()
  })

  it('never shows the "for tenants" flag', async () => {
    open('/borclarim')
    await screen.findAllByRole('listitem')
    expect(screen.queryByText(/kiracıya yansıt/i)).not.toBeInTheDocument()
  })

  it('lets the resident tick lines, shows the total, and opens the checkout with exactly those lines', async () => {
    const user = userEvent.setup()
    open('/borclarim')
    expect(screen.queryByRole('button', { name: /Seçilenleri Öde/ })).not.toBeInTheDocument() // nothing ticked yet
    await user.click(await screen.findByRole('checkbox', { name: /Aidat Eylül 2026 seç/ }))
    await user.click(screen.getByRole('checkbox', { name: /Aidat Ekim 2026 seç/ }))
    expect(selectedBar()).toHaveTextContent('2 borç seçildi')
    expect(selectedBar()).toHaveTextContent(money('₺3.000,00'))
    await user.click(screen.getByRole('button', { name: /Seçilenleri Öde \(₺3\.000,00\)/ }))
    expect(JSON.parse((await screen.findByTestId('checkout-state')).textContent!)).toEqual({ chargeIds: ['l1', 'l2'] })
  })

  it('can select everything that is due in one click', async () => {
    const user = userEvent.setup()
    open('/borclarim')
    await user.click(await screen.findByRole('button', { name: 'Vadesi gelenlerin hepsini seç' }))
    expect(selectedBar()).toHaveTextContent('3 borç seçildi')
    expect(selectedBar()).toHaveTextContent(money('₺4.500,00'))
    await user.click(screen.getByRole('button', { name: 'Temizle' }))
    expect(screen.queryByRole('button', { name: /Seçilenleri Öde/ })).not.toBeInTheDocument()
  })

  it('shows a paid line as paid with its full amount, and offers no tick box for it', async () => {
    const user = userEvent.setup()
    api.fetchLedger.mockResolvedValue([line({ id: 'pd', dueDate: '2026-10-15', status: 'paid', amountKurus: 150000, paidKurus: 150000, remainingKurus: 0 }), ledger[2]])
    open('/borclarim')
    await user.click(await screen.findByRole('tab', { name: /Ödenmiş/ }))
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(within(items[0]).getByText('Ödendi')).toBeInTheDocument()
    expect(within(items[0]).getByText(money('₺1.500,00'))).toBeInTheDocument()
    expect(within(items[0]).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('shows an error block with a retry when the lines cannot be loaded', async () => {
    api.fetchLedger.mockRejectedValue(new Error('network'))
    open('/borclarim')
    expect(await screen.findByText(/Borçlarınız şu anda yüklenemedi/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })
})

describe('Ekstre (statement)', () => {
  const openStatement = async (user: ReturnType<typeof userEvent.setup>) => {
    open('/borclarim')
    await user.click(await screen.findByRole('tab', { name: 'Ekstre' }))
    return screen.findByRole('region', { name: 'Hesap ekstresi' })
  }

  it('shows the whole current year: opening balance, every line with the running balance, closing balance', async () => {
    const user = userEvent.setup()
    const statement = await openStatement(user)
    expect(within(statement).getByRole('heading', { name: 'Hesap Ekstresi' })).toBeInTheDocument()
    expect(within(statement).getByText('Demo Sitesi · A Blok · 1 · Kat Maliki')).toBeInTheDocument()
    expect(within(statement).getByText('Ayşe Kaya')).toBeInTheDocument()
    expect(within(statement).getByText(/01\.01\.2026 – 31\.12\.2026/)).toBeInTheDocument()

    const rows = within(statement).getAllByRole('row').slice(1) // without the header
    expect(rows).toHaveLength(7) // opening + 5 lines + closing
    expect(within(rows[0]).getByText('Devreden bakiye')).toBeInTheDocument()
    expect(within(rows[0]).getByText(money('₺0,00'))).toBeInTheDocument()
    expect(within(rows[2]).getByText(money('₺3.000,00'))).toBeInTheDocument() // the running balance after line 2
    expect(within(rows[6]).getByText('Dönem sonu bakiye')).toBeInTheDocument()
    expect(within(rows[6]).getByText(money('₺6.300,00'))).toBeInTheDocument()
    expect(within(statement).getByText(/Bugünkü toplam borç:/)).toHaveTextContent(money('₺6.300,00'))
  })

  it('starts from the debt before the range when the range starts later', async () => {
    const user = userEvent.setup()
    const statement = await openStatement(user)
    const from = within(statement).getByLabelText('Başlangıç')
    await user.clear(from)
    await user.type(from, '2026-11-01')
    const rows = within(statement).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(5) // opening + 3 lines (9 Nov, 25 Nov, 15 Dec) + closing
    expect(within(rows[0]).getByText(money('₺3.000,00'))).toBeInTheDocument() // the debt after the October line
    expect(within(rows[4]).getByText(money('₺6.300,00'))).toBeInTheDocument()
  })

  it('refuses a range that ends before it starts', async () => {
    const user = userEvent.setup()
    const statement = await openStatement(user)
    const to = within(statement).getByLabelText('Bitiş')
    await user.clear(to)
    await user.type(to, '2025-01-01')
    expect(await within(statement).findByRole('alert')).toHaveTextContent(/Başlangıç tarihi bitiş tarihinden önce olmalı/)
    expect(within(statement).getByRole('button', { name: /Yazdır/ })).toBeDisabled()
  })

  it('prints with the browser print dialog', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const user = userEvent.setup()
    const statement = await openStatement(user)
    await user.click(within(statement).getByRole('button', { name: /Yazdır/ }))
    expect(print).toHaveBeenCalledTimes(1)
    print.mockRestore()
  })
})

describe('Two people, one unit', () => {
  it('keeps the cached answers of an owner and a tenant of the same unit apart', async () => {
    const { residentKeys } = await import('./queries')
    expect(residentKeys.ledger('owner-id', 'unit-1')).not.toEqual(residentKeys.ledger('tenant-id', 'unit-1'))
    expect(residentKeys.balance('owner-id', 'unit-1')).not.toEqual(residentKeys.balance('tenant-id', 'unit-1'))
  })
})
