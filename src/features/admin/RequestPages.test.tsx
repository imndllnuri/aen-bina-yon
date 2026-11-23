import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminRequestListItem, RequestDetail } from '@/features/requests/api'
import { renderRoutes, signedInState } from '@/test/render'
import { AdminRequestDetailPage } from './RequestDetailPage'
import { AdminRequestsPage } from './RequestsPage'

const api = vi.hoisted(() => ({ fetchAdminSites: vi.fn(), fetchBlocks: vi.fn(), fetchUnits: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))
const requests = vi.hoisted(() => ({
  fetchSiteRequests: vi.fn(),
  fetchRequestDetail: vi.fn(),
  uploadRequestPhoto: vi.fn(),
  createRequest: vi.fn(),
  setRequestStatus: vi.fn(),
  setRequestTriage: vi.fn(),
  addRequestComment: vi.fn(),
  requestPhotoUrls: vi.fn(),
}))
vi.mock('@/features/requests/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/requests/api')>()), ...requests }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const routes = [
  { path: '/yonetim/talepler', element: <AdminRequestsPage /> },
  { path: '/yonetim/talepler/:id', element: <AdminRequestDetailPage /> },
]

const row = (over: Partial<AdminRequestListItem> = {}): AdminRequestListItem => ({
  id: 'r1', unitId: 'u1', category: 'asansor', title: 'Asansör takılıyor', priority: 'normal', status: 'acik', rating: null,
  createdAt: '2026-11-20T08:00:00Z', updatedAt: '2026-11-20T08:00:00Z', resolvedAt: null, unitLabel: 'A Blok · 1', requesterId: 'p1', requesterName: 'Kemal Kiracı', ...over,
})
const detail = (over: Partial<RequestDetail> = {}): RequestDetail => ({
  ...row(), siteId: 's1', requesterId: 'p1', createdBy: 'p1', description: 'Üç gündür takılıyor', location: 'Zemin kat', ratedAt: null, unitLabel: 'A Blok · 1',
  requesterName: 'Kemal Kiracı', requesterPhone: '0555 111 22 33', photos: [],
  events: [{ id: 'e1', kind: 'created', fromStatus: null, toStatus: 'acik', rating: null, actorName: 'Kemal Kiracı', actorId: 'p1', createdAt: '2026-11-20T08:00:00Z' }],
  comments: [], ...over,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-23T09:00:00Z'))
  for (const fn of [...Object.values(api), ...Object.values(requests), ...Object.values(toast)]) fn.mockReset()
  api.fetchAdminSites.mockResolvedValue([{ id: 's1', name: 'Demo Sitesi', companyId: 'c1' }])
  api.fetchBlocks.mockResolvedValue([{ id: 'b1', name: 'A Blok', siteId: 's1' }])
  api.fetchUnits.mockResolvedValue([
    { id: 'u1', blockId: 'b1', doorNo: '1', floor: 1, type: 'daire', grossM2: null, landShare: null, status: 'active', residencies: [
      { id: 'x1', relation: 'owner', startDate: '2020-01-01', endDate: null, profileId: 'p-owner', fullName: 'Mehmet Malik', email: null },
      { id: 'x2', relation: 'tenant', startDate: '2025-01-01', endDate: null, profileId: 'p1', fullName: 'Kemal Kiracı', email: null },
      { id: 'x3', relation: 'tenant', startDate: '2022-01-01', endDate: '2024-12-31', profileId: 'p-old', fullName: 'Eski Kiracı', email: null },
    ] },
    { id: 'u2', blockId: 'b1', doorNo: '2', floor: 1, type: 'daire', grossM2: null, landShare: null, status: 'active', residencies: [] },
  ])
  requests.fetchSiteRequests.mockResolvedValue([])
  requests.fetchRequestDetail.mockResolvedValue(detail())
  requests.requestPhotoUrls.mockResolvedValue({})
  requests.uploadRequestPhoto.mockResolvedValue(undefined)
  requests.createRequest.mockResolvedValue('r-new')
  requests.setRequestStatus.mockResolvedValue(undefined)
  requests.setRequestTriage.mockResolvedValue(undefined)
  requests.addRequestComment.mockResolvedValue(undefined)
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
})
afterEach(() => vi.useRealTimers())

const open = (path: string) => renderRoutes(routes, { path, authState: signedInState(['admin']) })
const setup = () => userEvent.setup()

describe('Talepler (the admin list)', () => {
  const sample = () => [
    row({ id: 'r1', title: 'Normal bekleyen', priority: 'normal', createdAt: '2026-11-10T08:00:00Z' }),
    row({ id: 'r2', title: 'Acil olan', priority: 'acil', createdAt: '2026-11-22T08:00:00Z' }),
    row({ id: 'r3', title: 'İşlemdeki', status: 'islemde', priority: 'normal', createdAt: '2026-11-05T08:00:00Z' }),
    row({ id: 'r4', title: 'Çözülmüş', status: 'cozuldu', createdAt: '2026-11-01T08:00:00Z' }),
    row({ id: 'r5', title: 'Vazgeçilmiş', status: 'iptal', createdAt: '2026-11-02T08:00:00Z' }),
  ]
  const titles = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[1]?.textContent ?? '')

  it('opens on the OPEN requests: the most urgent first, then the one that waited longest', async () => {
    requests.fetchSiteRequests.mockResolvedValue(sample())
    open('/yonetim/talepler')
    await screen.findByText('Acil olan')
    expect(titles().map((t) => t.replace(/Asansör$/, ''))).toEqual(['Acil olan', 'İşlemdeki', 'Normal bekleyen'])
  })

  it('counts the open requests in the tab, and the "Tamamlanan" tab lists the solved and cancelled ones', async () => {
    const user = setup()
    requests.fetchSiteRequests.mockResolvedValue(sample())
    open('/yonetim/talepler')
    expect(await screen.findByRole('tab', { name: 'Açık ve devam eden (3)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tümü (5)' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Tamamlanan' }))
    expect(titles().map((t) => t.replace(/Asansör$/, ''))).toEqual(['Vazgeçilmiş', 'Çözülmüş']) // newest first
  })

  it('shows unit, requester, status, priority and a late badge, with a link to the request', async () => {
    requests.fetchSiteRequests.mockResolvedValue([row({ id: 'r9', priority: 'acil', createdAt: '2026-11-20T08:00:00Z' })])
    open('/yonetim/talepler')
    const line = (await screen.findByText('Asansör takılıyor')).closest('tr')!
    expect(within(line).getByText('A Blok · 1')).toBeInTheDocument()
    expect(within(line).getByText('Kemal Kiracı')).toBeInTheDocument()
    expect(within(line).getByText('Açık')).toBeInTheDocument()
    expect(within(line).getByText('Acil')).toBeInTheDocument()
    expect(within(line).getByText('2 gün gecikti')).toBeInTheDocument() // acil = 24 h, 3 days passed
    expect(within(line).getByRole('link', { name: /talebini aç/ })).toHaveAttribute('href', '/yonetim/talepler/r9')
  })

  it('filters by category and by words (title, unit or requester)', async () => {
    const user = setup()
    requests.fetchSiteRequests.mockResolvedValue([
      row({ id: 'r1', title: 'Asansör takılıyor', category: 'asansor' }),
      row({ id: 'r2', title: 'Su kaçağı', category: 'su_tesisati', unitLabel: 'B Blok · 7', requesterName: 'Zeynep Hanım' }),
    ])
    open('/yonetim/talepler')
    await screen.findByText('Su kaçağı')
    await user.selectOptions(screen.getByLabelText('Kategori'), 'su_tesisati')
    expect(screen.queryByText('Asansör takılıyor')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Kategori'), '')
    await user.type(screen.getByLabelText('Ara'), 'zeynep')
    expect(screen.queryByText('Asansör takılıyor')).not.toBeInTheDocument()
    expect(screen.getByText('Su kaçağı')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Ara'))
    await user.type(screen.getByLabelText('Ara'), 'b blok')
    expect(screen.getByText('Su kaçağı')).toBeInTheDocument()
    expect(screen.queryByText('Asansör takılıyor')).not.toBeInTheDocument()
  })

  it('shows the board: one column per step, with the requests in the right one, and no column for a cancelled request', async () => {
    const user = setup()
    requests.fetchSiteRequests.mockResolvedValue(sample())
    open('/yonetim/talepler')
    await screen.findByText('Acil olan')
    await user.click(screen.getByRole('button', { name: 'Pano' }))
    expect(screen.getByRole('button', { name: 'Pano' })).toHaveAttribute('aria-pressed', 'true')
    const acik = screen.getByRole('region', { name: 'Açık sütunu' })
    expect(within(acik).getByText('Acil olan')).toBeInTheDocument()
    expect(within(acik).getByText('Normal bekleyen')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'İşlemde sütunu' })).getByText('İşlemdeki')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Çözüldü sütunu' })).getByText('Çözülmüş')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Kapandı sütunu' })).toHaveTextContent('Talep yok.')
    expect(screen.queryByText('Vazgeçilmiş')).not.toBeInTheDocument()
    // a card opens the request
    expect(within(acik).getByRole('link', { name: /Acil olan/ })).toHaveAttribute('href', '/yonetim/talepler/r2')
  })

  it('says so when there is no request at all', async () => {
    open('/yonetim/talepler')
    expect(await screen.findByText(/Henüz talep yok/)).toBeInTheDocument()
  })

  it('says a filter matches nothing', async () => {
    const user = setup()
    requests.fetchSiteRequests.mockResolvedValue([row()])
    open('/yonetim/talepler')
    await screen.findByText('Asansör takılıyor')
    await user.type(screen.getByLabelText('Ara'), 'hiçbirşey')
    expect(await screen.findByText('Bu süzgece uyan talep yok.')).toBeInTheDocument()
  })

  it('shows "try again" when the list cannot be loaded', async () => {
    requests.fetchSiteRequests.mockRejectedValue(new Error('boom'))
    open('/yonetim/talepler')
    expect(await screen.findByText(/Talepler şu anda yüklenemedi/)).toBeInTheDocument()
  })
})

describe('Telefonla talep aç', () => {
  const openDialog = async () => {
    const user = setup()
    open('/yonetim/talepler')
    await user.click(await screen.findByRole('button', { name: 'Telefonla talep aç' }))
    return { user, dialog: await screen.findByRole('dialog') }
  }

  it('offers only the people who live in the unit TODAY (not the one who moved out)', async () => {
    const { user, dialog } = await openDialog()
    await user.selectOptions(await within(dialog).findByLabelText(/^Daire/), 'u1')
    const options = within(dialog).getByLabelText(/Arayan kişi/).querySelectorAll('option')
    expect([...options].map((o) => o.textContent)).toEqual(['Kişi seçin', 'Mehmet Malik (Kat Maliki)', 'Kemal Kiracı (Kiracı)'])
  })

  it('says so for a unit where nobody lives, and keeps the person list off', async () => {
    const { user, dialog } = await openDialog()
    await user.selectOptions(await within(dialog).findByLabelText(/^Daire/), 'u2')
    expect(within(dialog).getByText('Bu dairede şu an oturan kimse görünmüyor.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Arayan kişi/)).toBeDisabled()
  })

  it('changing the unit clears the chosen person (they may not live in the new unit)', async () => {
    const { user, dialog } = await openDialog()
    await user.selectOptions(await within(dialog).findByLabelText(/^Daire/), 'u1')
    await user.selectOptions(within(dialog).getByLabelText(/Arayan kişi/), 'p1')
    await user.selectOptions(within(dialog).getByLabelText(/^Daire/), 'u2')
    expect(within(dialog).getByLabelText(/Arayan kişi/)).toHaveValue('')
  })

  it('opens the request for the chosen person (the admin is not the requester) and goes to its page', async () => {
    const { user, dialog } = await openDialog()
    await user.selectOptions(await within(dialog).findByLabelText(/^Daire/), 'u1')
    await user.selectOptions(within(dialog).getByLabelText(/Arayan kişi/), 'p1')
    await user.selectOptions(within(dialog).getByLabelText(/Kategori/), 'su_tesisati')
    await user.type(within(dialog).getByLabelText(/Başlık/), 'Su kaçağı')
    await user.type(within(dialog).getByLabelText(/Açıklama/), 'Tavandan damlıyor')
    await user.click(within(dialog).getByRole('button', { name: 'Talebi aç' }))
    await waitFor(() => expect(requests.createRequest).toHaveBeenCalledTimes(1))
    expect(requests.createRequest.mock.calls[0]?.[0]).toMatchObject({ unitId: 'u1', requesterId: 'p1', category: 'su_tesisati', title: 'Su kaçağı', photoPaths: [] })
    expect(await screen.findByRole('heading', { name: 'Asansör takılıyor', level: 1 })).toBeInTheDocument() // the detail route of r-new (the mock answers with the sample)
  })

  it('does not send without a unit and a person', async () => {
    const { user, dialog } = await openDialog()
    await user.type(within(dialog).getByLabelText(/Başlık/), 'Su kaçağı')
    await user.type(within(dialog).getByLabelText(/Açıklama/), 'Tavandan damlıyor')
    await user.click(within(dialog).getByRole('button', { name: 'Talebi aç' }))
    expect(await within(dialog).findByText(/Talep sahibi bu dairede oturmuyor/)).toBeInTheDocument()
    expect(requests.createRequest).not.toHaveBeenCalled()
  })
})

describe('A request for the admin', () => {
  const openDetail = async (over: Partial<RequestDetail> = {}) => {
    requests.fetchRequestDetail.mockResolvedValue(detail(over))
    open('/yonetim/talepler/r1')
    await screen.findByRole('heading', { name: over.title ?? 'Asansör takılıyor', level: 1 })
  }

  it('asks for the admin view (names)', async () => {
    await openDetail()
    expect(requests.fetchRequestDetail).toHaveBeenCalledWith('r1', true)
  })

  it('shows the person with a phone link, the unit, the place, and says when the admin opened it by phone', async () => {
    await openDetail({ createdBy: 'admin-1' })
    expect(screen.getByRole('link', { name: '0555 111 22 33' })).toHaveAttribute('href', 'tel:0555 111 22 33')
    expect(screen.getAllByText(/Kemal Kiracı/).length).toBeGreaterThan(0)
    expect(screen.getByText('Zemin kat')).toBeInTheDocument()
    expect(screen.getByText(/yönetim açtı \(telefon\)/)).toBeInTheDocument()
  })

  it('does not say "opened by phone" for a request the resident opened', async () => {
    await openDetail()
    expect(screen.queryByText(/yönetim açtı/)).not.toBeInTheDocument()
  })

  it('changes the status and tells the admin the resident is notified', async () => {
    const user = setup()
    await openDetail()
    const save = screen.getByRole('button', { name: 'Durumu kaydet' })
    expect(save).toBeDisabled() // nothing changed yet
    await user.selectOptions(screen.getByLabelText('Talebin durumu'), 'islemde')
    await user.click(save)
    await waitFor(() => expect(requests.setRequestStatus).toHaveBeenCalledWith('r1', 'islemde'))
    expect(toast.success).toHaveBeenCalledWith('Durum güncellendi. Sakine bildirim gitti.')
  })

  it('offers the five steps and never "İptal" (only the resident cancels)', async () => {
    await openDetail()
    const options = [...screen.getByLabelText('Talebin durumu').querySelectorAll('option')].map((o) => o.textContent)
    expect(options).toEqual(['Açık', 'İnceleniyor', 'İşlemde', 'Çözüldü', 'Kapandı'])
  })

  it('warns that reopening a solved request removes the rating', async () => {
    const user = setup()
    await openDetail({ status: 'cozuldu', rating: 4, ratedAt: '2026-11-21T08:00:00Z' })
    expect(screen.queryByText(/yeniden açıyorsunuz/)).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Talebin durumu'), 'inceleniyor')
    expect(screen.getByText(/Talebi yeniden açıyorsunuz: çözüm zamanı ve sakinin puanı silinir/)).toBeInTheDocument()
    // moving between two solved steps is not a reopening
    await user.selectOptions(screen.getByLabelText('Talebin durumu'), 'kapandi')
    expect(screen.queryByText(/yeniden açıyorsunuz/)).not.toBeInTheDocument()
  })

  it('shows the rating', async () => {
    await openDetail({ status: 'cozuldu', rating: 4, ratedAt: '2026-11-21T08:00:00Z' })
    expect(screen.getByRole('img', { name: '4 / 5 puan' })).toBeInTheDocument()
  })

  it('shows the refusal of the database in Turkish', async () => {
    requests.setRequestStatus.mockRejectedValue({ message: 'request_cancelled' })
    const user = setup()
    await openDetail()
    await user.selectOptions(screen.getByLabelText('Talebin durumu'), 'islemde')
    await user.click(screen.getByRole('button', { name: 'Durumu kaydet' }))
    expect(await screen.findByText(/iptal edilmiş; değiştirilemez/)).toBeInTheDocument()
  })

  it('a cancelled request has no status or sorting controls, only the explanation', async () => {
    await openDetail({ status: 'iptal' })
    expect(screen.getByText(/Sakin bu talebi iptal etti/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Durumu kaydet' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Öncelik')).not.toBeInTheDocument()
  })

  it('sorts the request (category and priority) and says the resident is not notified', async () => {
    const user = setup()
    await openDetail()
    expect(screen.getByText('Sakine bildirim gitmez.')).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Kaydet' })
    expect(save).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Öncelik'), 'acil')
    await user.selectOptions(screen.getByLabelText('Kategori', { selector: '#triage-category' }), 'elektrik')
    await user.click(save)
    await waitFor(() => expect(requests.setRequestTriage).toHaveBeenCalledWith('r1', 'elektrik', 'acil'))
  })

  it('shows the thread with names, internal notes marked, and an internal-note box', async () => {
    await openDetail({
      comments: [
        { id: 'c1', authorId: 'a1', authorName: 'Yönetici Yıldız', byAdmin: true, isInternal: true, body: 'GIZLI-NOT', createdAt: '2026-11-20T09:00:00Z' },
        { id: 'c2', authorId: 'p1', authorName: 'Kemal Kiracı', byAdmin: false, isInternal: false, body: 'Yardım edin', createdAt: '2026-11-20T10:00:00Z' },
      ],
    })
    const thread = within(screen.getByRole('list', { name: 'Yorumlar' }))
    expect(thread.getByText('GIZLI-NOT')).toBeInTheDocument()
    expect(thread.getByText(/İç not \(sakin görmez\)/)).toBeInTheDocument()
    expect(thread.getByText('Kemal Kiracı')).toBeInTheDocument()
    expect(screen.getByLabelText(/İç not: sakin görmez/)).toBeInTheDocument()
  })

  it('shows the history with the names of the people', async () => {
    await openDetail({
      events: [
        { id: 'e1', kind: 'created', fromStatus: null, toStatus: 'acik', rating: null, actorName: 'Kemal Kiracı', actorId: 'p1', createdAt: '2026-11-20T08:00:00Z' },
        { id: 'e2', kind: 'status', fromStatus: 'acik', toStatus: 'inceleniyor', rating: null, actorName: 'Yönetici Yıldız', actorId: 'a1', createdAt: '2026-11-20T09:00:00Z' },
      ],
      status: 'inceleniyor',
    })
    expect(screen.getByText(/Yönetici Yıldız/)).toBeInTheDocument()
  })

  it('says "not found" for an unknown request and "try again" for an error', async () => {
    requests.fetchRequestDetail.mockResolvedValue(null)
    open('/yonetim/talepler/zzz')
    expect(await screen.findByText(/Bu talep bulunamadı/)).toBeInTheDocument()
  })
})
