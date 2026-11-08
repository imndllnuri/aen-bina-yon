import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KVKK_VERSION } from '@/config/kvkk'
import { anonymousState, renderRoutes, signedInState } from '@/test/render'
import { SetPassword } from './SetPassword'

const mocks = vi.hoisted(() => ({
  auth: { updateUser: vi.fn() },
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return { auth: mocks.auth, rpc: mocks.rpc }
  },
  isSupabaseConfigured: true,
}))

const routes = [
  { path: '/auth/onay', element: <SetPassword mode="invite" /> },
  { path: '/sifre-yenile', element: <SetPassword mode="recovery" /> },
  { path: '/giris', element: <p>GİRİŞ SAYFASI</p> },
  { path: '/panel', element: <p>SAKİN ANA SAYFA</p> },
  { path: '/yonetim', element: <p>YÖNETİM ANA SAYFA</p> },
]

beforeEach(() => {
  mocks.auth.updateUser.mockReset().mockResolvedValue({ data: {}, error: null })
  mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

type User = ReturnType<typeof userEvent.setup>

/** Types the password twice, ticks the KVKK box when the page has one, and submits. */
async function submit(user: User, password: string, { confirm = password, consent = true } = {}) {
  await user.type(screen.getByLabelText(/^Yeni şifre\s*\*?$/), password)
  await user.type(screen.getByLabelText(/Yeni şifre \(tekrar\)/), confirm)
  const box = screen.queryByRole('checkbox', { name: /KVKK Aydınlatma Metni/ })
  if (box && consent) await user.click(box)
  await user.click(screen.getByRole('button', { name: /kaydet/ }))
}

describe('SetPassword page (invite)', () => {
  it('shows whose account is being activated', () => {
    renderRoutes(routes, { path: '/auth/onay', authState: signedInState(['resident'], 'yeni@ornek.com') })
    expect(screen.getByRole('heading', { level: 1, name: 'Hesabınızı etkinleştirin' })).toBeInTheDocument()
    expect(screen.getByText('yeni@ornek.com')).toBeInTheDocument()
  })

  it('saves the password, THEN records the KVKK consent (last step), then opens the resident panel', async () => {
    const user = userEvent.setup()
    const { router } = renderRoutes(routes, { path: '/auth/onay', authState: signedInState(['resident']) })

    await submit(user, 'yeni-sifre-123')

    await waitFor(() => expect(router.state.location.pathname).toBe('/panel'))
    expect(mocks.auth.updateUser).toHaveBeenCalledWith({ password: 'yeni-sifre-123' })
    expect(mocks.rpc).toHaveBeenCalledWith('accept_kvkk', { p_version: KVKK_VERSION })
    // The consent is the LAST step: the admin page treats it as "invite page finished".
    expect(mocks.auth.updateUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0])
    expect(await screen.findByText('SAKİN ANA SAYFA')).toBeInTheDocument()
  })

  it('sends an admin to the admin panel', async () => {
    const user = userEvent.setup()
    const { router } = renderRoutes(routes, { path: '/auth/onay', authState: signedInState(['admin']) })
    await submit(user, 'yeni-sifre-123')
    await waitFor(() => expect(router.state.location.pathname).toBe('/yonetim'))
  })

  it('needs the KVKK tick and does nothing without it', async () => {
    const user = userEvent.setup()
    renderRoutes(routes, { path: '/auth/onay', authState: signedInState(['resident']) })

    await submit(user, 'yeni-sifre-123', { consent: false })

    expect(await screen.findByText(/aydınlatma metnini okuduğunuzu onaylayın/)).toBeInTheDocument()
    expect(mocks.auth.updateUser).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('links to the KVKK text in a new tab', () => {
    renderRoutes(routes, { path: '/auth/onay', authState: signedInState(['resident']) })
    const link = screen.getByRole('link', { name: 'KVKK Aydınlatma Metni' })
    expect(link).toHaveAttribute('href', '/kvkk')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('rejects a short password and a mismatch without calling Supabase', async () => {
    const user = userEvent.setup()
    renderRoutes(routes, { path: '/auth/onay', authState: signedInState(['resident']) })

    await submit(user, '1234567')
    expect(await screen.findByText('Şifre en az 8 karakter olmalı.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/^Yeni şifre\s*\*?$/))
    await user.clear(screen.getByLabelText(/Yeni şifre \(tekrar\)/))
    await user.type(screen.getByLabelText(/^Yeni şifre\s*\*?$/), '12345678')
    await user.type(screen.getByLabelText(/Yeni şifre \(tekrar\)/), 'farkli-sifre')
    await user.click(screen.getByRole('button', { name: /kaydet/ }))
    expect(await screen.findByText('Şifreler aynı değil.')).toBeInTheDocument()
    expect(mocks.auth.updateUser).not.toHaveBeenCalled()
  })

  it.each([
    ['same_password', /eski şifrenizle aynı olamaz/],
    ['weak_password', /çok zayıf/],
  ])('shows a clear message for %s, stays on the page, and records NO consent', async (code, message) => {
    mocks.auth.updateUser.mockResolvedValue({ data: {}, error: { code, status: 422 } })
    const user = userEvent.setup()
    const { router } = renderRoutes(routes, { path: '/auth/onay', authState: signedInState(['resident']) })
    await submit(user, 'yeni-sifre-123')
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/auth/onay')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('tries the consent a second time on its own when the first try fails', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'x' } }).mockResolvedValueOnce({ data: null, error: null })
    const user = userEvent.setup()
    const { router } = renderRoutes(routes, { path: '/auth/onay', authState: signedInState(['resident']) })
    await submit(user, 'yeni-sifre-123')
    await waitFor(() => expect(router.state.location.pathname).toBe('/panel'))
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })

  it('shows a "try again" step when the consent keeps failing, and finishes once it works', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'x' } })
    const user = userEvent.setup()
    const { router } = renderRoutes(routes, { path: '/auth/onay', authState: signedInState(['resident']) })
    await submit(user, 'yeni-sifre-123')

    expect(await screen.findByText(/Şifreniz kaydedildi, ancak KVKK onayınız kaydedilemedi/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/auth/onay')
    expect(mocks.auth.updateUser).toHaveBeenCalledTimes(1) // the password is not saved again

    mocks.rpc.mockResolvedValue({ data: null, error: null })
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/panel'))
    expect(mocks.auth.updateUser).toHaveBeenCalledTimes(1)
  })

  it('shows the "link is invalid" page when the link was used or expired (?error=...)', () => {
    renderRoutes(routes, { path: '/auth/onay?error=otp_expired', authState: anonymousState })
    expect(screen.getByRole('heading', { level: 1, name: 'Bağlantı geçersiz' })).toBeInTheDocument()
    expect(screen.getByText(/yalnızca bir kez kullanılabilir/)).toBeInTheDocument()
    expect(screen.getByText(/yönetimden yeni bir davet isteyin/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Giriş sayfasına git' })).toHaveAttribute('href', '/giris')
    expect(screen.getByRole('link', { name: 'Şifremi unuttum' })).toHaveAttribute('href', '/sifremi-unuttum')
  })

  it('shows the same page when someone opens the address without a link (not signed in)', () => {
    renderRoutes(routes, { path: '/auth/onay', authState: anonymousState })
    expect(screen.getByRole('heading', { level: 1, name: 'Bağlantı geçersiz' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Yeni şifre/)).not.toBeInTheDocument()
  })
})

describe('SetPassword page (password reset)', () => {
  it('has its own wording, no KVKK tick, and never records consent', async () => {
    const user = userEvent.setup()
    const { router } = renderRoutes(routes, { path: '/sifre-yenile', authState: signedInState(['resident']) })
    expect(screen.getByRole('heading', { level: 1, name: 'Yeni şifre belirleyin' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

    await submit(user, 'yeni-sifre-123')
    await waitFor(() => expect(router.state.location.pathname).toBe('/panel'))
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('shows the invalid-link page without the invite hint', () => {
    renderRoutes(routes, { path: '/sifre-yenile?error=otp_expired', authState: anonymousState })
    expect(screen.getByRole('heading', { level: 1, name: 'Bağlantı geçersiz' })).toBeInTheDocument()
    expect(screen.queryByText(/yeni bir davet isteyin/)).not.toBeInTheDocument()
  })
})
