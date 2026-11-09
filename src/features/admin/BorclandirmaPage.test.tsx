import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes, signedInState } from '@/test/render'
import type { BatchRow, BlockRow, ChargeRow, ChargeTypeRow, PlanRow, PreviewLine, UnitRow } from './api'
import { BorclandirmaPage } from './BorclandirmaPage'

const api = vi.hoisted(() => ({
  fetchAdminSites: vi.fn(),
  fetchBlocks: vi.fn(),
  fetchUnits: vi.fn(),
  fetchChargeTypes: vi.fn(),
  fetchCharges: vi.fn(),
  fetchBatches: vi.fn(),
  fetchPlans: vi.fn(),
  previewCharge: vi.fn(),
  createChargeBatch: vi.fn(),
  updateCharge: vi.fn(),
  voidCharge: vi.fn(),
  voidChargeBatch: vi.fn(),
  deleteChargeBatch: vi.fn(),
  savePlan: vi.fn(),
  setPlanActive: vi.fn(),
  generatePlan: vi.fn(),
}))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))

const routes = [{ path: '/yonetim/borclandirma', element: <BorclandirmaPage /> }]

const blockA: BlockRow = { id: 'b1', name: 'A Blok' }
const blockB: BlockRow = { id: 'b2', name: 'B Blok' }
const unit = (over: Partial<UnitRow>): UnitRow => ({
  id: 'u1', blockId: 'b1', doorNo: '1', floor: 1, type: 'konut', grossM2: 95, landShare: 100, status: 'occupied', residencies: [], ...over,
})
const units = [unit({ id: 'u1', doorNo: '1' }), unit({ id: 'u2', doorNo: '2' }), unit({ id: 'u9', blockId: 'b2', doorNo: '9' })]
const aidat: ChargeTypeRow = { id: 't1', code: 'aidat', name: 'Aidat', tenantVisibleDefault: true, defaultSplit: 'per_unit' }
const demirbas: ChargeTypeRow = { id: 't2', code: 'demirbas', name: 'Demirbaş', tenantVisibleDefault: false, defaultSplit: 'land_share' }

const charge = (over: Partial<ChargeRow>): ChargeRow => ({
  id: 'c1', unitId: 'u1', blockId: 'b1', blockName: 'A Blok', doorNo: '1', typeId: 't1', typeName: 'Aidat', batchId: 'bt1',
  period: '2026-11-01', description: null, amountKurus: 150000, dueDate: '2026-11-30', tenantVisible: true,
  createdAt: '2026-11-08T10:00:00Z', voidedAt: null, voidReason: null, ...over,
})
const lines: PreviewLine[] = [
  { unitId: 'u1', blockName: 'A Blok', doorNo: '1', weight: null, amountKurus: 150000 },
  { unitId: 'u2', blockName: 'A Blok', doorNo: '2', weight: null, amountKurus: 150000 },
  { unitId: 'u9', blockName: 'B Blok', doorNo: '9', weight: null, amountKurus: 150000 },
]
const batch = (over: Partial<BatchRow>): BatchRow => ({
  id: 'bt1', typeName: 'Aidat', period: '2026-11-01', dueDate: '2026-11-30', description: null, target: { scope: 'site' }, splitMethod: 'per_unit',
  amountKurus: 150000, unitCount: 3, totalKurus: 450000, createdAt: '2026-11-08T10:00:00Z', voidedAt: null, voidReason: null, planId: null,
  activeCount: 3, activeTotalKurus: 450000, ...over,
})
const plan = (over: Partial<PlanRow> = {}): PlanRow => ({
  id: 'p1', name: 'Aylık aidat', typeId: 't1', typeName: 'Aidat', amountKurus: 150000, splitMethod: 'per_unit', dayOfMonth: 5,
  target: { scope: 'site' }, tenantVisible: true, description: null, active: true, kararNo: null, kararDate: null, ...over,
})

beforeEach(() => {
  // "Now" is 9 November 2026. Only the clock is faked, so waiting and typing still work.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-09T09:00:00Z'))
  for (const fn of Object.values(api)) fn.mockReset()
  api.fetchAdminSites.mockResolvedValue([{ id: 's1', name: 'Demo Sitesi', companyId: 'c1' }])
  api.fetchBlocks.mockResolvedValue([blockA, blockB])
  api.fetchUnits.mockResolvedValue(units)
  api.fetchChargeTypes.mockResolvedValue([aidat, demirbas])
  api.fetchCharges.mockResolvedValue({
    rows: [
      charge({ id: 'c1' }),
      charge({ id: 'c2', unitId: 'u2', doorNo: '2', dueDate: '2026-11-05', description: 'Kasım aidatı' }),
      charge({ id: 'c3', unitId: 'u9', blockId: 'b2', blockName: 'B Blok', doorNo: '9', voidedAt: '2026-11-08T12:00:00Z', voidReason: 'Yanlış daire' }),
    ],
    truncated: false,
  })
  api.fetchBatches.mockResolvedValue([batch({})])
  api.fetchPlans.mockResolvedValue([plan()])
  api.previewCharge.mockResolvedValue(lines)
  api.createChargeBatch.mockResolvedValue('bt-new')
  for (const fn of [api.updateCharge, api.voidCharge, api.voidChargeBatch, api.deleteChargeBatch, api.setPlanActive]) fn.mockResolvedValue(undefined)
  api.savePlan.mockResolvedValue('p-new')
  api.generatePlan.mockResolvedValue('bt-plan')
})

afterEach(() => vi.useRealTimers())

const open = () => renderRoutes(routes, { path: '/yonetim/borclandirma', authState: signedInState(['admin']) })
const money = (text: string) => new RegExp(text.replace(/[.,]/g, (c) => `\\${c}`))

describe('Borçlar (the charge lines)', () => {
  it('shows this month, with totals of the ACTIVE lines only and a status for each line', async () => {
    open()
    expect(await screen.findByText('A Blok · 1')).toBeInTheDocument()
    expect(api.fetchCharges).toHaveBeenCalledWith('s1', { period: '2026-11-01', typeId: null, blockId: null })

    // The sentence is split over several elements, so look at the whole paragraph.
    const summary = screen.getByText((_, element) => element?.tagName === 'P' && /2 aktif kayıt/.test(element.textContent ?? ''))
    expect(summary).toHaveTextContent(money('toplam ₺3.000,00'))
    expect(summary).toHaveTextContent('1 iptal')

    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Ödenmedi')).toBeInTheDocument() // due 30 Nov
    expect(within(rows[1]).getByText('Gecikmiş')).toBeInTheDocument() // due 5 Nov, today is 9 Nov
    expect(within(rows[2]).getByText('İptal')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Neden: Yanlış daire')).toBeInTheDocument()
    // A cancelled line has no actions
    expect(within(rows[2]).queryByRole('button')).not.toBeInTheDocument()
  })

  it('asks the database for the chosen block, type and month', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByText('A Blok · 1')
    await user.selectOptions(screen.getByLabelText('Blok'), 'b1')
    await waitFor(() => expect(api.fetchCharges).toHaveBeenLastCalledWith('s1', { period: '2026-11-01', typeId: null, blockId: 'b1' }))
    await user.selectOptions(screen.getByLabelText('Borç türü'), 't2')
    await waitFor(() => expect(api.fetchCharges).toHaveBeenLastCalledWith('s1', { period: '2026-11-01', typeId: 't2', blockId: 'b1' }))
    await user.selectOptions(screen.getByLabelText('Dönem'), '')
    await waitFor(() => expect(api.fetchCharges).toHaveBeenLastCalledWith('s1', { period: null, typeId: 't2', blockId: 'b1' }))
  })

  it('filters the list by status and by search words', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByText('A Blok · 1')
    await user.selectOptions(screen.getByLabelText('Durum'), 'voided')
    expect(screen.queryByText('A Blok · 1')).not.toBeInTheDocument()
    expect(screen.getByText('B Blok · 9')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Durum'), 'all')
    await user.type(screen.getByLabelText('Ara'), 'kasım')
    expect(screen.getByText('A Blok · 2')).toBeInTheDocument()
    expect(screen.queryByText('A Blok · 1')).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText('Ara'))
    await user.type(screen.getByLabelText('Ara'), 'yakıt')
    expect(screen.getByText(/borç yok/)).toBeInTheDocument()
  })

  it('warns when the list was cut off', async () => {
    api.fetchCharges.mockResolvedValue({ rows: [charge({})], truncated: true })
    open()
    expect(await screen.findByText(/İlk 1000 kayıt gösteriliyor/)).toBeInTheDocument()
  })

  it('cancels a line only with a written reason', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByText('A Blok · 1')
    await user.click(screen.getByRole('button', { name: 'A Blok 1 için işlemler' }))
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'İptal et' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/İptal geri alınamaz/)).toBeInTheDocument()

    await user.type(within(dialog).getByRole('textbox', { name: /İptal nedeni/ }), 'ab')
    await user.click(within(dialog).getByRole('button', { name: 'Borcu iptal et' }))
    expect(await within(dialog).findByText('Nedeni en az 3 karakter olarak yazın.')).toBeInTheDocument()
    expect(api.voidCharge).not.toHaveBeenCalled()

    await user.type(within(dialog).getByRole('textbox', { name: /İptal nedeni/ }), 'c')
    await user.click(within(dialog).getByRole('button', { name: 'Borcu iptal et' }))
    await waitFor(() => expect(api.voidCharge).toHaveBeenCalledWith('c1', 'abc'))
    await waitFor(() => expect(api.fetchCharges).toHaveBeenCalledTimes(2)) // reloaded
  })

  it('edits an amount: "1.600" is sixteen hundred, and the dialog says so', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByText('A Blok · 1')
    await user.click(screen.getByRole('button', { name: 'A Blok 1 için işlemler' }))
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Düzenle' }))
    const dialog = await screen.findByRole('dialog')
    const amount = within(dialog).getByRole('textbox', { name: /Tutar/ })
    expect(amount).toHaveValue('1500,00')
    await user.clear(amount)
    await user.type(amount, '1.600')
    expect(within(dialog).getByText(money('= ₺1.600,00'))).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() =>
      expect(api.updateCharge).toHaveBeenCalledWith('c1', { amountKurus: 160000, dueDate: '2026-11-30', description: null, tenantVisible: true }),
    )
  })

  it('shows the database reason in Turkish when an edit is refused', async () => {
    api.updateCharge.mockRejectedValue({ message: 'charge_voided', code: '23514' })
    const user = userEvent.setup()
    open()
    await screen.findByText('A Blok · 1')
    await user.click(screen.getByRole('button', { name: 'A Blok 1 için işlemler' }))
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Düzenle' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    expect(await within(dialog).findByText(/İptal edilmiş bir borcun tutarı/)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('Toplu borçlandır (the wizard)', () => {
  const openWizard = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByText('A Blok · 1')
    await user.click(screen.getByRole('button', { name: /Toplu borçlandır/ }))
    return screen.findByRole('dialog')
  }

  it('walks target -> details -> preview -> confirm, and what is saved is what the preview showed', async () => {
    const user = userEvent.setup()
    open()
    const dialog = await openWizard(user)

    expect(within(dialog).getByText('Tüm site (3 daire)')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Devam' }))

    // Step 2: Aidat is pre-selected with its defaults
    expect(within(dialog).getByRole('combobox', { name: /Borç türü/ })).toHaveValue('t1')
    expect(within(dialog).getByRole('combobox', { name: /Paylaştırma yöntemi/ })).toHaveValue('per_unit')
    expect(within(dialog).getByRole('combobox', { name: /Dönem/ })).toHaveValue('2026-11-01')
    expect(within(dialog).getByLabelText(/Son ödeme tarihi/)).toHaveValue('2026-11-15')
    const amount = within(dialog).getByRole('textbox', { name: /Her dairenin tutarı/ })
    await user.type(amount, '1.500')
    // The most important check of the slice: a Turkish "1.500" is fifteen hundred lira, not 1,5.
    expect(within(dialog).getByText(money('= ₺1.500,00'))).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Önizle' }))

    await waitFor(() =>
      expect(api.previewCharge).toHaveBeenCalledWith({ siteId: 's1', target: { scope: 'site' }, split: 'per_unit', amountKurus: 150000 }),
    )

    // Step 3: lines and the total
    expect(await within(dialog).findByText('Toplam (3 daire)')).toBeInTheDocument()
    expect(within(dialog).getAllByText(money('₺1.500,00'))).toHaveLength(3)
    expect(within(dialog).getByText(money('₺4.500,00'))).toBeInTheDocument()
    expect(within(dialog).getByText('Kasım 2026')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Borçlandır' }))

    await waitFor(() => expect(api.createChargeBatch).toHaveBeenCalledTimes(1))
    expect(api.createChargeBatch).toHaveBeenCalledWith({
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      siteId: 's1',
      target: { scope: 'site' },
      split: 'per_unit',
      amountKurus: 150000,
      chargeTypeId: 't1',
      period: '2026-11-01',
      dueDate: '2026-11-15',
      description: null,
      tenantVisible: true,
      kararNo: null,
      kararDate: null,
      expectedUnits: 3,
      expectedKurus: 450000,
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(api.fetchCharges).toHaveBeenCalledTimes(2)) // the list reloads
  })

  it('refuses an unclear amount before asking the database anything', async () => {
    const user = userEvent.setup()
    open()
    const dialog = await openWizard(user)
    await user.click(within(dialog).getByRole('button', { name: 'Devam' }))
    await user.type(within(dialog).getByRole('textbox', { name: /Her dairenin tutarı/ }), '1.5')
    await user.click(within(dialog).getByRole('button', { name: 'Önizle' }))
    expect(await within(dialog).findByText(/Binler için nokta, kuruş için virgül/)).toBeInTheDocument()
    expect(api.previewCharge).not.toHaveBeenCalled()
  })

  it('follows the charge type: Demirbaş = by arsa payı, a total to share, not shown to tenants', async () => {
    const user = userEvent.setup()
    open()
    const dialog = await openWizard(user)
    await user.click(within(dialog).getByRole('button', { name: 'Devam' }))
    expect(within(dialog).getByRole('checkbox', { name: /Kiracıya yansıt/ })).toBeChecked()
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Borç türü/ }), 't2')
    expect(within(dialog).getByRole('combobox', { name: /Paylaştırma yöntemi/ })).toHaveValue('land_share')
    expect(within(dialog).getByRole('textbox', { name: /Paylaştırılacak toplam tutar/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /Kiracıya yansıt/ })).not.toBeChecked()
  })

  it('names the units that have no arsa payı and stays on the details step', async () => {
    api.previewCharge.mockRejectedValue({ message: 'missing_weight', details: 'A Blok 2, B Blok 9', code: 'P0001' })
    const user = userEvent.setup()
    open()
    const dialog = await openWizard(user)
    await user.click(within(dialog).getByRole('button', { name: 'Devam' }))
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Borç türü/ }), 't2')
    await user.type(within(dialog).getByRole('textbox', { name: /Paylaştırılacak toplam tutar/ }), '10.000')
    await user.click(within(dialog).getByRole('button', { name: 'Önizle' }))
    expect(await within(dialog).findByText(/Şu dairelerde arsa payı yazılı değil: A Blok 2, B Blok 9/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Önizle' })).toBeInTheDocument() // still on step 2
  })

  it('offers to refresh the preview when the units changed meanwhile', async () => {
    api.createChargeBatch.mockRejectedValueOnce({ message: 'preview_outdated', code: 'P0001' })
    const user = userEvent.setup()
    open()
    const dialog = await openWizard(user)
    await user.click(within(dialog).getByRole('button', { name: 'Devam' }))
    await user.type(within(dialog).getByRole('textbox', { name: /Her dairenin tutarı/ }), '1.500')
    await user.click(within(dialog).getByRole('button', { name: 'Önizle' }))
    await user.click(await within(dialog).findByRole('button', { name: 'Borçlandır' }))

    expect(await within(dialog).findByText(/Önizlemeden sonra daireler ya da değerler değişti/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Borçlandır' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Önizlemeyi yenile' }))
    await waitFor(() => expect(api.previewCharge).toHaveBeenCalledTimes(2))
    expect(await within(dialog).findByRole('button', { name: 'Borçlandır' })).toBeInTheDocument()
  })

  it('uses the SAME request id when the person retries the very same request (a lost answer cannot charge twice)', async () => {
    api.createChargeBatch.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue('bt-new')
    const user = userEvent.setup()
    open()
    const dialog = await openWizard(user)
    await user.click(within(dialog).getByRole('button', { name: 'Devam' }))
    await user.type(within(dialog).getByRole('textbox', { name: /Her dairenin tutarı/ }), '1.500')
    await user.click(within(dialog).getByRole('button', { name: 'Önizle' }))

    await user.click(await within(dialog).findByRole('button', { name: 'Borçlandır' }))
    expect(await within(dialog).findByText(/İşlem şu anda yapılamadı/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Borçlandır' }))
    await waitFor(() => expect(api.createChargeBatch).toHaveBeenCalledTimes(2))
    const [first, second] = api.createChargeBatch.mock.calls.map((call) => call[0].requestId)
    expect(second).toBe(first) // a retry of the very same request
  })

  it('gives a changed request a new id', async () => {
    api.createChargeBatch.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    open()
    const dialog = await openWizard(user)
    await user.click(within(dialog).getByRole('button', { name: 'Devam' }))
    const amount = within(dialog).getByRole('textbox', { name: /Her dairenin tutarı/ })
    await user.type(amount, '1.500')
    await user.click(within(dialog).getByRole('button', { name: 'Önizle' }))
    await user.click(await within(dialog).findByRole('button', { name: 'Borçlandır' }))
    await waitFor(() => expect(api.createChargeBatch).toHaveBeenCalledTimes(1))

    await user.click(within(dialog).getByRole('button', { name: 'Geri' }))
    await user.clear(within(dialog).getByRole('textbox', { name: /Her dairenin tutarı/ }))
    await user.type(within(dialog).getByRole('textbox', { name: /Her dairenin tutarı/ }), '1.600')
    await user.click(within(dialog).getByRole('button', { name: 'Önizle' }))
    await user.click(await within(dialog).findByRole('button', { name: 'Borçlandır' }))
    await waitFor(() => expect(api.createChargeBatch).toHaveBeenCalledTimes(2))
    const [first, second] = api.createChargeBatch.mock.calls.map((call) => call[0].requestId)
    expect(second).not.toBe(first)
  })

  it('can target one block', async () => {
    const user = userEvent.setup()
    open()
    const dialog = await openWizard(user)
    await user.click(within(dialog).getByRole('radio', { name: 'Bir blok' }))
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Blok' }), 'b2')
    expect(within(dialog).getByText('1 daire seçildi.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Devam' }))
    await user.type(within(dialog).getByRole('textbox', { name: /Her dairenin tutarı/ }), '100')
    await user.click(within(dialog).getByRole('button', { name: 'Önizle' }))
    await waitFor(() => expect(api.previewCharge).toHaveBeenCalledWith(expect.objectContaining({ target: { scope: 'block', block_id: 'b2' }, amountKurus: 10000 })))
  })

  it('can target hand-picked units, and cannot continue with none', async () => {
    const user = userEvent.setup()
    open()
    const dialog = await openWizard(user)
    await user.click(within(dialog).getByRole('radio', { name: 'Seçtiğim daireler' }))
    expect(within(dialog).getByText('Henüz daire seçilmedi.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Devam' })).toBeDisabled()
    await user.click(within(dialog).getByRole('checkbox', { name: 'A Blok 2' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'B Blok 9' }))
    expect(within(dialog).getByText('2 daire seçildi.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Devam' }))
    await user.type(within(dialog).getByRole('textbox', { name: /Her dairenin tutarı/ }), '100')
    await user.click(within(dialog).getByRole('button', { name: 'Önizle' }))
    await waitFor(() => expect(api.previewCharge).toHaveBeenCalledWith(expect.objectContaining({ target: { scope: 'units', unit_ids: ['u2', 'u9'] } })))
  })

  it('shows arsa payı in the preview when the split uses it', async () => {
    api.previewCharge.mockResolvedValue([
      { unitId: 'u1', blockName: 'A Blok', doorNo: '1', weight: 100, amountKurus: 55310 },
      { unitId: 'u2', blockName: 'A Blok', doorNo: '2', weight: 126, amountKurus: 69690 },
    ])
    const user = userEvent.setup()
    open()
    const dialog = await openWizard(user)
    await user.click(within(dialog).getByRole('button', { name: 'Devam' }))
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Borç türü/ }), 't2')
    await user.type(within(dialog).getByRole('textbox', { name: /Paylaştırılacak toplam tutar/ }), '1.250')
    await user.click(within(dialog).getByRole('button', { name: 'Önizle' }))
    expect(await within(dialog).findByRole('columnheader', { name: 'Arsa payı' })).toBeInTheDocument()
    expect(within(dialog).getByText(money('₺553,10'))).toBeInTheDocument()
    expect(within(dialog).getByText(money('₺1.250,00'))).toBeInTheDocument() // the total of the two lines
  })
})

describe('Tek borç ekle', () => {
  it('charges one unit with the amount typed, as a batch of one', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByText('A Blok · 1')
    await user.click(screen.getByRole('button', { name: /Tek borç ekle/ }))
    const dialog = await screen.findByRole('dialog')

    await user.click(within(dialog).getByRole('button', { name: 'Borç ekle' }))
    expect(await within(dialog).findByText('Daireyi seçin.')).toBeInTheDocument()
    expect(api.createChargeBatch).not.toHaveBeenCalled()

    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Daire/ }), 'u2')
    await user.type(within(dialog).getByRole('textbox', { name: /Dairenin tutarı/ }), '650,50')
    await user.type(within(dialog).getByRole('textbox', { name: /Açıklama/ }), 'Anahtar bedeli')
    await user.click(within(dialog).getByRole('button', { name: 'Borç ekle' }))

    await waitFor(() => expect(api.createChargeBatch).toHaveBeenCalledTimes(1))
    expect(api.createChargeBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        siteId: 's1',
        target: { scope: 'units', unit_ids: ['u2'] },
        split: 'per_unit',
        amountKurus: 65050,
        description: 'Anahtar bedeli',
        expectedUnits: 1,
        expectedKurus: 65050,
        period: '2026-11-01',
        dueDate: '2026-11-15',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('Toplu işlemler', () => {
  const openTab = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByText('A Blok · 1')
    await user.click(screen.getByRole('tab', { name: 'Toplu işlemler' }))
  }

  it('lists operations with what is left after cancellations, and marks the ones made by a plan', async () => {
    api.fetchBatches.mockResolvedValue([
      batch({ id: 'bt1', activeCount: 2, activeTotalKurus: 300000, planId: 'p1' }),
      batch({ id: 'bt2', typeName: 'Demirbaş', splitMethod: 'land_share', amountKurus: 1000000, unitCount: 16, totalKurus: 1000000, activeCount: 16, activeTotalKurus: 1000000, target: { scope: 'block', block_id: 'b2' } }),
    ])
    const user = userEvent.setup()
    open()
    await openTab(user)
    const rows = (await screen.findAllByRole('row')).slice(1)
    expect(within(rows[0]).getByText('2 / 3')).toBeInTheDocument()
    expect(within(rows[0]).getByText(money('ilk: ₺4.500,00'))).toBeInTheDocument()
    expect(within(rows[0]).getByText('Plandan')).toBeInTheDocument()
    expect(within(rows[0]).getByText(money('₺1.500,00 / daire'))).toBeInTheDocument()
    expect(within(rows[1]).getByText('B Blok')).toBeInTheDocument()
    expect(within(rows[1]).getByText(money('Toplam ₺10.000,00'))).toBeInTheDocument()
  })

  it('cancels a whole operation with a reason', async () => {
    const user = userEvent.setup()
    open()
    await openTab(user)
    await user.click(await screen.findByRole('button', { name: 'Aidat işlemi için işlemler' }))
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Tümünü iptal et' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: /İptal nedeni/ }), 'Yanlış dönem')
    await user.click(within(dialog).getByRole('button', { name: 'Tümünü iptal et' }))
    await waitFor(() => expect(api.voidChargeBatch).toHaveBeenCalledWith('bt1', 'Yanlış dönem'))
  })

  it('offers "delete" only inside the first 15 minutes', async () => {
    api.fetchBatches.mockResolvedValue([
      batch({ id: 'old', createdAt: '2026-11-09T08:00:00Z' }), // 60 minutes ago
      batch({ id: 'fresh', typeName: 'Yakıt', createdAt: '2026-11-09T08:50:00Z' }), // 10 minutes ago
    ])
    const user = userEvent.setup()
    open()
    await openTab(user)

    await user.click(await screen.findByRole('button', { name: 'Aidat işlemi için işlemler' }))
    const oldMenu = await screen.findByRole('menu')
    expect(within(oldMenu).queryByRole('menuitem', { name: /Sil/ })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Yakıt işlemi için işlemler' }))
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: /Sil/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Sil' }))
    await waitFor(() => expect(api.deleteChargeBatch).toHaveBeenCalledWith('fresh'))
  })

  it('tells the person why a delete was refused', async () => {
    api.fetchBatches.mockResolvedValue([batch({ createdAt: '2026-11-09T08:50:00Z' })])
    api.deleteChargeBatch.mockRejectedValue({ message: 'delete_window_closed', code: 'P0001' })
    const user = userEvent.setup()
    open()
    await openTab(user)
    await user.click(await screen.findByRole('button', { name: 'Aidat işlemi için işlemler' }))
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: /Sil/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Sil' }))
    expect(await within(dialog).findByText(/Silme süresi \(15 dakika\) doldu/)).toBeInTheDocument()
  })
})

describe('Aylık planlar', () => {
  const openTab = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByText('A Blok · 1')
    await user.click(screen.getByRole('tab', { name: 'Aylık planlar' }))
  }

  it('shows the plan and creates this month after showing exactly what will be charged', async () => {
    const user = userEvent.setup()
    open()
    await openTab(user)
    expect(await screen.findByText('Aylık aidat')).toBeInTheDocument()
    expect(screen.getByText('Her ayın 5. günü')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Aylık aidat: Kasım 2026 için borç oluştur/ }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(money('₺4.500,00'))).toBeInTheDocument()
    expect(within(dialog).getByText('3')).toBeInTheDocument() // units
    expect(within(dialog).getByText('05.11.2026')).toBeInTheDocument() // due date of November
    expect(api.previewCharge).toHaveBeenCalledWith({ siteId: 's1', target: { scope: 'site' }, split: 'per_unit', amountKurus: 150000 })
    expect(api.generatePlan).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Borçları oluştur' }))
    await waitFor(() => expect(api.generatePlan).toHaveBeenCalledWith('p1'))
  })

  it('says so when the month was already created', async () => {
    api.generatePlan.mockRejectedValue({ message: 'already_generated', code: 'P0001' })
    const user = userEvent.setup()
    open()
    await openTab(user)
    await user.click(await screen.findByRole('button', { name: /Kasım 2026 için borç oluştur/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('button', { name: 'Borçları oluştur' }))
    expect(await within(dialog).findByText(/bu ay zaten borç oluşturulmuş/)).toBeInTheDocument()
  })

  it('does not offer "Bu ayı oluştur" for a closed plan', async () => {
    api.fetchPlans.mockResolvedValue([plan({ active: false })])
    const user = userEvent.setup()
    open()
    await openTab(user)
    expect(await screen.findByRole('button', { name: /Kasım 2026 için borç oluştur/ })).toBeDisabled()
    expect(screen.getByText('Kapalı')).toBeInTheDocument()
  })

  it('makes a new plan (due on the 5th by default)', async () => {
    const user = userEvent.setup()
    open()
    await openTab(user)
    await user.click(await screen.findByRole('button', { name: /Plan ekle/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: /Plan adı/ }), 'Yeni plan')
    await user.type(within(dialog).getByRole('textbox', { name: /Her dairenin tutarı/ }), '1.750')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(api.savePlan).toHaveBeenCalledTimes(1))
    expect(api.savePlan).toHaveBeenCalledWith({
      id: null, siteId: 's1', name: 'Yeni plan', chargeTypeId: 't1', amountKurus: 175000, split: 'per_unit', dayOfMonth: 5,
      target: { scope: 'site' }, tenantVisible: true, description: null, kararNo: null, kararDate: null,
    })
  })

  it('asks for the karar number and date when the aidat rise is above the YDO', async () => {
    api.savePlan.mockRejectedValueOnce({ message: 'karar_required', details: '25.49', code: 'P0001' })
    const user = userEvent.setup()
    open()
    await openTab(user)
    await user.click(await screen.findByRole('button', { name: 'Aylık aidat için işlemler' }))
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Düzenle' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('textbox', { name: /Karar numarası/ })).not.toBeInTheDocument()
    const amount = within(dialog).getByRole('textbox', { name: /Her dairenin tutarı/ })
    expect(amount).toHaveValue('1500,00')
    await user.clear(amount)
    await user.type(amount, '3.000')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))

    expect(await within(dialog).findByText(/yıllık yeniden değerleme oranını \(%25.49\) aşıyor/)).toBeInTheDocument()
    await user.type(within(dialog).getByRole('textbox', { name: /Karar numarası/ }), '2026/7')
    await user.type(within(dialog).getByLabelText(/Karar tarihi/), '2026-11-02')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(api.savePlan).toHaveBeenCalledTimes(2))
    expect(api.savePlan).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'p1', amountKurus: 300000, kararNo: '2026/7', kararDate: '2026-11-02' }))
  })

  it('switches a plan off', async () => {
    const user = userEvent.setup()
    open()
    await openTab(user)
    await user.click(await screen.findByRole('button', { name: 'Aylık aidat için işlemler' }))
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Planı kapat' }))
    await waitFor(() => expect(api.setPlanActive).toHaveBeenCalledWith('p1', false))
  })
})

describe('Sayfa durumları', () => {
  it('guides a site without units', async () => {
    api.fetchUnits.mockResolvedValue([])
    open()
    expect(await screen.findByText(/Bu sitede henüz daire yok/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Toplu borçlandır/ })).not.toBeInTheDocument()
  })

  it('offers "try again" when something cannot be loaded', async () => {
    api.fetchChargeTypes.mockRejectedValue(new Error('network'))
    open()
    expect(await screen.findByText(/Borçlandırma sayfası şu anda yüklenemedi/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })

  it('shows an error block, not a crash, when the charge list fails', async () => {
    api.fetchCharges.mockRejectedValue(new Error('network'))
    open()
    expect(await screen.findByText(/Borçlar şu anda yüklenemedi/)).toBeInTheDocument()
  })
})
