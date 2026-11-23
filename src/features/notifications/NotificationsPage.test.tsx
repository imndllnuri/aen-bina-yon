import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLocation } from 'react-router'
import { renderRoutes, signedInState } from '@/test/render'
import { NotificationBell } from './components/NotificationBell'
import { NotificationsPage } from './NotificationsPage'
import type { NotificationRow } from './api'

const api = vi.hoisted(() => ({ fetchNotifications: vi.fn(), fetchUnreadCount: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn(), deleteNotification: vi.fn(), deleteAllNotifications: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

function Probe({ name }: { name: string }) {
  return (
    <div>
      <p>{name}</p>
      <pre data-testid="where">{useLocation().pathname}</pre>
    </div>
  )
}
const routes = [
  { path: '/bildirimler', element: <NotificationsPage /> },
  { path: '/borclarim', element: <Probe name="BORÇLARIM" /> },
  { path: '/yonetim/havale-onaylari', element: <Probe name="HAVALE ONAYLARI" /> },
  { path: '/bell', element: <NotificationBell to="/bildirimler" /> },
]
// the button that OPENS a notification (not the delete button, whose name also holds the title)
const openButton = async (title: string) => (await screen.findByText(title)).closest('button')!
const row = (over: Partial<NotificationRow> = {}): NotificationRow => ({ id: 'n1', kind: 'charge', title: 'Yeni borç', body: 'Aidat · Kasım 2026: ₺1.500,00 · son ödeme 15.11.2026', link: '/borclarim', createdAt: '2026-11-23T10:00:00Z', readAt: null, ...over })

beforeEach(() => {
  for (const fn of [...Object.values(api), ...Object.values(toast)]) fn.mockReset()
  api.fetchNotifications.mockResolvedValue([row(), row({ id: 'n2', kind: 'payment', title: 'Ödeme alındı', body: '₺100,00 ödemeniz alındı.', link: '/odemelerim', readAt: '2026-11-23T11:00:00Z' })])
  api.fetchUnreadCount.mockResolvedValue(1)
  for (const fn of [api.markNotificationRead, api.markAllNotificationsRead, api.deleteNotification, api.deleteAllNotifications]) fn.mockResolvedValue(undefined)
})
const open = (path = '/bildirimler') => renderRoutes(routes, { path, authState: signedInState(['resident']) })

describe('Bildirimler', () => {
  it('does not claim "no unread" while the list is still loading', async () => {
    api.fetchNotifications.mockReturnValue(new Promise(() => undefined))
    open()
    expect(await screen.findByRole('status', { name: 'Yükleniyor' })).toBeInTheDocument()
    expect(screen.queryByText(/okunmamış bildiriminiz/)).not.toBeInTheDocument()
  })

  it('lists the notifications: unread ones in bold with a dot, read ones calm, and says how many are unread', async () => {
    open()
    expect(await screen.findByText('1 okunmamış bildiriminiz var.')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(within(items[0]).getByRole('img', { name: 'Okunmadı' })).toBeInTheDocument()
    expect(within(items[0]).getByText('Yeni borç')).toHaveClass('font-semibold')
    expect(within(items[0]).getByText('Borç')).toBeInTheDocument()
    expect(within(items[1]).queryByRole('img', { name: 'Okunmadı' })).not.toBeInTheDocument()
    expect(within(items[1]).getByText('Ödeme alındı')).toHaveClass('font-medium')
  })

  it('opening an unread one marks it read and goes to the page it names', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await openButton('Yeni borç'))
    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledWith('n1'))
    expect(await screen.findByText('BORÇLARIM')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/borclarim'))
  })

  it('opening one that is already read does not mark it again', async () => {
    const user = userEvent.setup()
    api.fetchNotifications.mockResolvedValue([row({ readAt: '2026-11-23T11:00:00Z' })])
    open()
    await user.click(await openButton('Yeni borç'))
    expect(await screen.findByText('BORÇLARIM')).toBeInTheDocument()
    expect(api.markNotificationRead).not.toHaveBeenCalled()
  })

  it('follows only an internal link: an address or a script stays on the page', async () => {
    const user = userEvent.setup()
    api.fetchNotifications.mockResolvedValue([row({ id: 'x1', title: 'Tuzak', link: 'https://evil.example/pay' }), row({ id: 'x2', title: 'Tuzak 2', link: 'javascript:alert(1)' }), row({ id: 'x3', title: 'Tuzak 3', link: '//evil.example' })])
    const { router } = open()
    const navigate = vi.spyOn(router, 'navigate') // the page must not even TRY to go there
    for (const title of ['Tuzak', 'Tuzak 2', 'Tuzak 3']) {
      await user.click(await openButton(title))
    }
    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledTimes(3)) // read, yes; followed, no
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Bildirimler' })).toBeInTheDocument()
    expect(screen.queryByTestId('where')).not.toBeInTheDocument()
  })

  it('opens an admin link the same way', async () => {
    const user = userEvent.setup()
    api.fetchNotifications.mockResolvedValue([row({ id: 'h1', kind: 'havale_new', title: 'Yeni havale bildirimi', link: '/yonetim/havale-onaylari' })])
    open()
    await user.click(await openButton('Yeni havale bildirimi'))
    expect(await screen.findByText('HAVALE ONAYLARI')).toBeInTheDocument()
  })

  it('still opens the page when marking it read fails', async () => {
    const user = userEvent.setup()
    api.markNotificationRead.mockRejectedValue(new Error('network'))
    open()
    await user.click(await openButton('Yeni borç'))
    expect(await screen.findByText('BORÇLARIM')).toBeInTheDocument()
  })

  it('marks all read, and the button is off when nothing is unread', async () => {
    const user = userEvent.setup()
    open()
    const all = await screen.findByRole('button', { name: 'Hepsini okundu yap' })
    expect(all).toBeEnabled()
    await user.click(all)
    await waitFor(() => expect(api.markAllNotificationsRead).toHaveBeenCalledTimes(1))
  })
  it('disables "mark all read" when everything is read', async () => {
    api.fetchNotifications.mockResolvedValue([row({ readAt: '2026-11-23T11:00:00Z' })])
    open()
    expect(await screen.findByText('Okunmamış bildiriminiz yok.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hepsini okundu yap' })).toBeDisabled()
  })

  it('deletes one notification', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: '“Yeni borç” bildirimini sil' }))
    await waitFor(() => expect(api.deleteNotification).toHaveBeenCalledWith('n1'))
  })

  it('asks before deleting all, and says what is NOT deleted', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: 'Hepsini sil' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Borçlarınız, ödemeleriniz ve duyurular silinmez/)).toBeInTheDocument()
    expect(api.deleteAllNotifications).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Hepsini sil' }))
    await waitFor(() => expect(api.deleteAllNotifications).toHaveBeenCalledTimes(1))
  })

  it('tells the person when an action fails', async () => {
    const user = userEvent.setup()
    api.deleteNotification.mockRejectedValue(new Error('denied'))
    open()
    await user.click(await screen.findByRole('button', { name: '“Yeni borç” bildirimini sil' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/silinemedi/)))
  })

  it('has a friendly empty state and an error state', async () => {
    api.fetchNotifications.mockResolvedValue([])
    const first = open()
    expect(await screen.findByText(/Henüz bildiriminiz yok/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hepsini sil' })).not.toBeInTheDocument()
    first.queryClient.clear()
  })
  it('offers "try again" when the list cannot be loaded', async () => {
    api.fetchNotifications.mockRejectedValue(new Error('network'))
    open()
    expect(await screen.findByText(/Bildirimleriniz şu anda yüklenemedi/)).toBeInTheDocument()
  })
})

describe('the bell', () => {
  it('shows the unread number, and names it for a screen reader', async () => {
    api.fetchUnreadCount.mockResolvedValue(3)
    open('/bell')
    const link = await screen.findByRole('link', { name: 'Bildirimler, 3 okunmamış' })
    expect(link).toHaveAttribute('href', '/bildirimler')
    expect(within(link).getByText('3')).toBeInTheDocument()
  })
  it('shows no number when everything is read, and 99+ for very many', async () => {
    api.fetchUnreadCount.mockResolvedValue(0)
    const first = open('/bell')
    expect(await screen.findByRole('link', { name: 'Bildirimler' })).toHaveAttribute('href', '/bildirimler')
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    first.queryClient.clear()
  })
  it('caps the badge at 99+', async () => {
    api.fetchUnreadCount.mockResolvedValue(250)
    open('/bell')
    expect(await screen.findByText('99+')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bildirimler, 250 okunmamış' })).toBeInTheDocument()
  })
})
