import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminRow } from '@/features/admins/api'
import { renderRoutes, signedInState } from '@/test/render'
import { AdminsPage } from './AdminsPage'

const api = vi.hoisted(() => ({ fetchAdminSites: vi.fn(), inviteAdmin: vi.fn(), requestAdminLink: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))
const admins = vi.hoisted(() => ({ fetchAdmins: vi.fn(), removeAdmin: vi.fn() }))
vi.mock('@/features/admins/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/admins/api')>()), ...admins }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const row = (over: Partial<AdminRow> = {}): AdminRow => ({
  profileId: 'p1', fullName: 'Ayşe Admin', email: 'ayse@ornek.com', phone: '0532 111 22 33', isActive: true, activatedAt: '2026-11-01T08:00:00Z', since: '2026-10-05T08:00:00Z', isSelf: false, ...over,
})
const self = row({ isSelf: true })
const other = row({ profileId: 'p2', fullName: 'Berk Admin', email: 'berk@ornek.com', phone: null, since: '2026-11-10T09:00:00Z' })
const pending = row({ profileId: 'p3', fullName: 'Ceren Bekleyen', email: 'ceren@ornek.com', activatedAt: null, since: '2026-11-20T09:00:00Z' })
const inactive = row({ profileId: 'p4', fullName: 'Deniz Kapalı', email: 'deniz@ornek.com', isActive: false })

const open = () => renderRoutes([{ path: '/yonetim/yoneticiler', element: <AdminsPage /> }], { path: '/yonetim/yoneticiler', authState: signedInState(['admin']) })
const card = async (name: string) => (await screen.findByText(name)).closest('li') as HTMLElement

beforeEach(() => {
  for (const fn of [...Object.values(api), ...Object.values(admins), ...Object.values(toast)]) fn.mockReset()
  api.fetchAdminSites.mockResolvedValue([{ id: 's1', name: 'Demo Sitesi', companyId: 'c1' }])
  admins.fetchAdmins.mockResolvedValue([self, other, pending, inactive])
  admins.removeAdmin.mockResolvedValue(undefined)
})

describe('Yöneticiler: the list', () => {
  it('asks for the admins of the selected site and has a title, a text and an invite button', async () => {
    open()
    expect(await screen.findByRole('heading', { level: 1, name: 'Yöneticiler' })).toBeInTheDocument()
    expect(screen.getByText(/Her değişiklik işlem geçmişine yazılır/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Yönetici davet et' })).toBeInTheDocument()
    await screen.findByRole('list', { name: 'Yöneticiler' })
    expect(admins.fetchAdmins).toHaveBeenCalledWith('s1')
  })
  it('shows name, e-mail, phone and the date they became admin', async () => {
    open()
    const c = await card('Berk Admin')
    expect(within(c).getByText('berk@ornek.com')).toBeInTheDocument()
    expect(within(c).getByText('—')).toBeInTheDocument() // no phone
    expect(within(c).getByText('10.11.2026')).toBeInTheDocument()
  })
  it('marks the caller with "Siz", a pending one with "Davet bekliyor", an active one with "Etkin" and a switched-off one', async () => {
    open()
    expect(within(await card('Ayşe Admin')).getByText('Siz')).toBeInTheDocument()
    expect(within(await card('Ayşe Admin')).getByText('Etkin')).toBeInTheDocument()
    expect(within(await card('Ceren Bekleyen')).getByText('Davet bekliyor')).toBeInTheDocument()
    expect(within(await card('Ceren Bekleyen')).queryByText('Etkin')).not.toBeInTheDocument()
    expect(within(await card('Deniz Kapalı')).getByText('Hesap devre dışı')).toBeInTheDocument()
    expect(within(await card('Deniz Kapalı')).queryByText('Etkin')).not.toBeInTheDocument()
  })
  it('gives the caller NO remove button and says why', async () => {
    open()
    const c = await card('Ayşe Admin')
    expect(within(c).queryByRole('button')).not.toBeInTheDocument()
    expect(within(c).getByText(/Kendinizi listeden çıkaramazsınız/)).toBeInTheDocument()
  })
  it('gives every other admin a remove button, and a new link only to a pending one', async () => {
    open()
    expect(within(await card('Berk Admin')).getByRole('button', { name: 'Berk Admin yöneticiliğini kaldır' })).toBeInTheDocument()
    expect(within(await card('Berk Admin')).queryByRole('button', { name: /yeni bağlantı/ })).not.toBeInTheDocument()
    expect(within(await card('Ceren Bekleyen')).getByRole('button', { name: 'Ceren Bekleyen için yeni bağlantı' })).toBeInTheDocument()
    expect(within(await card('Ceren Bekleyen')).getByRole('button', { name: 'Ceren Bekleyen yöneticiliğini kaldır' })).toBeInTheDocument()
    expect(within(await card('Deniz Kapalı')).queryByRole('button', { name: /yeni bağlantı/ })).not.toBeInTheDocument()
  })
  it('shows "try again" when the list cannot be loaded', async () => {
    admins.fetchAdmins.mockRejectedValueOnce(new Error('boom'))
    const user = userEvent.setup()
    open()
    expect(await screen.findByText(/şu anda yüklenemedi/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByText('Berk Admin')).toBeInTheDocument()
  })
})

describe('Yöneticiler: removing an admin', () => {
  it('asks first, naming the person and what stays, then removes and loads the list again', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: 'Berk Admin yöneticiliğini kaldır' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Yöneticilik kaldırılsın mı?')).toBeInTheDocument()
    expect(within(dialog).getByText(/Berk Admin artık bu siteyi yönetemez/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Hesabı ve varsa daire kaydı silinmez/)).toBeInTheDocument()
    expect(admins.removeAdmin).not.toHaveBeenCalled()
    const before = admins.fetchAdmins.mock.calls.length
    await user.click(within(dialog).getByRole('button', { name: 'Kaldır' }))
    await waitFor(() => expect(admins.removeAdmin).toHaveBeenCalledWith('s1', 'p2'))
    expect(toast.success).toHaveBeenCalledWith('Yöneticilik kaldırıldı.')
    await waitFor(() => expect(admins.fetchAdmins.mock.calls.length).toBeGreaterThan(before))
  })
  it('does nothing when the person changes their mind', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: 'Berk Admin yöneticiliğini kaldır' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Vazgeç|İptal/ }))
    expect(admins.removeAdmin).not.toHaveBeenCalled()
  })
  it('explains in Turkish when the database refuses, keeps the dialog open, and still loads the list again', async () => {
    admins.removeAdmin.mockRejectedValue({ code: 'P0001', message: 'not_admin' })
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: 'Berk Admin yöneticiliğini kaldır' }))
    const before = admins.fetchAdmins.mock.calls.length
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kaldır' }))
    expect(await screen.findByText(/yöneticisi değil/)).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
    await waitFor(() => expect(admins.fetchAdmins.mock.calls.length).toBeGreaterThan(before))
  })
})

describe('Yöneticiler: inviting an admin', () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Yönetici davet et' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Ad soyad/), 'Ece Yönetici')
    await user.type(within(dialog).getByLabelText(/E-posta/), 'ece@ornek.com')
    await user.type(within(dialog).getByLabelText('Telefon'), '0532 000 00 00')
    return dialog
  }

  it('warns what an admin can do, and asks for the three facts only (no unit)', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: 'Yönetici davet et' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Yalnızca güvendiğiniz kişileri ekleyin/)).toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/Daire/)).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/İlişki/)).not.toBeInTheDocument()
  })
  it('shows the required messages and sends nothing when the form is empty', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: 'Yönetici davet et' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Yönetici yap ve davet et' }))
    expect(await screen.findByText('Ad soyad en az 2 karakter olmalı.')).toBeInTheDocument()
    expect(screen.getByText('Geçerli bir e-posta adresi yazın.')).toBeInTheDocument()
    expect(api.inviteAdmin).not.toHaveBeenCalled()
  })
  it('sends the site of the page with the typed facts, shows the one-time link for a new admin, and loads the list again', async () => {
    api.inviteAdmin.mockResolvedValue({ ok: true, status: 'invited', profileId: 'p9', link: 'https://x.supabase.co/auth/v1/verify?token=abc' })
    const user = userEvent.setup()
    open()
    const dialog = await fill(user)
    const before = admins.fetchAdmins.mock.calls.length
    await user.click(within(dialog).getByRole('button', { name: 'Yönetici yap ve davet et' }))
    await waitFor(() => expect(api.inviteAdmin).toHaveBeenCalledTimes(1))
    expect(api.inviteAdmin).toHaveBeenCalledWith({ siteId: 's1', email: 'ece@ornek.com', fullName: 'Ece Yönetici', phone: '0532 000 00 00' })
    const linkDialog = await screen.findByRole('dialog', { name: 'Davet bağlantısı hazır' })
    expect(within(linkDialog).getByText(/\(yönetici olarak\)/)).toBeInTheDocument()
    expect(within(linkDialog).getByLabelText('Bağlantı')).toHaveValue('https://x.supabase.co/auth/v1/verify?token=abc')
    const wa = within(linkDialog).getByRole('link', { name: /WhatsApp ile gönder/ })
    expect(decodeURIComponent(wa.getAttribute('href') ?? '')).toContain('yönetici olarak davet edildiniz')
    expect(wa.getAttribute('href')).toContain('wa.me/905320000000')
    await waitFor(() => expect(admins.fetchAdmins.mock.calls.length).toBeGreaterThan(before))
  })
  it('says so (no link) when an existing person became admin', async () => {
    api.inviteAdmin.mockResolvedValue({ ok: true, status: 'linked', profileId: 'p1', link: null })
    const user = userEvent.setup()
    open()
    const dialog = await fill(user)
    await user.click(within(dialog).getByRole('button', { name: 'Yönetici yap ve davet et' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Kişi yönetici yapıldı. Hesabını zaten kullandığı için yeni bir bağlantı gerekmez.'))
    expect(screen.queryByRole('dialog', { name: 'Davet bağlantısı hazır' })).not.toBeInTheDocument()
  })
  it.each([
    ['already_linked', 'Bu kişi zaten bu sitenin yöneticisi.'],
    ['email_in_use_elsewhere', /başka bir firmanın hesabında kullanılıyor/],
    ['account_inactive', /hesabı devre dışı/],
    ['forbidden', 'Bu işlem için yetkiniz yok.'],
    ['failed', /şu anda yapılamadı/],
  ])('shows the answer "%s" in Turkish and keeps the dialog open with what was typed', async (code, text) => {
    api.inviteAdmin.mockResolvedValue({ ok: false, error: code })
    const user = userEvent.setup()
    open()
    const dialog = await fill(user)
    await user.click(within(dialog).getByRole('button', { name: 'Yönetici yap ve davet et' }))
    expect(await within(dialog).findByText(text)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Ad soyad/)).toHaveValue('Ece Yönetici')
  })
})

describe('Yöneticiler: a new link for a pending admin', () => {
  it('asks for the link of that person in this site and shows it', async () => {
    api.requestAdminLink.mockResolvedValue({ ok: true, status: 'link', profileId: 'p3', link: 'https://x.test/fresh' })
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: 'Ceren Bekleyen için yeni bağlantı' }))
    await waitFor(() => expect(api.requestAdminLink).toHaveBeenCalledWith('s1', 'p3'))
    const dialog = await screen.findByRole('dialog', { name: 'Davet bağlantısı hazır' })
    expect(within(dialog).getByLabelText('Bağlantı')).toHaveValue('https://x.test/fresh')
    expect(within(dialog).getByText('Ceren Bekleyen')).toBeInTheDocument()
  })
  it('shows the problem in Turkish when no link can be made', async () => {
    api.requestAdminLink.mockResolvedValue({ ok: false, error: 'already_active' })
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: 'Ceren Bekleyen için yeni bağlantı' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('hesabını zaten etkinleştirmiş')))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
