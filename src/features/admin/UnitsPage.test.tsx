import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes, signedInState } from '@/test/render'
import type { BlockRow, UnitRow } from './api'
import { UnitsPage } from './UnitsPage'

const api = vi.hoisted(() => ({
  fetchAdminSites: vi.fn(),
  fetchBlocks: vi.fn(),
  fetchUnits: vi.fn(),
  createBlock: vi.fn(),
  renameBlock: vi.fn(),
  deleteBlock: vi.fn(),
  createUnit: vi.fn(),
  updateUnit: vi.fn(),
  archiveUnit: vi.fn(),
  createUnitsBulk: vi.fn(),
}))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))

const routes = [{ path: '/yonetim/daireler', element: <UnitsPage /> }]

const blockA: BlockRow = { id: 'b1', name: 'A Blok' }
const blockB: BlockRow = { id: 'b2', name: 'B Blok' }
const unit = (over: Partial<UnitRow> = {}): UnitRow => ({
  id: 'u1', blockId: 'b1', doorNo: '1', floor: 1, type: 'konut', grossM2: 95, landShare: 100, status: 'occupied', residencies: [], ...over,
})
const live = { id: 'r1', relation: 'owner' as const, startDate: '2020-01-01', endDate: null, profileId: 'p1', fullName: 'Ayşe Kaya', email: 'ayse@ornek.com' }
const moved = { ...live, id: 'r2', relation: 'tenant' as const, endDate: '2021-01-01', profileId: 'p2', fullName: 'Taşınmış Kişi', email: 'eski@ornek.com' }

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.fetchAdminSites.mockResolvedValue([{ id: 's1', name: 'Demo Sitesi', companyId: 'c1' }])
  api.fetchBlocks.mockResolvedValue([blockA, blockB])
  api.fetchUnits.mockResolvedValue([
    unit({ id: 'u1', doorNo: '1', residencies: [live, moved] }),
    unit({ id: 'u2', doorNo: '2', floor: 1, status: 'vacant' }),
    unit({ id: 'u10', doorNo: '10', floor: 3 }),
  ])
  for (const fn of [api.createBlock, api.renameBlock, api.deleteBlock, api.createUnit, api.updateUnit, api.archiveUnit, api.createUnitsBulk]) {
    fn.mockResolvedValue(undefined)
  }
})

const open = () => renderRoutes(routes, { path: '/yonetim/daireler', authState: signedInState(['admin']) })

describe('Daireler page', () => {
  it('lists blocks and units in natural order, with only the CURRENT residents', async () => {
    open()
    const blockSection = await screen.findByRole('region', { name: /A Blok/ })
    expect(within(blockSection).getByText(/3 daire/)).toBeInTheDocument()

    const rows = within(blockSection).getAllByRole('row').slice(1) // without the header row
    expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['1', '2', '10']) // 2 before 10
    expect(within(rows[0]).getByText('Ayşe Kaya')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Malik')).toBeInTheDocument()
    expect(within(rows[0]).queryByText('Taşınmış Kişi')).not.toBeInTheDocument() // moved out in 2021
    expect(within(rows[1]).getByText('Boş')).toBeInTheDocument()
    expect(screen.getByText('Demo Sitesi')).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: /B Blok/ })).toHaveTextContent('Bu blokta henüz daire yok.')
  })

  it('guides a new site: no blocks yet', async () => {
    api.fetchBlocks.mockResolvedValue([])
    api.fetchUnits.mockResolvedValue([])
    open()
    expect(await screen.findByText(/Henüz blok yok/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'İlk bloğu ekle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Daire ekle/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Toplu daire oluştur/ })).toBeDisabled()
  })

  it('offers "try again" when the data cannot be loaded', async () => {
    api.fetchUnits.mockRejectedValue(new Error('network'))
    open()
    expect(await screen.findByText(/Daireler şu anda yüklenemedi/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })

  it('adds a block and reloads the lists', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByRole('region', { name: /A Blok/ })
    await user.click(screen.getByRole('button', { name: 'Blok ekle' }))
    await user.type(await screen.findByRole('textbox', { name: /Blok adı/ }), 'C Blok')
    await user.click(screen.getByRole('button', { name: 'Kaydet' }))

    await waitFor(() => expect(api.createBlock).toHaveBeenCalledWith('s1', 'C Blok'))
    await waitFor(() => expect(api.fetchBlocks).toHaveBeenCalledTimes(2)) // reloaded
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows a calm message when a block name is already used (database code 23505)', async () => {
    api.createBlock.mockRejectedValue({ code: '23505' })
    const user = userEvent.setup()
    open()
    await screen.findByRole('region', { name: /A Blok/ })
    await user.click(screen.getByRole('button', { name: 'Blok ekle' }))
    await user.type(await screen.findByRole('textbox', { name: /Blok adı/ }), 'A Blok')
    await user.click(screen.getByRole('button', { name: 'Kaydet' }))
    expect(await screen.findByText(/zaten var/)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument() // stays open so the person can fix it
  })

  it('adds a single unit to the chosen block', async () => {
    const user = userEvent.setup()
    open()
    const blockSection = await screen.findByRole('region', { name: /B Blok/ })
    await user.click(within(blockSection).getByRole('button', { name: /Daire ekle/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('combobox', { name: /Blok/ })).toHaveValue('b2') // the block we clicked in
    await user.type(within(dialog).getByRole('textbox', { name: /Kapı no/ }), '9')
    await user.type(within(dialog).getByRole('textbox', { name: 'Brüt m²' }), '95,5')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))

    await waitFor(() => expect(api.createUnit).toHaveBeenCalledTimes(1))
    expect(api.createUnit).toHaveBeenCalledWith(expect.objectContaining({ block_id: 'b2', door_no: '9', gross_m2: 95.5, floor: null, type: 'konut', status: 'occupied' }))
  })

  it('edits a unit', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByRole('region', { name: /A Blok/ })
    await user.click(screen.getByRole('button', { name: 'A Blok 2 numaralı daireyi düzenle' }))
    const dialog = await screen.findByRole('dialog')
    const door = within(dialog).getByRole('textbox', { name: /Kapı no/ })
    expect(door).toHaveValue('2')
    await user.clear(door)
    await user.type(door, '2A')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(api.updateUnit).toHaveBeenCalledWith('u2', expect.objectContaining({ door_no: '2A', block_id: 'b1', status: 'vacant' })))
  })

  it('archives an empty unit after a confirmation, but not a unit with a current resident', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByRole('region', { name: /A Blok/ })

    expect(screen.getByRole('button', { name: 'A Blok 1 numaralı daireyi arşivle' })).toBeDisabled() // Ayşe lives there

    await user.click(screen.getByRole('button', { name: 'A Blok 2 numaralı daireyi arşivle' }))
    expect(await screen.findByText('Daire arşivlensin mi?')).toBeInTheDocument()
    expect(api.archiveUnit).not.toHaveBeenCalled() // nothing before the confirmation
    await user.click(screen.getByRole('button', { name: 'Arşivle' }))
    await waitFor(() => expect(api.archiveUnit).toHaveBeenCalledWith('u2'))
  })

  it('shows the database refusal when archiving fails (for example residents were added meanwhile)', async () => {
    api.archiveUnit.mockRejectedValue({ code: '23514' })
    const user = userEvent.setup()
    open()
    await screen.findByRole('region', { name: /A Blok/ })
    await user.click(screen.getByRole('button', { name: 'A Blok 2 numaralı daireyi arşivle' }))
    await user.click(await screen.findByRole('button', { name: 'Arşivle' }))
    expect(await screen.findByText(/güncel sakinlere sahip/)).toBeInTheDocument()
  })

  it('explains that a unit with charges cannot be archived (the ledger must stay whole)', async () => {
    api.archiveUnit.mockRejectedValue({ message: 'unit has charges', code: '23514' })
    const user = userEvent.setup()
    open()
    await screen.findByRole('region', { name: /A Blok/ })
    await user.click(screen.getByRole('button', { name: 'A Blok 2 numaralı daireyi arşivle' }))
    await user.click(await screen.findByRole('button', { name: 'Arşivle' }))
    expect(await screen.findByText(/Bu dairenin borç kaydı var, arşivlenemez/)).toBeInTheDocument()
    expect(screen.queryByText(/güncel sakinlere sahip/)).not.toBeInTheDocument()
  })

  it('only lets an EMPTY block be deleted', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByRole('region', { name: /A Blok/ })
    expect(screen.getByRole('button', { name: 'A Blok bloğunu sil' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'B Blok bloğunu sil' }))
    await user.click(await screen.findByRole('button', { name: 'Sil' }))
    await waitFor(() => expect(api.deleteBlock).toHaveBeenCalledWith('b2'))
  })
})

describe('Bulk generator dialog', () => {
  const openBulk = async () => {
    const user = userEvent.setup()
    open()
    await screen.findByRole('region', { name: /A Blok/ })
    await user.click(screen.getByRole('button', { name: /Toplu daire oluştur/ }))
    return { user, dialog: await screen.findByRole('dialog') }
  }

  it('starts after the highest door number of the block and previews before creating anything', async () => {
    const { dialog } = await openBulk()
    expect(within(dialog).getByRole('textbox', { name: /İlk kapı numarası/ })).toHaveValue('11') // highest is 10
    expect(within(dialog).getByTestId('bulk-preview')).toHaveTextContent('40 daire oluşturulacak')
    expect(within(dialog).getByTestId('bulk-preview')).toHaveTextContent('11')
    expect(within(dialog).getByTestId('bulk-preview')).toHaveTextContent('50')
    expect(api.createUnitsBulk).not.toHaveBeenCalled()
  })

  it('creates all units in ONE call', async () => {
    const { user, dialog } = await openBulk()
    const floors = within(dialog).getByRole('textbox', { name: /Kat sayısı/ })
    const perFloor = within(dialog).getByRole('textbox', { name: /Katta daire sayısı/ })
    await user.clear(floors)
    await user.type(floors, '2')
    await user.clear(perFloor)
    await user.type(perFloor, '3')
    expect(within(dialog).getByTestId('bulk-preview')).toHaveTextContent('6 daire oluşturulacak')

    await user.click(within(dialog).getByRole('button', { name: '6 daireyi oluştur' }))

    await waitFor(() => expect(api.createUnitsBulk).toHaveBeenCalledTimes(1))
    const [blockId, generated, shared] = api.createUnitsBulk.mock.calls[0]
    expect(blockId).toBe('b1')
    expect(generated).toEqual([
      { door_no: '11', floor: 1 }, { door_no: '12', floor: 1 }, { door_no: '13', floor: 1 },
      { door_no: '14', floor: 2 }, { door_no: '15', floor: 2 }, { door_no: '16', floor: 2 },
    ])
    expect(shared).toEqual({ type: 'konut', gross_m2: null, land_share: null })
  })

  it('refuses door numbers that already exist in the block and creates nothing', async () => {
    const { user, dialog } = await openBulk()
    const start = within(dialog).getByRole('textbox', { name: /İlk kapı numarası/ })
    await user.clear(start)
    await user.type(start, '1')
    expect(await within(dialog).findByText(/zaten var: 1, 2, 10/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /daireyi oluştur/ })).toBeDisabled()
    expect(api.createUnitsBulk).not.toHaveBeenCalled()
  })

  it('explains an impossible request instead of creating anything', async () => {
    const { user, dialog } = await openBulk()
    const floors = within(dialog).getByRole('textbox', { name: /Kat sayısı/ })
    await user.clear(floors)
    await user.type(floors, '40') // 40 x 4 = 160 is fine, so go over the 300 limit with more per floor
    const perFloor = within(dialog).getByRole('textbox', { name: /Katta daire sayısı/ })
    await user.clear(perFloor)
    await user.type(perFloor, '10')
    expect(within(dialog).getByText(/en fazla 300 daire/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Daireleri oluştur' })).toBeDisabled()
  })
})
