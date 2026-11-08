import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_QUERY_KEY } from '@/lib/auth'
import { anonymousState, renderRoutes, signedInState } from '@/test/render'
import { Login } from './Login'

const mocks = vi.hoisted(() => ({
  configured: true,
  auth: {
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
  },
  loadAuthState: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocks.configured ? { auth: mocks.auth } : null
  },
  get isSupabaseConfigured() {
    return mocks.configured
  },
}))

// Login calls loadAuthState() right after signing in. Fake it, so we choose the person's roles.
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>()
  return { ...actual, loadAuthState: mocks.loadAuthState }
})

const routes = [
  { path: '/giris', element: <Login /> },
  { path: '/yonetim', element: <p>YÖNETİM ANA SAYFA</p> },
  { path: '/panel', element: <p>SAKİN ANA SAYFA</p> },
]

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  mocks.configured = true
  mocks.auth.signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null })
  mocks.auth.signOut.mockReset().mockResolvedValue({ error: null })
  mocks.auth.getSession.mockReset()
  mocks.loadAuthState.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, password = 'dogru-sifre-1') {
  await user.type(screen.getByRole('textbox', { name: 'E-posta' }), 'kisi@ornek.com')
  await user.type(screen.getByLabelText('Şifre'), password)
  await user.click(screen.getByRole('button', { name: 'Giriş yap' }))
}

describe('Login page', () => {
  it('sends an admin to the admin panel after login', async () => {
    mocks.loadAuthState.mockResolvedValue(signedInState(['admin']))
    const user = userEvent.setup()
    const { router } = renderRoutes(routes, { path: '/giris', authState: anonymousState })

    await fillAndSubmit(user)

    await waitFor(() => expect(router.state.location.pathname).toBe('/yonetim'))
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'kisi@ornek.com', password: 'dogru-sifre-1' })
    expect(await screen.findByText('YÖNETİM ANA SAYFA')).toBeInTheDocument()
  })

  it('sends a resident to the resident panel after login', async () => {
    mocks.loadAuthState.mockResolvedValue(signedInState(['resident']))
    const user = userEvent.setup()
    const { router } = renderRoutes(routes, { path: '/giris', authState: anonymousState })

    await fillAndSubmit(user)

    await waitFor(() => expect(router.state.location.pathname).toBe('/panel'))
  })

  it('shows one calm message for a wrong password and stays on the page', async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials', status: 400 } })
    const user = userEvent.setup()
    const { router } = renderRoutes(routes, { path: '/giris', authState: anonymousState })

    await fillAndSubmit(user, 'yanlis-sifre')

    expect(await screen.findByText('E-posta adresi veya şifre hatalı.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/giris')
    expect(mocks.loadAuthState).not.toHaveBeenCalled()
  })

  it('explains rate limiting', async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'over_request_rate_limit', status: 429 } })
    const user = userEvent.setup()
    renderRoutes(routes, { path: '/giris', authState: anonymousState })
    await fillAndSubmit(user)
    expect(await screen.findByText(/Çok fazla deneme yapıldı/)).toBeInTheDocument()
  })

  it('shows a network problem without crashing', async () => {
    mocks.auth.signInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    renderRoutes(routes, { path: '/giris', authState: anonymousState })
    await fillAndSubmit(user)
    expect(await screen.findByText(/İşlem şu anda yapılamadı/)).toBeInTheDocument()
  })

  it('asks for both fields and sends nothing when the form is empty', async () => {
    const user = userEvent.setup()
    renderRoutes(routes, { path: '/giris', authState: anonymousState })
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }))
    expect(await screen.findByText('E-posta adresinizi yazın.')).toBeInTheDocument()
    expect(screen.getByText('Şifrenizi yazın.')).toBeInTheDocument()
    expect(mocks.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('chooses where to keep the session BEFORE signing in ("Beni hatırla" off -> this tab only)', async () => {
    let flagWhenSigningIn: string | null = 'not-called'
    mocks.auth.signInWithPassword.mockImplementation(async () => {
      flagWhenSigningIn = localStorage.getItem('aen-remember-me')
      return { data: {}, error: null }
    })
    mocks.loadAuthState.mockResolvedValue(signedInState(['resident']))
    const user = userEvent.setup()
    renderRoutes(routes, { path: '/giris', authState: anonymousState })

    await user.click(screen.getByRole('checkbox', { name: 'Beni hatırla' })) // on by default -> off
    await fillAndSubmit(user)

    await waitFor(() => expect(mocks.auth.signInWithPassword).toHaveBeenCalled())
    expect(flagWhenSigningIn).toBe('0')
  })

  it('has the checkbox ticked by default', () => {
    renderRoutes(routes, { path: '/giris', authState: anonymousState })
    expect(screen.getByRole('checkbox', { name: 'Beni hatırla' })).toBeChecked()
  })

  it('links to "Şifremi unuttum"', () => {
    renderRoutes(routes, { path: '/giris', authState: anonymousState })
    expect(screen.getByRole('link', { name: 'Şifremi unuttum' })).toHaveAttribute('href', '/sifremi-unuttum')
  })

  it('forwards someone who is already signed in', async () => {
    const { router } = renderRoutes(routes, { path: '/giris', authState: signedInState(['admin']) })
    await waitFor(() => expect(router.state.location.pathname).toBe('/yonetim'))
  })

  it('does NOT redirect a signed-in person without roles (no loop); offers logout instead', async () => {
    const user = userEvent.setup()
    const { router, queryClient } = renderRoutes(routes, { path: '/giris', authState: signedInState([], 'bos@ornek.com') })

    expect(await screen.findByText('Hesabınız henüz bağlanmamış')).toBeInTheDocument()
    expect(screen.getByText('bos@ornek.com')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/giris')

    await user.click(screen.getByRole('button', { name: 'Çıkış yap' }))
    // Only THIS device is signed out, and the cached state is reset before leaving:
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toMatchObject({ status: 'anonymous' })
    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument()
  })

  it('still resets the state and leaves when the sign-out request itself fails', async () => {
    mocks.auth.signOut.mockRejectedValue(new Error('network'))
    const user = userEvent.setup()
    const { queryClient } = renderRoutes(routes, { path: '/giris', authState: signedInState([]) })
    await user.click(await screen.findByRole('button', { name: 'Çıkış yap' }))
    await waitFor(() => expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toMatchObject({ status: 'anonymous' }))
  })

  it('shows a "try again" card (and no redirect) when the roles cannot be loaded', async () => {
    mocks.auth.getSession.mockRejectedValue(new Error('network'))
    const { router } = renderRoutes(routes, { path: '/giris' }) // nothing cached: it has to load
    expect(await screen.findByText('Hesap bilgileri yüklenemedi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Çıkış yap' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/giris')
  })

  it('disables the form and explains when this build has no Supabase settings', async () => {
    mocks.configured = false
    renderRoutes(routes, { path: '/giris', authState: { status: 'unconfigured', session: null, roles: [] } })
    expect(await screen.findByText(/Sunucu bağlantısı henüz kurulmadı/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Giriş yap' })).toBeDisabled()
  })

  it('has a button to show and hide the password', async () => {
    const user = userEvent.setup()
    renderRoutes(routes, { path: '/giris', authState: anonymousState })
    const field = screen.getByLabelText('Şifre')
    expect(field).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Şifreyi göster' }))
    expect(field).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Şifreyi gizle' })).toHaveAttribute('aria-pressed', 'true')
  })
})
