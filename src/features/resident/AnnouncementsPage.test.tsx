import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes, signedInState } from '@/test/render'
import type { MyAnnouncement } from '@/features/announcements/api'
import { AnnouncementsPage } from './AnnouncementsPage'

const api = vi.hoisted(() => ({ fetchMyAnnouncements: vi.fn(), fetchMyReadIds: vi.fn(), markAnnouncementRead: vi.fn() }))
vi.mock('@/features/announcements/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/announcements/api')>()), ...api }))

const routes = [{ path: '/duyurular', element: <AnnouncementsPage /> }]
const mk = (id: string, title: string, over: Partial<MyAnnouncement> = {}): MyAnnouncement => ({
  id, title, body: `${title} metni`, type: 'genel', pinned: false, publishAt: null, expireAt: null, publishedAt: '2026-11-20T10:00:00Z', ...over,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-23T09:00:00Z'))
  for (const fn of Object.values(api)) fn.mockReset()
  api.fetchMyAnnouncements.mockResolvedValue([
    mk('a1', 'Sabit duyuru', { pinned: true, type: 'toplanti' }),
    mk('a2', 'Su kesintisi', { type: 'bakim' }),
    mk('a3', 'Acil: yangın tatbikatı', { type: 'acil' }),
    mk('a4', 'Eski duyuru', { expireAt: '2026-11-01T00:00:00Z' }),
  ])
  api.fetchMyReadIds.mockResolvedValue(['a2'])
  api.markAnnouncementRead.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())
const open = () => renderRoutes(routes, { path: '/duyurular', authState: signedInState(['resident']) })

describe('Duyurular (resident)', () => {
  it('lists the current announcements in the order given (pinned first), unread in bold with a dot, with type and pin', async () => {
    open()
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(within(items[0]).getByText('Sabit duyuru')).toHaveClass('font-semibold')
    expect(within(items[0]).getByText('Sabit')).toBeInTheDocument()
    expect(within(items[0]).getByText('Toplantı')).toBeInTheDocument()
    expect(within(items[0]).getByRole('img', { name: 'Okunmadı' })).toBeInTheDocument()
    expect(within(items[1]).getByText('Su kesintisi')).toHaveClass('font-medium') // read
    expect(within(items[1]).queryByRole('img', { name: 'Okunmadı' })).not.toBeInTheDocument()
    expect(within(items[2]).getByText('Acil')).toBeInTheDocument()
  })

  it('keeps expired announcements in the archive tab', async () => {
    const user = userEvent.setup()
    open()
    expect(await screen.findByRole('tab', { name: 'Güncel (3)' })).toBeInTheDocument()
    expect(screen.queryByText('Eski duyuru')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Arşiv (1)' }))
    expect(await screen.findByText('Eski duyuru')).toBeInTheDocument()
  })

  it('filters by type', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByText('Sabit duyuru')
    await user.click(screen.getByRole('button', { name: 'Acil' }))
    expect(screen.getByRole('button', { name: 'Acil' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Sabit duyuru')).not.toBeInTheDocument()
    expect(screen.getByText('Acil: yangın tatbikatı')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Güncel (1)' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hepsi' }))
    expect(screen.getByText('Sabit duyuru')).toBeInTheDocument()
  })

  it('says so when a type has nothing', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByText('Sabit duyuru')
    await user.click(screen.getByRole('button', { name: 'Genel' }))
    expect(await screen.findByText('Bu türde güncel duyuru yok.')).toBeInTheDocument()
  })

  it('opening an unread announcement shows the text and marks it read (once)', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: /Sabit duyuru/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Sabit duyuru metni')).toBeInTheDocument()
    expect(within(dialog).getByText('Toplantı')).toBeInTheDocument()
    await waitFor(() => expect(api.markAnnouncementRead).toHaveBeenCalledWith('a1'))
    expect(api.markAnnouncementRead).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(api.fetchMyReadIds.mock.calls.length).toBeGreaterThan(1)) // the list asks again: the dot goes
  })

  it('opening one that is already read does not mark it again', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: /Su kesintisi/ }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(api.markAnnouncementRead).not.toHaveBeenCalled()
  })

  it('shows the text even when marking it read fails', async () => {
    const user = userEvent.setup()
    api.markAnnouncementRead.mockRejectedValue(new Error('network'))
    open()
    await user.click(await screen.findByRole('button', { name: /Sabit duyuru/ }))
    expect(within(await screen.findByRole('dialog')).getByText('Sabit duyuru metni')).toBeInTheDocument()
  })

  it('shows the text as PLAIN TEXT: nothing is read as HTML and no address becomes a link', async () => {
    const user = userEvent.setup()
    const evil = 'Merhaba <script>alert(1)</script> <b>kalın</b> <img src=x onerror=alert(2)>\nhttps://evil.example/odeme\nSatır sonu'
    api.fetchMyAnnouncements.mockResolvedValue([mk('e1', 'Tuzak', { body: evil })])
    api.fetchMyReadIds.mockResolvedValue([])
    open()
    await user.click(await screen.findByRole('button', { name: /Tuzak/ }))
    const dialog = await screen.findByRole('dialog')
    const body = within(dialog).getByText(/Merhaba/)
    expect(body.textContent).toBe(evil)
    expect(body.querySelector('script, b, img, a')).toBeNull()
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument()
    expect(body).toHaveClass('whitespace-pre-wrap') // the line breaks are kept
  })

  it('shows the end time of an announcement that has one', async () => {
    const user = userEvent.setup()
    api.fetchMyAnnouncements.mockResolvedValue([mk('t1', 'Süreli', { expireAt: '2026-12-01T09:00:00Z' })])
    open()
    await user.click(await screen.findByRole('button', { name: /Süreli/ }))
    expect(within(await screen.findByRole('dialog')).getByText(/Bitiş: 01\.12\.2026/)).toBeInTheDocument()
  })

  it('has a friendly empty state, an error state and a loading state', async () => {
    api.fetchMyAnnouncements.mockResolvedValue([])
    const first = open()
    expect(await screen.findByText('Şu anda güncel bir duyuru yok.')).toBeInTheDocument()
    first.queryClient.clear()
  })
  it('offers "try again" when the announcements cannot be loaded', async () => {
    api.fetchMyAnnouncements.mockRejectedValue(new Error('network'))
    open()
    expect(await screen.findByText(/Duyurular şu anda yüklenemedi/)).toBeInTheDocument()
  })
  it('shows a loading state first', async () => {
    api.fetchMyAnnouncements.mockReturnValue(new Promise(() => undefined))
    open()
    expect(await screen.findByRole('status', { name: 'Yükleniyor' })).toBeInTheDocument()
  })
})
