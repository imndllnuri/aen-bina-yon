import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestDetail, RequestListItem } from '@/features/requests/api'
import { renderRoutes, signedInState } from '@/test/render'
import type { MyUnit } from './api'
import { RequestCreatePage } from './RequestCreatePage'
import { RequestDetailPage } from './RequestDetailPage'
import { RequestsPage } from './RequestsPage'

const api = vi.hoisted(() => ({ fetchMyUnits: vi.fn(), fetchMyName: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))
const requests = vi.hoisted(() => ({
  fetchMyRequests: vi.fn(),
  fetchRequestDetail: vi.fn(),
  uploadRequestPhoto: vi.fn(),
  createRequest: vi.fn(),
  updateRequest: vi.fn(),
  cancelRequest: vi.fn(),
  addRequestComment: vi.fn(),
  rateRequest: vi.fn(),
  requestPhotoUrls: vi.fn(),
}))
vi.mock('@/features/requests/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/requests/api')>()), ...requests }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const routes = [
  { path: '/taleplerim', element: <RequestsPage /> },
  { path: '/taleplerim/yeni', element: <RequestCreatePage /> },
  { path: '/taleplerim/:id', element: <RequestDetailPage /> },
]

const unit = (over: Partial<MyUnit> = {}): MyUnit => ({ unitId: 'u1', doorNo: '1', blockName: 'A Blok', siteName: 'Demo Sitesi', relations: ['tenant'], ...over })
const item = (over: Partial<RequestListItem> = {}): RequestListItem => ({
  id: 'r1', unitId: 'u1', category: 'asansor', title: 'Asansör takılıyor', priority: 'normal', status: 'acik', rating: null,
  createdAt: '2026-11-20T08:00:00Z', updatedAt: '2026-11-20T08:00:00Z', resolvedAt: null, ...over,
})
const detail = (over: Partial<RequestDetail> = {}): RequestDetail => ({
  ...item(), siteId: 's1', requesterId: 'user-1', createdBy: 'user-1', description: 'Üç gündür takılıyor', location: 'Zemin kat', ratedAt: null, unitLabel: 'A Blok · 1',
  requesterName: null, requesterPhone: null, photos: [],
  events: [{ id: 'e1', kind: 'created', fromStatus: null, toStatus: 'acik', rating: null, actorName: null, actorId: 'user-1', createdAt: '2026-11-20T08:00:00Z' }],
  comments: [], ...over,
})

beforeEach(() => {
  for (const fn of [...Object.values(api), ...Object.values(requests), ...Object.values(toast)]) fn.mockReset()
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
  api.fetchMyUnits.mockResolvedValue([unit()])
  api.fetchMyName.mockResolvedValue('Kemal Kiracı')
  requests.fetchMyRequests.mockResolvedValue([])
  requests.requestPhotoUrls.mockResolvedValue({})
  requests.uploadRequestPhoto.mockResolvedValue(undefined)
  requests.createRequest.mockResolvedValue('r-new')
  requests.updateRequest.mockResolvedValue(undefined)
  requests.cancelRequest.mockResolvedValue(undefined)
  requests.addRequestComment.mockResolvedValue(undefined)
  requests.rateRequest.mockResolvedValue(undefined)
})

const open = (path: string) => renderRoutes(routes, { path, authState: signedInState(['resident']) })

describe('Taleplerim (the list)', () => {
  it('splits the requests into "Devam edenler" and "Tamamlananlar", each with a link to its page', async () => {
    requests.fetchMyRequests.mockResolvedValue([
      item({ id: 'r1', title: 'Asansör takılıyor', status: 'islemde' }),
      item({ id: 'r2', title: 'Merdiven kirli', status: 'cozuldu', category: 'temizlik' }),
      item({ id: 'r3', title: 'Vazgeçtim', status: 'iptal' }),
    ])
    open('/taleplerim')
    const going = await screen.findByRole('region', { name: 'Devam edenler' })
    expect(within(going).getByRole('link', { name: /Asansör takılıyor/ })).toHaveAttribute('href', '/taleplerim/r1')
    const done = screen.getByRole('region', { name: 'Tamamlananlar' })
    expect(within(done).getByText('Merdiven kirli')).toBeInTheDocument()
    expect(within(done).getByText('İptal edildi')).toBeInTheDocument()
    expect(within(going).queryByText('Merdiven kirli')).not.toBeInTheDocument()
  })

  it('shows only the requests of the unit that is selected', async () => {
    api.fetchMyUnits.mockResolvedValue([unit(), unit({ unitId: 'u2', doorNo: '2' })])
    requests.fetchMyRequests.mockResolvedValue([item({ id: 'r1', unitId: 'u1', title: 'Birinci daire' }), item({ id: 'r2', unitId: 'u2', title: 'İkinci daire' })])
    open('/taleplerim')
    expect(await screen.findByText('Birinci daire')).toBeInTheDocument()
    expect(screen.queryByText('İkinci daire')).not.toBeInTheDocument()
  })

  it('reminds the person to rate a solved request', async () => {
    requests.fetchMyRequests.mockResolvedValue([item({ status: 'cozuldu' }), item({ id: 'r2', title: 'Puanlanmış', status: 'cozuldu', rating: 5 })])
    open('/taleplerim')
    expect(await screen.findAllByText(/Değerlendirmenizi bekliyor/)).toHaveLength(1)
  })

  it('offers "Yeni talep" and says so when there is nothing yet', async () => {
    open('/taleplerim')
    expect(await screen.findByRole('link', { name: 'Yeni talep' })).toHaveAttribute('href', '/taleplerim/yeni')
    expect(await screen.findByText('Devam eden talebiniz yok.')).toBeInTheDocument()
    expect(screen.getByText('Tamamlanmış talebiniz yok.')).toBeInTheDocument()
  })

  it('shows "try again" when the list cannot be loaded', async () => {
    requests.fetchMyRequests.mockRejectedValue(new Error('boom'))
    open('/taleplerim')
    expect(await screen.findByText(/Talepleriniz şu anda yüklenemedi/)).toBeInTheDocument()
  })
})

describe('Yeni talep', () => {
  it('checks the fields before anything is sent', async () => {
    const user = userEvent.setup()
    open('/taleplerim/yeni')
    await user.click(await screen.findByRole('button', { name: 'Talebi gönder' }))
    expect(await screen.findByText('Başlık en az 3 karakter olmalı.')).toBeInTheDocument()
    expect(screen.getByText('Açıklama en az 3 karakter olmalı.')).toBeInTheDocument()
    expect(requests.createRequest).not.toHaveBeenCalled()
  })

  it('sends the request without photos, then opens its page', async () => {
    const user = userEvent.setup()
    open('/taleplerim/yeni')
    await user.selectOptions(await screen.findByLabelText(/Kategori/), 'elektrik')
    await user.selectOptions(screen.getByLabelText(/Öncelik/), 'acil')
    await user.type(screen.getByLabelText(/Başlık/), 'Lamba yanmıyor')
    await user.type(screen.getByLabelText(/Açıklama/), 'Giriş lambası')
    await user.type(screen.getByLabelText(/Konum/), 'Giriş')
    await user.click(screen.getByRole('button', { name: 'Talebi gönder' }))
    await waitFor(() => expect(requests.createRequest).toHaveBeenCalledTimes(1))
    expect(requests.createRequest.mock.calls[0]?.[0]).toMatchObject({
      unitId: 'u1', requesterId: null, category: 'elektrik', priority: 'acil', title: 'Lamba yanmıyor', description: 'Giriş lambası', location: 'Giriş', photoPaths: [],
    })
    expect(requests.uploadRequestPhoto).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
  })

  it('sends an empty place as null, and always the unit the person selected (a resident never names a requester)', async () => {
    const user = userEvent.setup()
    open('/taleplerim/yeni')
    await user.type(await screen.findByLabelText(/Başlık/), 'Başlık')
    await user.type(screen.getByLabelText(/Açıklama/), 'Metin')
    await user.click(screen.getByRole('button', { name: 'Talebi gönder' }))
    await waitFor(() => expect(requests.createRequest).toHaveBeenCalled())
    expect(requests.createRequest.mock.calls[0]?.[0]).toMatchObject({ location: null, requesterId: null, unitId: 'u1' })
  })

  it('shows the database refusal in Turkish and keeps what was typed', async () => {
    requests.createRequest.mockRejectedValue({ message: 'too_many_open' })
    const user = userEvent.setup()
    open('/taleplerim/yeni')
    await user.type(await screen.findByLabelText(/Başlık/), 'Başlık')
    await user.type(screen.getByLabelText(/Açıklama/), 'Metin')
    await user.click(screen.getByRole('button', { name: 'Talebi gönder' }))
    expect(await screen.findByText(/10 açık talep var/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Başlık/)).toHaveValue('Başlık')
  })

  it('a double click makes ONE request with ONE token', async () => {
    let release: (id: string) => void = () => {}
    requests.createRequest.mockReturnValue(new Promise<string>((resolve) => (release = resolve)))
    const user = userEvent.setup()
    open('/taleplerim/yeni')
    await user.type(await screen.findByLabelText(/Başlık/), 'Başlık')
    await user.type(screen.getByLabelText(/Açıklama/), 'Metin')
    const send = screen.getByRole('button', { name: 'Talebi gönder' })
    await user.click(send)
    await user.click(send)
    release('r-new')
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(requests.createRequest).toHaveBeenCalledTimes(1)
  })
})

describe('A request of the person', () => {
  const openDetail = async (over: Partial<RequestDetail> = {}) => {
    requests.fetchRequestDetail.mockResolvedValue(detail(over))
    open('/taleplerim/r1')
    await screen.findByRole('heading', { name: over.title ?? 'Asansör takılıyor', level: 1 })
  }

  it('asks for the resident view (no names of admins)', async () => {
    await openDetail()
    expect(requests.fetchRequestDetail).toHaveBeenCalledWith('r1', false)
  })

  it('shows the facts, the text as plain text, the steps and the history', async () => {
    await openDetail({ description: '<script>x</script> <b>kalın</b>' })
    expect(screen.getByText('Zemin kat')).toBeInTheDocument()
    expect(screen.getByText('A Blok · 1')).toBeInTheDocument()
    const text = document.querySelector('p.whitespace-pre-wrap')
    expect(text?.textContent).toBe('<script>x</script> <b>kalın</b>')
    expect(text?.querySelector('script, b')).toBeNull()
    expect(screen.getByRole('list', { name: 'Talebin aşamaları' })).toBeInTheDocument()
    expect(screen.getByText('Talep açıldı')).toBeInTheDocument()
  })

  it('offers "Düzenle" and "Talebi iptal et" only while the request is Açık', async () => {
    await openDetail({ status: 'acik' })
    expect(screen.getByRole('button', { name: 'Düzenle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Talebi iptal et' })).toBeInTheDocument()
  })

  it.each(['inceleniyor', 'islemde', 'cozuldu', 'kapandi', 'iptal'] as const)('offers neither edit nor cancel when the status is %s', async (status) => {
    await openDetail({ status })
    expect(screen.queryByRole('button', { name: 'Düzenle' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Talebi iptal et' })).not.toBeInTheDocument()
  })

  it('edits the text while Açık', async () => {
    const user = userEvent.setup()
    await openDetail()
    await user.click(screen.getByRole('button', { name: 'Düzenle' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText(/Başlık/)).toHaveValue('Asansör takılıyor')
    expect(within(dialog).queryByLabelText('Fotoğraf seç')).not.toBeInTheDocument() // photos cannot be changed
    await user.clear(within(dialog).getByLabelText(/Başlık/))
    await user.type(within(dialog).getByLabelText(/Başlık/), 'Asansör kapısı')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(requests.updateRequest).toHaveBeenCalledTimes(1))
    expect(requests.updateRequest).toHaveBeenCalledWith('r1', { category: 'asansor', title: 'Asansör kapısı', description: 'Üç gündür takılıyor', priority: 'normal', location: 'Zemin kat' })
  })

  it('explains in plain words when the admin started working before the edit was saved', async () => {
    requests.updateRequest.mockRejectedValue({ message: 'not_open' })
    const user = userEvent.setup()
    await openDetail()
    await user.click(screen.getByRole('button', { name: 'Düzenle' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kaydet' }))
    expect(await screen.findByText(/yönetim ilgilenmeye başladı/)).toBeInTheDocument()
  })

  it('asks before cancelling, then cancels and goes back to the list', async () => {
    const user = userEvent.setup()
    await openDetail()
    await user.click(screen.getByRole('button', { name: 'Talebi iptal et' }))
    expect(requests.cancelRequest).not.toHaveBeenCalled() // a question first
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Evet, iptal et' }))
    await waitFor(() => expect(requests.cancelRequest).toHaveBeenCalledWith('r1'))
    expect(await screen.findByRole('heading', { name: 'Taleplerim', level: 1 })).toBeInTheDocument()
  })

  it('shows the rating box only for a solved request that was not rated yet', async () => {
    await openDetail({ status: 'cozuldu', rating: null })
    expect(screen.getByRole('heading', { name: 'Çözümü değerlendirin' })).toBeInTheDocument()
  })

  it.each([
    ['islemde', null],
    ['acik', null],
    ['iptal', null],
    ['cozuldu', 5],
    ['kapandi', 3],
  ] as const)('shows no rating box for status %s with rating %s', async (status, rating) => {
    await openDetail({ status, rating, ratedAt: rating ? '2026-11-21T08:00:00Z' : null })
    expect(screen.queryByRole('heading', { name: 'Çözümü değerlendirin' })).not.toBeInTheDocument()
  })

  it('shows the points of a rated request', async () => {
    await openDetail({ status: 'cozuldu', rating: 4, ratedAt: '2026-11-21T08:00:00Z' })
    expect(screen.getByRole('img', { name: '4 / 5 puan' })).toBeInTheDocument()
  })

  it('lets the person comment while the request is open', async () => {
    await openDetail({ status: 'islemde' })
    expect(screen.getByLabelText('Yorum yaz')).toBeInTheDocument()
  })

  it.each([
    ['kapandi', /Bu talep kapandı/],
    ['iptal', /Bu talep iptal edildi\./],
  ] as const)('a %s request takes no new comment', async (status, text) => {
    await openDetail({ status })
    expect(screen.queryByLabelText('Yorum yaz')).not.toBeInTheDocument()
    expect(screen.getAllByText(text).length).toBeGreaterThan(0)
  })

  it('shows the thread: the answer of the management as "Yönetim", their own words as "Siz"', async () => {
    await openDetail({
      comments: [
        { id: 'c1', authorId: 'admin-1', authorName: null, byAdmin: true, isInternal: false, body: 'Teknisyen yarın gelecek.', createdAt: '2026-11-20T09:00:00Z' },
        { id: 'c2', authorId: 'user-1', authorName: null, byAdmin: false, isInternal: false, body: 'Teşekkürler.', createdAt: '2026-11-20T10:00:00Z' },
      ],
    })
    const thread = within(screen.getByRole('list', { name: 'Yorumlar' }))
    expect(thread.getByText('Yönetim')).toBeInTheDocument()
    expect(thread.getByText('Siz')).toBeInTheDocument()
  })

  it('says "not found" for a request that is not the person\'s (the answer is the same as for one that does not exist)', async () => {
    requests.fetchRequestDetail.mockResolvedValue(null)
    open('/taleplerim/zzz')
    expect(await screen.findByText(/Bu talep bulunamadı/)).toBeInTheDocument()
  })

  it('shows "try again" when the request cannot be loaded', async () => {
    requests.fetchRequestDetail.mockRejectedValue(new Error('boom'))
    open('/taleplerim/r1')
    expect(await screen.findByText(/Talep şu anda yüklenemedi/)).toBeInTheDocument()
  })

  it('shows the photos through signed links', async () => {
    requests.requestPhotoUrls.mockResolvedValue({ 'u1/a.jpg': 'https://signed.example/a', 'u1/b.jpg': 'https://signed.example/b' })
    await openDetail({ photos: [{ id: 'p1', path: 'u1/a.jpg', position: 1 }, { id: 'p2', path: 'u1/b.jpg', position: 2 }] })
    const images = await screen.findAllByAltText(/Talep fotoğrafı/)
    expect(images.map((i) => i.getAttribute('src'))).toEqual(['https://signed.example/a', 'https://signed.example/b'])
    expect(requests.requestPhotoUrls).toHaveBeenCalledWith(['u1/a.jpg', 'u1/b.jpg'])
    // each opens full size in a new tab, without handing the opener over
    const link = screen.getByRole('link', { name: 'Fotoğraf 1, tam boyutta aç' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })
})
