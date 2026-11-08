import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { anonymousState, renderRoutes } from '@/test/render'
import { ForgotPassword } from './ForgotPassword'

const mocks = vi.hoisted(() => ({
  configured: true,
  auth: { resetPasswordForEmail: vi.fn() },
}))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocks.configured ? { auth: mocks.auth } : null
  },
  get isSupabaseConfigured() {
    return mocks.configured
  },
}))

const routes = [{ path: '/sifremi-unuttum', element: <ForgotPassword /> }, { path: '/giris', element: <p>GİRİŞ</p> }]

beforeEach(() => {
  mocks.configured = true
  mocks.auth.resetPasswordForEmail.mockReset().mockResolvedValue({ data: {}, error: null })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

async function submit(email = 'kisi@ornek.com') {
  const user = userEvent.setup()
  renderRoutes(routes, { path: '/sifremi-unuttum', authState: anonymousState })
  await user.type(screen.getByRole('textbox', { name: 'E-posta' }), email)
  await user.click(screen.getByRole('button', { name: 'Bağlantı gönder' }))
}

const SAME_MESSAGE = /Bu e-posta adresiyle kayıtlı bir hesap varsa/

describe('ForgotPassword page', () => {
  it('asks Supabase to send the link back to this site (on the allowed redirect list)', async () => {
    await submit()
    expect(await screen.findByText(SAME_MESSAGE)).toBeInTheDocument()
    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1)
    const [email, options] = mocks.auth.resetPasswordForEmail.mock.calls[0]
    expect(email).toBe('kisi@ornek.com')
    expect(options.redirectTo).toBe(`${window.location.origin}${import.meta.env.BASE_URL}`)
    expect(options.redirectTo.endsWith('/')).toBe(true)
  })

  it('gives the same answer when the address has no account (Supabase also answers "ok")', async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    await submit('yok-boyle-biri@ornek.com')
    expect(await screen.findByText(SAME_MESSAGE)).toBeInTheDocument()
  })

  it('does not reveal that the free e-mail service refused an outside address', async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { code: 'email_address_not_authorized', status: 400 },
    })
    await submit('baska@ornek.com')
    expect(await screen.findByText(SAME_MESSAGE)).toBeInTheDocument()
  })

  it('reports the rate limit (it does not depend on the address)', async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { code: 'over_email_send_rate_limit', status: 429 },
    })
    await submit()
    expect(await screen.findByText(/Çok fazla deneme yapıldı/)).toBeInTheDocument()
    expect(screen.queryByText(SAME_MESSAGE)).not.toBeInTheDocument()
  })

  it('reports a network problem', async () => {
    mocks.auth.resetPasswordForEmail.mockRejectedValue(new TypeError('Failed to fetch'))
    await submit()
    expect(await screen.findByText(/İşlem şu anda yapılamadı/)).toBeInTheDocument()
  })

  it('checks the e-mail shape and sends nothing', async () => {
    await submit('bu-bir-eposta-degil')
    expect(await screen.findByText('Geçerli bir e-posta adresi yazın.')).toBeInTheDocument()
    expect(mocks.auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('says so when this build has no Supabase settings', async () => {
    mocks.configured = false
    await submit()
    expect(await screen.findByText(/Sunucu bağlantısı henüz kurulmadı/)).toBeInTheDocument()
  })
})
