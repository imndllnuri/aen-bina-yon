import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes, signedInState } from '@/test/render'
import type { AdminAnnouncement, ReportRow } from '@/features/announcements/api'
import type { ResidentRow, UnitRow } from './api'
import { AdminAnnouncementsPage } from './AnnouncementsPage'

const adminApi = vi.hoisted(() => ({ fetchAdminSites: vi.fn(), fetchBlocks: vi.fn(), fetchUnits: vi.fn(), fetchResidents: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...adminApi }))
const api = vi.hoisted(() => ({
  listAnnouncements: vi.fn(), saveAnnouncement: vi.fn(), publishAnnouncement: vi.fn(), unpublishAnnouncement: vi.fn(), deleteAnnouncement: vi.fn(),
  resendAnnouncementUnread: vi.fn(), fetchAnnouncementTarget: vi.fn(), previewAudience: vi.fn(), fetchAnnouncementReport: vi.fn(),
}))
vi.mock('@/features/announcements/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/announcements/api')>()), ...api }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const routes = [{ path: '/yonetim/duyurular', element: <AdminAnnouncementsPage /> }]
const ann = (id: string, title: string, over: Partial<AdminAnnouncement> = {}): AdminAnnouncement => ({
  id, title, body: `${title} metni`, type: 'genel', pinned: false, status: 'draft', publishAt: null, expireAt: null, publishedAt: null, recipientCount: 0, readCount: 0,
  resendCount: 0, lastResentAt: null, createdAt: '2026-11-20T10:00:00Z', updatedAt: '2026-11-21T10:00:00Z', ...over,
})
const unit = (id: string, blockId: string, doorNo: string): UnitRow => ({ id, blockId, doorNo, floor: null, type: 'konut', grossM2: null, landShare: null, status: 'occupied', residencies: [] })
const resident = (profileId: string, fullName: string, unitId: string, doorNo: string, over: Partial<ResidentRow> = {}): ResidentRow => ({
  residencyId: `r-${profileId}`, relation: 'owner', startDate: '2025-01-01', endDate: null, unitId, doorNo, blockName: 'A Blok', profileId, fullName, email: null, phone: null, isActive: true, kvkkConsentAt: '2026-01-01T00:00:00Z', ...over,
})

const LIST = [
  ann('d1', 'Taslak duyuru'),
  ann('p1', 'Yayında duyuru', { status: 'published', publishedAt: '2026-11-20T10:00:00Z', recipientCount: 5, readCount: 3, type: 'bakim', pinned: true }),
  ann('s1', 'Planlanmış duyuru', { status: 'published', publishedAt: '2026-11-20T10:00:00Z', publishAt: '2026-12-25T09:00:00Z', recipientCount: 4, readCount: 0 }),
  ann('x1', 'Süresi dolmuş duyuru', { status: 'published', publishedAt: '2026-10-01T10:00:00Z', expireAt: '2026-11-01T10:00:00Z', recipientCount: 2, readCount: 2 }),
]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-23T09:00:00Z'))
  for (const fn of [...Object.values(adminApi), ...Object.values(api), ...Object.values(toast)]) fn.mockReset()
  adminApi.fetchAdminSites.mockResolvedValue([{ id: 's1', name: 'Demo Sitesi', companyId: 'c1' }])
  adminApi.fetchBlocks.mockResolvedValue([{ id: 'bA', name: 'A Blok' }, { id: 'bB', name: 'B Blok' }])
  adminApi.fetchUnits.mockResolvedValue([unit('u1', 'bA', '1'), unit('u2', 'bA', '2'), unit('u3', 'bB', '1')])
  adminApi.fetchResidents.mockResolvedValue([
    resident('p-owner', 'Mehmet Malik', 'u1', '1'),
    resident('p-tenant', 'Kemal Kiracı', 'u1', '1', { relation: 'tenant' }),
    resident('p-gone', 'Taşınmış Kişi', 'u1', '1', { endDate: '2025-06-01', startDate: '2024-01-01' }),
    resident('p-off', 'Pasif Kişi', 'u2', '2', { isActive: false }),
  ])
  api.listAnnouncements.mockResolvedValue(LIST)
  api.previewAudience.mockResolvedValue({ recipients: 6, units: 3 })
  api.saveAnnouncement.mockResolvedValue('new-id')
  api.publishAnnouncement.mockResolvedValue(6)
  api.unpublishAnnouncement.mockResolvedValue(undefined)
  api.deleteAnnouncement.mockResolvedValue(undefined)
  api.resendAnnouncementUnread.mockResolvedValue(2)
  api.fetchAnnouncementTarget.mockResolvedValue({ scope: 'blocks', audience: 'owners', block_ids: ['bA'] })
  api.fetchAnnouncementReport.mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())
const open = () => renderRoutes(routes, { path: '/yonetim/duyurular', authState: signedInState(['admin']) })
const rowOf = async (title: string) => (await screen.findByText(title)).closest('tr')!
const menuOf = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
  await user.click(within(await rowOf(title)).getByRole('button', { name: `“${title}” için işlemler` }))
  return screen.findByRole('menu')
}
async function compose(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Yeni duyuru' }))
  return screen.findByRole('dialog')
}

describe('Duyurular (admin): the list', () => {
  it('names the four states and shows how many read it (only for published ones)', async () => {
    open()
    expect(within(await rowOf('Taslak duyuru')).getByText('Taslak')).toBeInTheDocument()
    expect(within(await rowOf('Yayında duyuru')).getByText('Yayında')).toBeInTheDocument()
    expect(within(await rowOf('Yayında duyuru')).getByText('3 / 5')).toBeInTheDocument()
    expect(within(await rowOf('Yayında duyuru')).getByText('Bakım')).toBeInTheDocument()
    expect(within(await rowOf('Yayında duyuru')).getByLabelText('Sabit')).toBeInTheDocument()
    expect(within(await rowOf('Planlanmış duyuru')).getByText('Planlandı')).toBeInTheDocument()
    expect(within(await rowOf('Planlanmış duyuru')).getByText(/25\.12\.2026/)).toBeInTheDocument()
    expect(within(await rowOf('Süresi dolmuş duyuru')).getByText('Süresi doldu')).toBeInTheDocument()
    expect(within(await rowOf('Taslak duyuru')).getByText('—')).toBeInTheDocument()
    expect(adminApi.fetchAdminSites).toHaveBeenCalled()
    expect(api.listAnnouncements).toHaveBeenCalledWith('s1')
  })

  it('offers the right actions for a draft and for a published announcement', async () => {
    const user = userEvent.setup()
    open()
    let menu = await menuOf(user, 'Taslak duyuru')
    expect(within(menu).getByRole('menuitem', { name: 'Yayınla' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Okuma raporu' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Yayından kaldır' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    menu = await menuOf(user, 'Yayında duyuru')
    expect(within(menu).getByRole('menuitem', { name: 'Okuma raporu' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Yayından kaldır' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Yayınla' })).not.toBeInTheDocument()
  })

  it('has a friendly empty state and an error state', async () => {
    api.listAnnouncements.mockResolvedValue([])
    const first = open()
    expect(await screen.findByText(/Henüz duyuru yok/)).toBeInTheDocument()
    first.queryClient.clear()
  })
  it('offers "try again" when the list cannot be loaded', async () => {
    api.listAnnouncements.mockRejectedValue(new Error('network'))
    open()
    expect(await screen.findByText(/Duyurular şu anda yüklenemedi/)).toBeInTheDocument()
  })

  it('publishes a draft from the list after a question, and tells how many got it', async () => {
    const user = userEvent.setup()
    open()
    await user.click(within(await menuOf(user, 'Taslak duyuru')).getByRole('menuitem', { name: 'Yayınla' }))
    const dialog = await screen.findByRole('dialog')
    expect(api.publishAnnouncement).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Yayınla' }))
    await waitFor(() => expect(api.publishAnnouncement).toHaveBeenCalledWith('d1'))
    expect(toast.success).toHaveBeenCalledWith('Duyuru yayınlandı. 6 kişiye gitti.')
  })
  it('shows the database answer when publishing fails', async () => {
    const user = userEvent.setup()
    api.publishAnnouncement.mockRejectedValue({ message: 'no_recipients' })
    open()
    await user.click(within(await menuOf(user, 'Taslak duyuru')).getByRole('menuitem', { name: 'Yayınla' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Yayınla' }))
    expect(await screen.findByText('Bu seçimde alıcı yok. Seçimi değiştirin.')).toBeInTheDocument()
  })
  it('takes an announcement back after a question', async () => {
    const user = userEvent.setup()
    open()
    await user.click(within(await menuOf(user, 'Yayında duyuru')).getByRole('menuitem', { name: 'Yayından kaldır' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/okunmamış bildirimleri silinir/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Yayından kaldır' }))
    await waitFor(() => expect(api.unpublishAnnouncement).toHaveBeenCalledWith('p1'))
  })
  it('deletes an announcement after a question', async () => {
    const user = userEvent.setup()
    open()
    await user.click(within(await menuOf(user, 'Taslak duyuru')).getByRole('menuitem', { name: 'Sil' }))
    const dialog = await screen.findByRole('dialog')
    expect(api.deleteAnnouncement).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Sil' }))
    await waitFor(() => expect(api.deleteAnnouncement).toHaveBeenCalledWith('d1'))
  })
})

describe('Duyurular (admin): writing one', () => {
  it('shows what is wrong and sends nothing when the form is empty', async () => {
    const user = userEvent.setup()
    open()
    const dialog = await compose(user)
    await user.click(within(dialog).getByRole('button', { name: 'Taslak olarak kaydet' }))
    expect(await within(dialog).findByText('Başlık en az 3 karakter olmalı.')).toBeInTheDocument()
    expect(within(dialog).getByText('Metni yazın.')).toBeInTheDocument()
    expect(api.saveAnnouncement).not.toHaveBeenCalled()
  })

  it('says how many people it will reach, asked from the database for the chosen target', async () => {
    const user = userEvent.setup()
    open()
    const dialog = await compose(user)
    expect(await within(dialog).findByText(/Bu duyuru/)).toHaveTextContent('Bu duyuru 6 kişiye (3 daire) gidecek.')
    expect(api.previewAudience).toHaveBeenLastCalledWith('s1', { scope: 'site', audience: 'all' })
    await user.selectOptions(within(dialog).getByLabelText('Kimler'), 'debtors')
    await waitFor(() => expect(api.previewAudience).toHaveBeenLastCalledWith('s1', { scope: 'site', audience: 'debtors' }))
  })

  it('waits for a choice of blocks, and asks for exactly those', async () => {
    const user = userEvent.setup()
    open()
    const dialog = await compose(user)
    await user.selectOptions(within(dialog).getByLabelText('Kapsam'), 'blocks')
    expect(within(dialog).getByText('Alıcıları seçin; kaç kişiye gideceği burada görünür.')).toBeInTheDocument()
    api.previewAudience.mockResolvedValue({ recipients: 4, units: 2 })
    await user.click(within(dialog).getByRole('checkbox', { name: 'A Blok' }))
    await waitFor(() => expect(api.previewAudience).toHaveBeenLastCalledWith('s1', { scope: 'blocks', audience: 'all', block_ids: ['bA'] }))
    expect(await within(dialog).findByText(/Bu duyuru/)).toHaveTextContent('4 kişiye (2 daire)')
  })

  it('lists only the people who live there today for a named-persons target, and never narrows them', async () => {
    const user = userEvent.setup()
    open()
    const dialog = await compose(user)
    await user.selectOptions(within(dialog).getByLabelText('Kapsam'), 'persons')
    expect(within(dialog).queryByLabelText('Kimler')).not.toBeInTheDocument() // nothing to narrow
    expect(await within(dialog).findByRole('checkbox', { name: /Mehmet Malik/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /Kemal Kiracı/ })).toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: /Taşınmış Kişi/ })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: /Pasif Kişi/ })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('checkbox', { name: /Mehmet Malik/ }))
    await waitFor(() => expect(api.previewAudience).toHaveBeenLastCalledWith('s1', { scope: 'persons', audience: 'all', profile_ids: ['p-owner'] }))
  })

  it('refuses a block, unit or person choice with nothing ticked', async () => {
    const user = userEvent.setup()
    open()
    const dialog = await compose(user)
    await user.type(within(dialog).getByLabelText(/Başlık/), 'Toplantı duyurusu')
    await user.type(within(dialog).getByLabelText(/Metin/), 'Cuma 20:00')
    await user.selectOptions(within(dialog).getByLabelText('Kapsam'), 'units')
    await user.click(within(dialog).getByRole('button', { name: 'Taslak olarak kaydet' }))
    expect(await within(dialog).findByText('En az bir daire seçin.')).toBeInTheDocument()
    expect(api.saveAnnouncement).not.toHaveBeenCalled()
  })

  it('saves a draft only (no publish), with the dates read as Istanbul time', async () => {
    const user = userEvent.setup()
    open()
    const dialog = await compose(user)
    await user.type(within(dialog).getByLabelText(/Başlık/), 'Su kesintisi')
    await user.type(within(dialog).getByLabelText(/Metin/), 'Yarın 10-12 arası.')
    await user.selectOptions(within(dialog).getByLabelText(/^Tür/), 'bakim')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Listenin en üstüne sabitle' }))
    await user.type(within(dialog).getByLabelText(/Başlangıç/), '2026-11-25T08:00')
    await user.type(within(dialog).getByLabelText(/Bitiş/), '2026-11-25T18:30')
    await user.click(within(dialog).getByRole('button', { name: 'Taslak olarak kaydet' }))
    await waitFor(() => expect(api.saveAnnouncement).toHaveBeenCalledTimes(1))
    expect(api.saveAnnouncement).toHaveBeenCalledWith({
      id: null, siteId: 's1', title: 'Su kesintisi', body: 'Yarın 10-12 arası.', type: 'bakim', pinned: true, target: { scope: 'site', audience: 'all' },
      publishAt: '2026-11-25T08:00:00+03:00', expireAt: '2026-11-25T18:30:00+03:00',
    })
    expect(api.publishAnnouncement).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Taslak kaydedildi.')
  })

  it('saves and publishes in one step, and says how many got it', async () => {
    const user = userEvent.setup()
    open()
    const dialog = await compose(user)
    await user.type(within(dialog).getByLabelText(/Başlık/), 'Genel kurul')
    await user.type(within(dialog).getByLabelText(/Metin/), 'Cuma 20:00, bahçede.')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet ve yayınla' }))
    await waitFor(() => expect(api.publishAnnouncement).toHaveBeenCalledWith('new-id'))
    expect(api.saveAnnouncement.mock.invocationCallOrder[0]).toBeLessThan(api.publishAnnouncement.mock.invocationCallOrder[0])
    expect(toast.success).toHaveBeenCalledWith('Duyuru yayınlandı. 6 kişiye gitti.')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.listAnnouncements.mock.calls.length).toBeGreaterThan(1) // the list was loaded again
  })

  it('cannot publish when the target reaches nobody', async () => {
    const user = userEvent.setup()
    api.previewAudience.mockResolvedValue({ recipients: 0, units: 0 })
    open()
    const dialog = await compose(user)
    expect(await within(dialog).findByText(/Alıcı yok: yayınlanamaz/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Kaydet ve yayınla' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Taslak olarak kaydet' })).toBeEnabled()
  })

  it('shows the database answer when saving fails, and keeps what was typed', async () => {
    const user = userEvent.setup()
    api.saveAnnouncement.mockRejectedValue({ message: 'target_invalid' })
    open()
    const dialog = await compose(user)
    await user.type(within(dialog).getByLabelText(/Başlık/), 'Genel kurul')
    await user.type(within(dialog).getByLabelText(/Metin/), 'Metin')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet ve yayınla' }))
    expect(await within(dialog).findByText(/Alıcı seçimi geçerli değil/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Başlık/)).toHaveValue('Genel kurul')
    expect(api.publishAnnouncement).not.toHaveBeenCalled()
  })

  it('edits a draft: the saved target is loaded first, the same id is saved again', async () => {
    const user = userEvent.setup()
    open()
    await user.click(within(await menuOf(user, 'Taslak duyuru')).getByRole('menuitem', { name: 'Düzenle' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(api.fetchAnnouncementTarget).toHaveBeenCalledWith('d1'))
    expect(await within(dialog).findByLabelText(/Başlık/)).toHaveValue('Taslak duyuru')
    expect(within(dialog).getByLabelText('Kapsam')).toHaveValue('blocks')
    expect(within(dialog).getByLabelText('Kimler')).toHaveValue('owners')
    expect(within(dialog).getByRole('checkbox', { name: 'A Blok' })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: 'B Blok' })).not.toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: 'Taslak olarak kaydet' }))
    await waitFor(() => expect(api.saveAnnouncement).toHaveBeenCalled())
    expect(api.saveAnnouncement.mock.calls[0][0]).toMatchObject({ id: 'd1', target: { scope: 'blocks', audience: 'owners', block_ids: ['bA'] } })
  })

  it('edits a PUBLISHED announcement: who gets it and when it starts are locked, only "Kaydet"', async () => {
    const user = userEvent.setup()
    open()
    await user.click(within(await menuOf(user, 'Yayında duyuru')).getByRole('menuitem', { name: 'Düzenle' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByLabelText('Kapsam')).toBeDisabled()
    expect(within(dialog).getByLabelText('Kimler')).toBeDisabled()
    expect(within(dialog).getByRole('checkbox', { name: 'A Blok' })).toBeDisabled()
    expect(within(dialog).getByLabelText(/Başlangıç/)).toBeDisabled()
    expect(within(dialog).getByLabelText(/Bitiş/)).toBeEnabled()
    expect(within(dialog).queryByRole('button', { name: 'Kaydet ve yayınla' })).not.toBeInTheDocument()
    expect(within(dialog).getByText(/Yayınlanmış duyurunun alıcıları ve başlangıç zamanı değişmez/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(api.saveAnnouncement).toHaveBeenCalled())
    expect(api.publishAnnouncement).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Değişiklikler kaydedildi.')
  })
})

describe('Duyurular (admin): editing what is already published', () => {
  const edit = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
    open()
    await user.click(within(await menuOf(user, title)).getByRole('menuitem', { name: 'Düzenle' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByLabelText('Kapsam')
    return dialog
  }

  it('a SCHEDULED announcement: the stored start time and the target are sent back exactly (the locked fields are still sent)', async () => {
    const user = userEvent.setup()
    const dialog = await edit(user, 'Planlanmış duyuru')
    expect(within(dialog).getByLabelText(/Başlangıç/)).toHaveValue('2026-12-25T12:00') // 09:00 UTC = 12:00 in Istanbul
    expect(within(dialog).getByLabelText(/Başlangıç/)).toBeDisabled()
    await user.clear(within(dialog).getByLabelText(/Metin/))
    await user.type(within(dialog).getByLabelText(/Metin/), 'Düzeltilmiş metin')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(api.saveAnnouncement).toHaveBeenCalledTimes(1))
    expect(api.saveAnnouncement).toHaveBeenCalledWith({
      id: 's1', siteId: 's1', title: 'Planlanmış duyuru', body: 'Düzeltilmiş metin', type: 'genel', pinned: false,
      target: { scope: 'blocks', audience: 'owners', block_ids: ['bA'] },
      publishAt: '2026-12-25T12:00:00+03:00', // the same moment as the stored 09:00 UTC, so the database accepts it as unchanged
      expireAt: null,
    })
    expect(new Date('2026-12-25T12:00:00+03:00').toISOString()).toBe('2026-12-25T09:00:00.000Z')
    expect(toast.success).toHaveBeenCalledWith('Değişiklikler kaydedildi.')
  })

  it('an EXPIRED announcement: its end time is sent back unchanged so a typo can be corrected', async () => {
    const user = userEvent.setup()
    const dialog = await edit(user, 'Süresi dolmuş duyuru')
    expect(within(dialog).getByLabelText(/Bitiş/)).toHaveValue('2026-11-01T13:00')
    await user.clear(within(dialog).getByLabelText(/Başlık/))
    await user.type(within(dialog).getByLabelText(/Başlık/), 'Süresi dolmuş duyuru (düzeltildi)')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(api.saveAnnouncement).toHaveBeenCalledTimes(1))
    expect(api.saveAnnouncement.mock.calls[0][0]).toMatchObject({ id: 'x1', title: 'Süresi dolmuş duyuru (düzeltildi)', publishAt: null, expireAt: '2026-11-01T13:00:00+03:00' })
  })
})

describe('Duyurular (admin): the read report', () => {
  const report: ReportRow[] = [
    { profileId: 'p1', fullName: 'Dilek Diğer', units: 'A Blok · 2', relations: 'owner', readAt: null },
    { profileId: 'p2', fullName: 'Kemal Kiracı', units: 'A Blok · 1', relations: 'tenant', readAt: '2026-11-22T10:00:00Z' },
    { profileId: 'p3', fullName: 'Mehmet Malik', units: 'A Blok · 1', relations: 'owner', readAt: null },
  ]
  const openReport = async (user: ReturnType<typeof userEvent.setup>, title = 'Yayında duyuru') => {
    await user.click(within(await menuOf(user, title)).getByRole('menuitem', { name: 'Okuma raporu' }))
    return screen.findByRole('dialog')
  }

  it('says how many got it, read it and did not, and lists the unread first with unit and role', async () => {
    const user = userEvent.setup()
    api.fetchAnnouncementReport.mockResolvedValue(report)
    open()
    const dialog = await openReport(user)
    expect(await within(dialog).findByText('3 kişiye gitti, 1 kişi okudu, 2 kişi okumadı.')).toBeInTheDocument()
    const unread = within(dialog).getByRole('region', { name: 'Okumayanlar' })
    expect(within(unread).getAllByRole('listitem')).toHaveLength(2)
    expect(within(unread).getByText('Dilek Diğer')).toBeInTheDocument()
    expect(within(unread).getByText(/A Blok · 2 · Kat Maliki/)).toBeInTheDocument()
    const read = within(dialog).getByRole('region', { name: 'Okuyanlar' })
    expect(within(read).getByRole('listitem')).toHaveTextContent('Kemal Kiracı · A Blok · 1 · Kiracı')
    expect(within(read).getByText(/22\.11\.2026/)).toBeInTheDocument()
    expect(api.fetchAnnouncementReport).toHaveBeenCalledWith('p1')
  })

  it('"Okumayanlara tekrar gönder" reminds the unread and says how many', async () => {
    const user = userEvent.setup()
    api.fetchAnnouncementReport.mockResolvedValue(report)
    open()
    const dialog = await openReport(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Okumayanlara tekrar gönder' }))
    await waitFor(() => expect(api.resendAnnouncementUnread).toHaveBeenCalledWith('p1'))
    expect(toast.success).toHaveBeenCalledWith('2 kişiye hatırlatma gönderildi.')
  })

  it('shows the database answer when the reminder was sent too recently', async () => {
    const user = userEvent.setup()
    api.fetchAnnouncementReport.mockResolvedValue(report)
    api.resendAnnouncementUnread.mockRejectedValue({ message: 'resend_too_soon' })
    open()
    const dialog = await openReport(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Okumayanlara tekrar gönder' }))
    expect(await within(dialog).findByText(/en fazla saatte bir/)).toBeInTheDocument()
  })

  it('has no reminder button when everybody read it, and none for an announcement that is not live', async () => {
    const user = userEvent.setup()
    api.fetchAnnouncementReport.mockResolvedValue([report[1]])
    open()
    let dialog = await openReport(user)
    expect(await within(dialog).findByText('Herkes okudu.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Okumayanlara tekrar gönder' })).toBeDisabled()
    await user.keyboard('{Escape}')
    api.fetchAnnouncementReport.mockResolvedValue(report)
    dialog = await openReport(user, 'Süresi dolmuş duyuru')
    expect(await within(dialog).findByText(/yalnızca yayında olan duyurular için/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Okumayanlara tekrar gönder' })).toBeDisabled()
  })

  it('offers "try again" when the report cannot be loaded', async () => {
    const user = userEvent.setup()
    api.fetchAnnouncementReport.mockRejectedValue(new Error('network'))
    open()
    const dialog = await openReport(user)
    expect(await within(dialog).findByText(/Rapor şu anda yüklenemedi/)).toBeInTheDocument()
  })
})
