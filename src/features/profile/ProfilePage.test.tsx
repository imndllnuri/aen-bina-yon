import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes, signedInState } from '@/test/render'
import type { MyProfile } from './api'
import { ProfilePage } from './ProfilePage'

const api = vi.hoisted(() => ({ fetchMyProfile: vi.fn(), saveMyContact: vi.fn(), saveMyNotificationPrefs: vi.fn(), changeMyPassword: vi.fn(), signOutOtherSessions: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))
const resident = vi.hoisted(() => ({ fetchMyUnits: vi.fn() }))
vi.mock('@/features/resident/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/resident/api')>()), ...resident }))
const admin = vi.hoisted(() => ({ fetchAdminSites: vi.fn() }))
vi.mock('@/features/admin/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/admin/api')>()), ...admin }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const plain = (s: string | null) => (s ?? '').replace(/\u00a0/g, ' ')
const profile = (over: Partial<MyProfile> = {}): MyProfile => ({
  fullName: 'Ayşe Kaya', phone: '0532 111 22 33', email: 'ayse@ornek.com', kvkkAt: '2026-11-12T08:30:00Z', kvkkVersion: 'v1', prefs: {}, ...over,
})
const open = (roles: ('admin' | 'resident')[] = ['resident']) =>
  renderRoutes([{ path: '/profil', element: <ProfilePage /> }], { path: '/profil', authState: signedInState(roles, 'kisi@ornek.com') })

beforeEach(() => {
  for (const fn of [...Object.values(api), ...Object.values(resident), ...Object.values(admin), ...Object.values(toast)]) fn.mockReset()
  api.fetchMyProfile.mockResolvedValue(profile())
  api.saveMyContact.mockResolvedValue(undefined)
  api.saveMyNotificationPrefs.mockImplementation(async (prefs: object) => prefs)
  api.changeMyPassword.mockResolvedValue({ ok: true, othersClosed: true })
  api.signOutOtherSessions.mockResolvedValue({ ok: true })
  resident.fetchMyUnits.mockResolvedValue([{ unitId: 'u1', doorNo: '1', blockName: 'A Blok', siteName: 'Demo Sitesi', relations: ['owner'] }])
  admin.fetchAdminSites.mockResolvedValue([{ id: 's1', name: 'Demo Sitesi', companyId: 'c1' }])
})

describe('Kişisel bilgiler', () => {
  it('shows what is saved, and the e-mail as read-only text', async () => {
    open()
    expect(await screen.findByLabelText(/Ad soyad/)).toHaveValue('Ayşe Kaya')
    expect(screen.getByLabelText('Telefon')).toHaveValue('0532 111 22 33')
    const email = screen.getByLabelText('E-posta')
    expect(email).toHaveValue('ayse@ornek.com')
    expect(email).toBeDisabled()
    expect(email).toHaveAttribute('readonly')
    expect(screen.getByText(/Değiştirmek için yönetimle iletişime geçin/)).toBeInTheDocument()
    expect(api.fetchMyProfile).toHaveBeenCalledWith('user-1')
  })
  it('keeps "Kaydet" off until something changed, then saves the trimmed values', async () => {
    const user = userEvent.setup()
    open()
    const name = await screen.findByLabelText(/Ad soyad/)
    const save = screen.getAllByRole('button', { name: 'Kaydet' })[0] as HTMLElement
    expect(save).toBeDisabled()
    await user.clear(name)
    await user.type(name, '  Ayşe Y. Kaya ')
    await user.clear(screen.getByLabelText('Telefon'))
    expect(save).toBeEnabled()
    await user.click(save)
    await waitFor(() => expect(api.saveMyContact).toHaveBeenCalledTimes(1))
    expect(api.saveMyContact).toHaveBeenCalledWith('user-1', { fullName: 'Ayşe Y. Kaya', phone: '' })
    expect(toast.success).toHaveBeenCalledWith('Bilgileriniz kaydedildi.')
  })
  it('reloads the profile after saving (so the greeting on the home page changes too)', async () => {
    const user = userEvent.setup()
    open()
    const name = await screen.findByLabelText(/Ad soyad/)
    await user.clear(name)
    await user.type(name, 'Yeni Ad')
    const before = api.fetchMyProfile.mock.calls.length
    await user.click(screen.getAllByRole('button', { name: 'Kaydet' })[0] as HTMLElement)
    await waitFor(() => expect(api.fetchMyProfile.mock.calls.length).toBeGreaterThan(before))
  })
  it('refuses a short name and a wrong phone before anything is sent', async () => {
    const user = userEvent.setup()
    open()
    const name = await screen.findByLabelText(/Ad soyad/)
    await user.clear(name)
    await user.type(name, 'A')
    await user.clear(screen.getByLabelText('Telefon'))
    await user.type(screen.getByLabelText('Telefon'), 'abc')
    await user.click(screen.getAllByRole('button', { name: 'Kaydet' })[0] as HTMLElement)
    expect(await screen.findByText('Ad soyad en az 2 karakter olmalı.')).toBeInTheDocument()
    expect(screen.getByText(/Geçerli bir telefon numarası yazın/)).toBeInTheDocument()
    expect(api.saveMyContact).not.toHaveBeenCalled()
  })
  it('shows the refusal in Turkish', async () => {
    api.saveMyContact.mockRejectedValue({ code: '42501', message: 'not allowed' })
    const user = userEvent.setup()
    open()
    const name = await screen.findByLabelText(/Ad soyad/)
    await user.type(name, 'x')
    await user.click(screen.getAllByRole('button', { name: 'Kaydet' })[0] as HTMLElement)
    expect(await screen.findByText(/Bu işlem için yetkiniz yok/)).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })
})

describe('E-posta bildirimleri', () => {
  const boxes = () => ['Borç ve ödemeler', 'Duyurular', 'Taleplerim'].map((name) => screen.getByRole('checkbox', { name: new RegExp(name) }))

  it('says honestly that nothing is sent yet', async () => {
    open()
    await screen.findByLabelText(/Ad soyad/)
    expect(screen.getByText(/E-posta gönderimi henüz açık değil/)).toBeInTheDocument()
    expect(screen.getByText(/yalnızca kaydedilir/)).toBeInTheDocument()
  })
  it('shows a choice that was never made as ON', async () => {
    open()
    await screen.findByLabelText(/Ad soyad/)
    for (const box of boxes()) expect(box).toBeChecked()
  })
  it('shows the saved choices', async () => {
    api.fetchMyProfile.mockResolvedValue(profile({ prefs: { email_finance: false, email_requests: true } }))
    open()
    await screen.findByLabelText(/Ad soyad/)
    const [finance, announcements, requests] = boxes()
    expect(finance).not.toBeChecked()
    expect(announcements).toBeChecked() // never chosen: on
    expect(requests).toBeChecked()
  })
  it('saves all three choices, and keeps "Kaydet" off while nothing changed', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByLabelText(/Ad soyad/)
    const save = screen.getAllByRole('button', { name: 'Kaydet' })[1] as HTMLElement
    expect(save).toBeDisabled()
    await user.click(boxes()[0] as HTMLElement)
    expect(save).toBeEnabled()
    const before = api.fetchMyProfile.mock.calls.length
    await user.click(save)
    await waitFor(() => expect(api.saveMyNotificationPrefs).toHaveBeenCalledTimes(1))
    expect(api.saveMyNotificationPrefs).toHaveBeenCalledWith({ email_finance: false, email_announcements: true, email_requests: true })
    await waitFor(() => expect(api.fetchMyProfile.mock.calls.length).toBeGreaterThan(before)) // the page asks again
    expect(toast.success).toHaveBeenCalledWith('Bildirim tercihleriniz kaydedildi.')
  })
  it('shows a message when the choices could not be saved', async () => {
    api.saveMyNotificationPrefs.mockRejectedValue({ message: 'boom' })
    const user = userEvent.setup()
    open()
    await screen.findByLabelText(/Ad soyad/)
    await user.click(boxes()[1] as HTMLElement)
    await user.click(screen.getAllByRole('button', { name: 'Kaydet' })[1] as HTMLElement)
    expect(await screen.findByText(/şu anda yapılamadı/)).toBeInTheDocument()
  })
})

describe('Şifre', () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>, current: string, next: string, again: string) => {
    await user.type(await screen.findByLabelText(/Mevcut şifre/), current)
    await user.type(screen.getByLabelText(/^Yeni şifre \*/), next)
    await user.type(screen.getByLabelText(/Yeni şifre \(tekrar\)/), again)
    await user.click(screen.getByRole('button', { name: 'Şifreyi değiştir' }))
  }

  it('asks for every field before anything is sent', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: 'Şifreyi değiştir' }))
    expect(await screen.findByText('Mevcut şifrenizi yazın.')).toBeInTheDocument()
    expect(screen.getByText('Şifre en az 8 karakter olmalı.')).toBeInTheDocument()
    expect(api.changeMyPassword).not.toHaveBeenCalled()
  })
  it('refuses a repeat that does not match, and the old password as the new one', async () => {
    const user = userEvent.setup()
    open()
    await fill(user, 'eski-sifre-1', 'yeni-sifre-2', 'baska-sifre-3')
    expect(await screen.findByText('Şifreler aynı değil.')).toBeInTheDocument()
    await user.clear(screen.getByLabelText(/^Yeni şifre \*/))
    await user.clear(screen.getByLabelText(/Yeni şifre \(tekrar\)/))
    await user.type(screen.getByLabelText(/^Yeni şifre \*/), 'eski-sifre-1')
    await user.type(screen.getByLabelText(/Yeni şifre \(tekrar\)/), 'eski-sifre-1')
    await user.click(screen.getByRole('button', { name: 'Şifreyi değiştir' }))
    expect(await screen.findByText('Yeni şifre, mevcut şifrenizle aynı olamaz.')).toBeInTheDocument()
    expect(api.changeMyPassword).not.toHaveBeenCalled()
  })
  it('changes the password with the login e-mail, then clears the form and says the other devices were closed', async () => {
    const user = userEvent.setup()
    open()
    await fill(user, 'eski-sifre-1', 'yeni-sifre-2', 'yeni-sifre-2')
    await waitFor(() => expect(api.changeMyPassword).toHaveBeenCalledTimes(1))
    expect(api.changeMyPassword).toHaveBeenCalledWith('kisi@ornek.com', 'eski-sifre-1', 'yeni-sifre-2')
    expect(toast.success).toHaveBeenCalledWith('Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.')
    expect(screen.getByLabelText(/Mevcut şifre/)).toHaveValue('')
    expect(screen.getByLabelText(/^Yeni şifre \*/)).toHaveValue('')
  })
  it('warns when the password changed but the other devices could not be closed', async () => {
    api.changeMyPassword.mockResolvedValue({ ok: true, othersClosed: false })
    const user = userEvent.setup()
    open()
    await fill(user, 'eski-sifre-1', 'yeni-sifre-2', 'yeni-sifre-2')
    await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1))
    expect(String(toast.warning.mock.calls[0]?.[0])).toMatch(/Şifreniz değiştirildi, ancak diğer cihazlardaki oturumlar kapatılamadı/)
    expect(toast.success).not.toHaveBeenCalled()
  })
  it('says "Mevcut şifre hatalı." for a wrong current password and keeps what was typed', async () => {
    api.changeMyPassword.mockResolvedValue({ ok: false, reason: 'wrong-current' })
    const user = userEvent.setup()
    open()
    await fill(user, 'yanlis-sifre', 'yeni-sifre-2', 'yeni-sifre-2')
    expect(await screen.findByText('Mevcut şifre hatalı.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Yeni şifre \*/)).toHaveValue('yeni-sifre-2')
    expect(toast.success).not.toHaveBeenCalled()
  })
  it('shows the other problems in Turkish (too many tries, a weak password)', async () => {
    api.changeMyPassword.mockResolvedValue({ ok: false, reason: 'rate-limited' })
    const user = userEvent.setup()
    open()
    await fill(user, 'eski-sifre-1', 'yeni-sifre-2', 'yeni-sifre-2')
    expect(await screen.findByText(/Çok fazla deneme yapıldı/)).toBeInTheDocument()
    api.changeMyPassword.mockResolvedValue({ ok: false, reason: 'weak-password' })
    await user.click(screen.getByRole('button', { name: 'Şifreyi değiştir' }))
    expect(await screen.findByText(/Bu şifre çok zayıf/)).toBeInTheDocument()
  })
  it('closes the sessions on the other devices on request', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: 'Diğer cihazlardaki oturumları kapat' }))
    await waitFor(() => expect(api.signOutOtherSessions).toHaveBeenCalledTimes(1))
    expect(toast.success).toHaveBeenCalledWith('Diğer cihazlardaki oturumlar kapatıldı.')
  })
  it('says so when the other sessions could not be closed', async () => {
    api.signOutOtherSessions.mockResolvedValue({ ok: false })
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: 'Diğer cihazlardaki oturumları kapat' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(toast.success).not.toHaveBeenCalled()
  })
})

describe('Hesabım', () => {
  const card = async () => within((await screen.findByText('Hesabım')).closest('[data-slot="card"]') as HTMLElement)

  it('shows the role and the unit of a resident, and does not ask for admin sites', async () => {
    open(['resident'])
    const account = await card()
    expect(await account.findByText('Demo Sitesi · A Blok · 1 · Kat Maliki')).toBeInTheDocument()
    expect(account.getByText('Sakin')).toBeInTheDocument()
    expect(admin.fetchAdminSites).not.toHaveBeenCalled()
    expect(resident.fetchMyUnits).toHaveBeenCalledWith('user-1')
  })
  it('shows the role and the sites of an admin, and does not ask for units', async () => {
    open(['admin'])
    const account = await card()
    expect(await account.findByText('Demo Sitesi')).toBeInTheDocument()
    expect(account.getByText('Yönetici')).toBeInTheDocument()
    expect(resident.fetchMyUnits).not.toHaveBeenCalled()
    expect(admin.fetchAdminSites).toHaveBeenCalledWith('user-1')
  })
  it('shows both roles for a person who is admin and resident', async () => {
    open(['admin', 'resident'])
    const account = await card()
    expect(await account.findByText('Yönetici ve Sakin')).toBeInTheDocument()
  })
  it('says when the units could not be read', async () => {
    resident.fetchMyUnits.mockRejectedValue(new Error('boom'))
    open(['resident'])
    const account = await card()
    expect(await account.findByText('Daireleriniz şu anda okunamadı.')).toBeInTheDocument()
  })
  it('shows when the KVKK notice was accepted (Istanbul time) and links to it', async () => {
    open()
    const account = await card()
    expect(plain(account.getByText(/Okuduğunuzu .* onayladınız/).textContent)).toBe('Okuduğunuzu 12.11.2026 11:30 tarihinde onayladınız. Metni oku')
    expect(account.getByRole('link', { name: 'Metni oku' })).toHaveAttribute('href', '/kvkk')
  })
  it('says so when there is no record of the KVKK notice', async () => {
    api.fetchMyProfile.mockResolvedValue(profile({ kvkkAt: null, kvkkVersion: null }))
    open()
    const account = await card()
    expect(account.getByText(/Onay kaydı yok\./)).toBeInTheDocument()
  })
})

describe('the page itself', () => {
  it('shows "try again" when the profile cannot be read, and shows the cards after a retry', async () => {
    api.fetchMyProfile.mockRejectedValueOnce(new Error('boom'))
    const user = userEvent.setup()
    open()
    expect(await screen.findByText('Profiliniz şu anda okunamadı. Lütfen tekrar deneyin.')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Ad soyad/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByLabelText(/Ad soyad/)).toHaveValue('Ayşe Kaya')
  })
  it('falls back to the login e-mail when the profile has none', async () => {
    api.fetchMyProfile.mockResolvedValue(profile({ email: null }))
    open()
    expect(await screen.findByLabelText('E-posta')).toHaveValue('kisi@ornek.com')
  })
  it('has one page title', async () => {
    open()
    expect(await screen.findByRole('heading', { level: 1, name: 'Profilim' })).toBeInTheDocument()
  })
})
