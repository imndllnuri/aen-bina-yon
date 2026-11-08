import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { anonymousState, renderRoutes, signedInState } from '@/test/render'
import { SetPassword } from './SetPassword'

const mocks = vi.hoisted(() => ({
  auth: { updateUser: vi.fn() },
}))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return { auth: mocks.auth }
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
})

async function setPassword(user: ReturnType<typeof userEvent.setup>, password: string, confirm = password) {
  await user.type(screen.getByLabelText(/^Yeni şifre\s*\*?$/), password)
  await user.type(screen.getByLabelText(/Yeni şifre \(tekrar\)/), confirm)
  await user.click(screen.getByRole('button', { name: /kaydet/ }))
}

describe('SetPassword page (invite)', () => {
  it('shows whose account is being activated', () => {
    renderRoutes(routes, { path: '/auth/onay', authState: signedInState(['resident'], 'yeni@ornek.com') })
    expect(screen.getByRole('heading', { level: 1, name: 'Hesabınızı etkinleştirin' })).toBeInTheDocument()
    expect(screen.getByText('yeni@ornek.com')).toBeInTheDocument()
  })

  it('saves the password and sends a resident to the resident panel', async () => {
    const user = userEvent.setup()
    const { router } = renderRoutes(routes, { path: '/auth/onay', authState: signedInState(['resident']) })

    await setPassword(user, 'yeni-sifre-123')

    await waitFor(() => expect(router.state.location.pathname).toBe('/panel'))
    expect(mocks.auth.updateUser).toHaveBeenCalledWith({ password: 'yeni-sifre-123' })
    expect(await screen.findByText('SAKİN ANA SAYFA')).toBeInTheDocument()
  })

  it('sends an admin to the admin panel', async () => {
    const user = userEvent.setup()
    const { router } = renderRoutes(routes, { path: '/auth/onay', authState: signedInState(['admin']) })
    await setPassword(user, 'yeni-sifre-123')
    await waitFor(() => expect(router.state.location.pathname).toBe('/yonetim'))
  })

  it('rejects a short password and a mismatch without calling Supabase', async () => {
    const user = userEvent.setup()
    renderRoutes(routes, { path: '/auth/onay', authState: signedInState(['resident']) })

    await setPassword(user, '1234567')
    expect(await screen.findByText('Şifre en az 8 karakter olmalı.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/^Yeni şifre\s*\*?$/))
    await user.clear(screen.getByLabelText(/Yeni şifre \(tekrar\)/))
    await setPassword(user, '12345678', 'farkli-sifre')
    expect(await screen.findByText('Şifreler aynı değil.')).toBeInTheDocument()
    expect(mocks.auth.updateUser).not.toHaveBeenCalled()
  })

  it.each([
    ['same_password', /eski şifrenizle aynı olamaz/],
    ['weak_password', /çok zayıf/],
  ])('shows a clear message for %s and stays on the page', async (code, message) => {
    mocks.auth.updateUser.mockResolvedValue({ data: {}, error: { code, status: 422 } })
    const user = userEvent.setup()
    const { router } = renderRoutes(routes, { path: '/auth/onay', authState: signedInState(['resident']) })
    await setPassword(user, 'yeni-sifre-123')
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/auth/onay')
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
  it('has its own wording and does not mention invites', () => {
    renderRoutes(routes, { path: '/sifre-yenile', authState: signedInState(['resident']) })
    expect(screen.getByRole('heading', { level: 1, name: 'Yeni şifre belirleyin' })).toBeInTheDocument()
  })

  it('shows the invalid-link page without the invite hint', () => {
    renderRoutes(routes, { path: '/sifre-yenile?error=otp_expired', authState: anonymousState })
    expect(screen.getByRole('heading', { level: 1, name: 'Bağlantı geçersiz' })).toBeInTheDocument()
    expect(screen.queryByText(/yeni bir davet isteyin/)).not.toBeInTheDocument()
  })
})
