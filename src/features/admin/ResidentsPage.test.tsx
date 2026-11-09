import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { todayIstanbul } from '@/lib/format'
import { renderRoutes, signedInState } from '@/test/render'
import type { BlockRow, ResidentRow, UnitRow } from './api'
import { ResidentsPage } from './ResidentsPage'

const api = vi.hoisted(() => ({
  fetchAdminSites: vi.fn(),
  fetchBlocks: vi.fn(),
  fetchUnits: vi.fn(),
  fetchResidents: vi.fn(),
  updateProfileContact: vi.fn(),
  endResidency: vi.fn(),
  deleteResidency: vi.fn(),
  setProfileActive: vi.fn(),
  inviteResident: vi.fn(),
  requestSignInLink: vi.fn(),
}))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))

const routes = [{ path: '/yonetim/sakinler', element: <ResidentsPage /> }]
const today = todayIstanbul()

const block: BlockRow = { id: 'b1', name: 'A Blok' }
const units: UnitRow[] = [
  { id: 'u1', blockId: 'b1', doorNo: '1', floor: 1, type: 'konut', grossM2: null, landShare: null, status: 'occupied', residencies: [] },
  { id: 'u2', blockId: 'b1', doorNo: '2', floor: 1, type: 'konut', grossM2: null, landShare: null, status: 'occupied', residencies: [] },
]
const row = (over: Partial<ResidentRow> = {}): ResidentRow => ({
  residencyId: 'r1', relation: 'owner', startDate: '2020-01-01', endDate: null, unitId: 'u1', doorNo: '1', blockName: 'A Blok',
  profileId: 'p1', fullName: 'Ayşe Kaya', email: 'ayse@ornek.com', phone: '0532 111 22 33', isActive: true,
  kvkkConsentAt: '2026-01-01T10:00:00Z', ...over,
})

const active = row()
const pending = row({ residencyId: 'r2', profileId: 'p2', fullName: 'Bekleyen Bey', email: 'bekleyen@ornek.com', phone: null, kvkkConsentAt: null, doorNo: '2', unitId: 'u2' })
const inactive = row({ residencyId: 'r3', profileId: 'p3', fullName: 'Kapalı Hanım', email: 'kapali@ornek.com', isActive: false, relation: 'tenant' })
const past = row({ residencyId: 'r4', profileId: 'p4', fullName: 'Eski Sakin', email: 'eski@ornek.com', endDate: '2021-06-30', startDate: '2019-01-01' })

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.fetchAdminSites.mockResolvedValue([{ id: 's1', name: 'Demo Sitesi', companyId: 'c1' }])
  api.fetchBlocks.mockResolvedValue([block])
  api.fetchUnits.mockResolvedValue(units)
  api.fetchResidents.mockResolvedValue([active, pending, inactive, past])
  for (const fn of [api.updateProfileContact, api.endResidency, api.deleteResidency, api.setProfileActive]) fn.mockResolvedValue(undefined)
})

const open = () => renderRoutes(routes, { path: '/yonetim/sakinler', authState: signedInState(['admin']) })
const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr') as HTMLElement

describe('Sakinler page: the list', () => {
  it('shows current residents with a status for each (Aktif, Davet bekliyor, Devre dışı) and hides past ones', async () => {
    open()
    expect(within(await rowOf('Ayşe Kaya')).getByText('Aktif')).toBeInTheDocument()
    expect(within(await rowOf('Bekleyen Bey')).getByText('Davet bekliyor')).toBeInTheDocument()
    expect(within(await rowOf('Kapalı Hanım')).getByText('Devre dışı')).toBeInTheDocument()
    expect(screen.queryByText('Eski Sakin')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Güncel (3)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Geçmiş (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tümü (4)' })).toBeInTheDocument()
    expect(within(await rowOf('Ayşe Kaya')).getByText('Malik')).toBeInTheDocument()
    expect(within(await rowOf('Kapalı Hanım')).getByText('Kiracı')).toBeInTheDocument()
  })

  it('shows the move-in date as GG.AA.YYYY and the range for people who left', async () => {
    const user = userEvent.setup()
    open()
    expect(within(await rowOf('Ayşe Kaya')).getByText('01.01.2020')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Geçmiş (1)' }))
    expect(within(await rowOf('Eski Sakin')).getByText('01.01.2019 – 30.06.2021')).toBeInTheDocument()
    expect(screen.queryByText('Ayşe Kaya')).not.toBeInTheDocument()
  })

  it('searches by name, e-mail or unit', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByText('Ayşe Kaya')
    await user.type(screen.getByRole('searchbox', { name: 'Sakin ara' }), 'bekleyen')
    expect(screen.queryByText('Ayşe Kaya')).not.toBeInTheDocument()
    expect(screen.getByText('Bekleyen Bey')).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: 'Sakin ara' }))
    await user.type(screen.getByRole('searchbox', { name: 'Sakin ara' }), 'a blok 2')
    expect(screen.getByText('Bekleyen Bey')).toBeInTheDocument()
    expect(screen.queryByText('Kapalı Hanım')).not.toBeInTheDocument() // lives in door 1
    await user.clear(screen.getByRole('searchbox', { name: 'Sakin ara' }))
    await user.type(screen.getByRole('searchbox', { name: 'Sakin ara' }), 'zzzz')
    expect(await screen.findByText('Bu filtreyle eşleşen kimse yok.')).toBeInTheDocument()
  })

  it('guides the first step when there are no units yet', async () => {
    api.fetchUnits.mockResolvedValue([])
    api.fetchResidents.mockResolvedValue([])
    open()
    expect(await screen.findByText(/Önce Daireler sayfasından daire ekleyin/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sakin ekle ve davet et/ })).toBeDisabled()
  })

  it('tells the person when there are no residents yet', async () => {
    api.fetchResidents.mockResolvedValue([])
    open()
    expect(await screen.findByText(/Henüz sakin yok. “Sakin ekle ve davet et” ile ilk kişiyi ekleyin/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sakin ekle ve davet et/ })).toBeEnabled()
  })

  it('offers "try again" when loading fails', async () => {
    api.fetchResidents.mockRejectedValue(new Error('network'))
    open()
    expect(await screen.findByText(/Sakinler şu anda yüklenemedi/)).toBeInTheDocument()
  })
})

describe('Sakinler page: invite', () => {
  async function fillInvite(user: ReturnType<typeof userEvent.setup>, over: { phone?: string; email?: string } = {}) {
    await user.click(await screen.findByRole('button', { name: /Sakin ekle ve davet et/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: /Ad soyad/ }), 'Yeni Kişi')
    await user.type(within(dialog).getByRole('textbox', { name: /E-posta/ }), over.email ?? 'yeni@ornek.com')
    await user.type(within(dialog).getByRole('textbox', { name: /Telefon/ }), over.phone ?? '0532 999 88 77')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Daire/ }), 'u2')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /İlişki/ }), 'tenant')
    await user.click(within(dialog).getByRole('button', { name: 'Ekle ve davet et' }))
    return dialog
  }

  it('sends the right request, then shows the one-time link with Copy and WhatsApp', async () => {
    api.inviteResident.mockResolvedValue({ ok: true, status: 'invited', profileId: 'p9', link: 'https://x.supabase.co/auth/v1/verify?token=abc' })
    const user = userEvent.setup()
    open()
    await fillInvite(user)

    await waitFor(() => expect(api.inviteResident).toHaveBeenCalledTimes(1))
    expect(api.inviteResident).toHaveBeenCalledWith({
      email: 'yeni@ornek.com', fullName: 'Yeni Kişi', phone: '0532 999 88 77', unitId: 'u2', relation: 'tenant', startDate: today,
    })

    const linkDialog = await screen.findByRole('dialog', { name: /Davet bağlantısı hazır/ })
    expect(within(linkDialog).getByLabelText('Bağlantı')).toHaveValue('https://x.supabase.co/auth/v1/verify?token=abc')
    expect(within(linkDialog).getByText(/yalnızca/)).toBeInTheDocument()

    const whatsapp = within(linkDialog).getByRole('link', { name: /WhatsApp ile gönder/ })
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/905329998877\?text=/)
    expect(decodeURIComponent(whatsapp.getAttribute('href') ?? '')).toContain('https://x.supabase.co/auth/v1/verify?token=abc')
    expect(whatsapp).toHaveAttribute('target', '_blank')
    expect(whatsapp).toHaveAttribute('rel', expect.stringContaining('noopener'))

    await user.click(within(linkDialog).getByRole('button', { name: 'Kopyala' }))
    expect(await navigator.clipboard.readText()).toBe('https://x.supabase.co/auth/v1/verify?token=abc')
    expect(await within(linkDialog).findByRole('button', { name: 'Kopyalandı' })).toBeInTheDocument()
  })

  it('reloads the lists after an invite', async () => {
    api.inviteResident.mockResolvedValue({ ok: true, status: 'invited', profileId: 'p9', link: 'https://x.test/l' })
    const user = userEvent.setup()
    open()
    await fillInvite(user)
    await screen.findByRole('dialog', { name: /Davet bağlantısı hazır/ })
    expect(api.fetchResidents).toHaveBeenCalledTimes(2)
  })

  it('does not keep the link anywhere once the dialog is closed', async () => {
    api.inviteResident.mockResolvedValue({ ok: true, status: 'invited', profileId: 'p9', link: 'https://x.test/secret-link' })
    const user = userEvent.setup()
    open()
    await fillInvite(user)
    await user.click(await screen.findByRole('button', { name: 'Kapat' }))
    await waitFor(() => expect(screen.queryByDisplayValue('https://x.test/secret-link')).not.toBeInTheDocument())
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain('secret-link')
  })

  it('links an existing active person WITHOUT a link dialog (no way to take over their account)', async () => {
    api.inviteResident.mockResolvedValue({ ok: true, status: 'linked', profileId: 'p1', link: null })
    const user = userEvent.setup()
    open()
    await fillInvite(user)
    await waitFor(() => expect(api.inviteResident).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: /Davet bağlantısı hazır/ })).not.toBeInTheDocument()
    expect(api.fetchResidents).toHaveBeenCalledTimes(2) // the new residency is shown
  })

  it.each([
    ['already_linked', /aynı ilişkiyle kayıtlı/],
    ['email_in_use_elsewhere', /başka bir hesapta/],
    ['account_inactive', /devre dışı/],
    ['forbidden', /yetkiniz yok/],
    ['failed', /şu anda yapılamadı/],
    ['something_new', /şu anda yapılamadı/],
  ])('shows a clear message for %s and keeps the dialog open', async (code, message) => {
    api.inviteResident.mockResolvedValue({ ok: false, error: code })
    const user = userEvent.setup()
    open()
    const dialog = await fillInvite(user)
    expect(await within(dialog).findByText(message)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: /Sakin ekle ve davet et/ })).toBeInTheDocument()
  })

  it('checks the form before calling the server', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: /Sakin ekle ve davet et/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Ekle ve davet et' }))
    expect(await within(dialog).findByText('Ad soyad en az 2 karakter olmalı.')).toBeInTheDocument()
    expect(within(dialog).getByText('Geçerli bir e-posta adresi yazın.')).toBeInTheDocument()
    expect(within(dialog).getByText('Daireyi seçin.')).toBeInTheDocument()
    expect(api.inviteResident).not.toHaveBeenCalled()
  })
})

describe('Sakinler page: actions on a resident', () => {
  async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(await screen.findByRole('button', { name: `${name} için işlemler` }))
    return screen.findByRole('menu')
  }

  it('offers a new sign-in link ONLY for someone who has not finished the invite page', async () => {
    const user = userEvent.setup()
    open()
    const activeMenu = await openMenu(user, 'Ayşe Kaya')
    expect(within(activeMenu).queryByRole('menuitem', { name: 'Giriş bağlantısı oluştur' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    const pendingMenu = await openMenu(user, 'Bekleyen Bey')
    expect(within(pendingMenu).getByRole('menuitem', { name: 'Giriş bağlantısı oluştur' })).toBeInTheDocument()
  })

  it('creates the link for a pending resident and shows it', async () => {
    api.requestSignInLink.mockResolvedValue({ ok: true, status: 'link', profileId: 'p2', link: 'https://x.test/fresh' })
    const user = userEvent.setup()
    open()
    const menu = await openMenu(user, 'Bekleyen Bey')
    await user.click(within(menu).getByRole('menuitem', { name: 'Giriş bağlantısı oluştur' }))
    expect(api.requestSignInLink).toHaveBeenCalledWith('p2')
    expect(await screen.findByDisplayValue('https://x.test/fresh')).toBeInTheDocument()
  })

  it('stays calm when the server refuses a link (for example the person finished meanwhile)', async () => {
    api.requestSignInLink.mockResolvedValue({ ok: false, error: 'already_active' })
    const user = userEvent.setup()
    open()
    const menu = await openMenu(user, 'Bekleyen Bey')
    await user.click(within(menu).getByRole('menuitem', { name: 'Giriş bağlantısı oluştur' }))
    await waitFor(() => expect(api.requestSignInLink).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('marks a resident as moved out TODAY after a confirmation', async () => {
    const user = userEvent.setup()
    open()
    const menu = await openMenu(user, 'Ayşe Kaya')
    await user.click(within(menu).getByRole('menuitem', { name: 'Taşındı olarak işaretle' }))
    expect(await screen.findByText('Taşındı olarak işaretlensin mi?')).toBeInTheDocument()
    expect(api.endResidency).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Taşındı olarak işaretle' }))
    await waitFor(() => expect(api.endResidency).toHaveBeenCalledWith('r1', today))
  })

  it('deactivates and reactivates accounts after a confirmation', async () => {
    const user = userEvent.setup()
    open()
    let menu = await openMenu(user, 'Ayşe Kaya')
    await user.click(within(menu).getByRole('menuitem', { name: 'Hesabı devre dışı bırak' }))
    await user.click(await screen.findByRole('button', { name: 'Devre dışı bırak' }))
    await waitFor(() => expect(api.setProfileActive).toHaveBeenCalledWith('p1', false))

    menu = await openMenu(user, 'Kapalı Hanım')
    expect(within(menu).queryByRole('menuitem', { name: 'Hesabı devre dışı bırak' })).not.toBeInTheDocument()
    await user.click(within(menu).getByRole('menuitem', { name: 'Hesabı etkinleştir' }))
    await user.click(await screen.findByRole('button', { name: 'Etkinleştir' }))
    await waitFor(() => expect(api.setProfileActive).toHaveBeenCalledWith('p3', true))
  })

  it('shows the database refusal in the confirmation (for example "you cannot deactivate yourself")', async () => {
    api.setProfileActive.mockRejectedValue({ code: '42501' })
    const user = userEvent.setup()
    open()
    const menu = await openMenu(user, 'Ayşe Kaya')
    await user.click(within(menu).getByRole('menuitem', { name: 'Hesabı devre dışı bırak' }))
    await user.click(await screen.findByRole('button', { name: 'Devre dışı bırak' }))
    expect(await screen.findByText(/yetkiniz yok/)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument() // stays open so the message can be read
  })

  const twoUnits = [
    row({ residencyId: 'r5', profileId: 'p5', fullName: 'Çift Daireli', email: 'cift@ornek.com', unitId: 'u1', doorNo: '1' }),
    row({ residencyId: 'r6', profileId: 'p5', fullName: 'Çift Daireli', email: 'cift@ornek.com', unitId: 'u2', doorNo: '2', relation: 'tenant' }),
  ]

  it('removes a residency record only after a confirmation (when the person has another one)', async () => {
    api.fetchResidents.mockResolvedValue(twoUnits)
    const user = userEvent.setup()
    open()
    await screen.findAllByText('Çift Daireli')
    await user.click((await screen.findAllByRole('button', { name: 'Çift Daireli için işlemler' }))[0])
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: /Daireden çıkar/ }))
    expect(await screen.findByText('Daireden çıkarılsın mı?')).toBeInTheDocument()
    expect(api.deleteResidency).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Daireden çıkar' }))
    await waitFor(() => expect(api.deleteResidency).toHaveBeenCalledWith('r5'))
  })

  it('does NOT offer "Daireden çıkar" for a person\'s only residency (their e-mail could get stuck); "Taşındı" is there instead', async () => {
    const user = userEvent.setup()
    open()
    const menu = await openMenu(user, 'Ayşe Kaya')
    expect(within(menu).queryByRole('menuitem', { name: /Daireden çıkar/ })).not.toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Taşındı olarak işaretle' })).toBeInTheDocument()
  })

  it('edits name and phone (an empty phone becomes "no phone")', async () => {
    const user = userEvent.setup()
    open()
    const menu = await openMenu(user, 'Ayşe Kaya')
    await user.click(within(menu).getByRole('menuitem', { name: 'Bilgileri düzenle' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('ayse@ornek.com')).toBeInTheDocument()
    const name = within(dialog).getByRole('textbox', { name: /Ad soyad/ })
    expect(name).toHaveValue('Ayşe Kaya')
    await user.clear(name)
    await user.type(name, 'Ayşe Yıldız')
    await user.clear(within(dialog).getByRole('textbox', { name: 'Telefon' }))
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(api.updateProfileContact).toHaveBeenCalledWith('p1', { full_name: 'Ayşe Yıldız', phone: null }))
  })
})
