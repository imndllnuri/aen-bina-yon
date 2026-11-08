import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleAuthRedirect, parseAuthRedirect, routeAfterRedirect } from './auth-redirect'

const mocks = vi.hoisted(() => ({
  configured: true,
  setSession: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocks.configured ? { auth: { setSession: mocks.setSession } } : null
  },
}))

// The shapes below were captured from a real Supabase (local stack, supabase-js 2.119).
const INVITE_HASH =
  '#access_token=eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.sig&expires_at=1794164197&expires_in=3600&refresh_token=abc123&sb=&token_type=bearer&type=invite'
const RECOVERY_HASH = INVITE_HASH.replace('type=invite', 'type=recovery')
const EXPIRED_HASH =
  '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb='

describe('parseAuthRedirect', () => {
  it('reads an invite link', () => {
    expect(parseAuthRedirect(INVITE_HASH, '')).toEqual({
      kind: 'session',
      accessToken: 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.sig',
      refreshToken: 'abc123',
      type: 'invite',
      flow: null,
    })
  })

  it('reads a recovery (password reset) link', () => {
    expect(parseAuthRedirect(RECOVERY_HASH, '')).toMatchObject({ kind: 'session', type: 'recovery' })
  })

  it('reads the ?flow=invite marker the invite function adds (a query string before the hash)', () => {
    expect(parseAuthRedirect(RECOVERY_HASH, '?flow=invite')).toMatchObject({ kind: 'session', type: 'recovery', flow: 'invite' })
    expect(parseAuthRedirect(INVITE_HASH, '?flow=invite')).toMatchObject({ type: 'invite', flow: 'invite' })
  })

  it('ignores any other value of ?flow', () => {
    for (const flow of ['recovery', 'INVITE', '', 'invite<script>', '1']) {
      expect(parseAuthRedirect(RECOVERY_HASH, `?flow=${encodeURIComponent(flow)}`)).toMatchObject({ flow: null })
    }
    expect(parseAuthRedirect(RECOVERY_HASH, '?other=1')).toMatchObject({ flow: null })
  })

  it('reads the error of a used or expired link', () => {
    expect(parseAuthRedirect(EXPIRED_HASH, '')).toEqual({ kind: 'error', code: 'otp_expired' })
  })

  it('also finds an error in the query string', () => {
    expect(parseAuthRedirect('', '?error=access_denied&error_code=otp_expired')).toEqual({
      kind: 'error',
      code: 'otp_expired',
    })
    expect(parseAuthRedirect('', '?error=server_error')).toEqual({ kind: 'error', code: 'server_error' })
  })

  it('keeps only known link types', () => {
    for (const type of ['hacked', '<script>', '', 'INVITE']) {
      const hash = INVITE_HASH.replace('type=invite', `type=${encodeURIComponent(type)}`)
      expect(parseAuthRedirect(hash, '')).toMatchObject({ kind: 'session', type: null })
    }
    expect(parseAuthRedirect(INVITE_HASH.replace('&type=invite', ''), '')).toMatchObject({ kind: 'session', type: null })
  })

  it('never lets odd error codes through (the code is written back into the address bar)', () => {
    expect(parseAuthRedirect('#error_code=OTP%20EXPIRED%3Cscript%3E', '')).toEqual({ kind: 'error', code: 'unknown' })
    expect(parseAuthRedirect(`#error_code=${'a'.repeat(65)}`, '')).toEqual({ kind: 'error', code: 'unknown' })
  })

  it('ignores normal visits and our own routes', () => {
    expect(parseAuthRedirect('', '')).toBeNull()
    expect(parseAuthRedirect('#/giris', '')).toBeNull()
    expect(parseAuthRedirect('#/', '')).toBeNull()
    // Our own error page must not be handled a second time:
    expect(parseAuthRedirect('#/auth/onay?error=otp_expired', '')).toBeNull()
    // Even if tokens are pasted behind a route, they are not a Supabase redirect:
    expect(parseAuthRedirect('#/giris?access_token=a&refresh_token=b', '')).toBeNull()
  })

  it('needs both tokens', () => {
    expect(parseAuthRedirect('#access_token=only-this', '')).toBeNull()
    expect(parseAuthRedirect('#refresh_token=only-this', '')).toBeNull()
    expect(parseAuthRedirect('#access_token=&refresh_token=', '')).toBeNull()
  })
})

describe('routeAfterRedirect', () => {
  const session = { kind: 'session' as const, accessToken: 'a', refreshToken: 'b' }

  it('opens the right page', () => {
    expect(routeAfterRedirect({ ...session, type: 'invite', flow: null })).toBe('/auth/onay')
    expect(routeAfterRedirect({ ...session, type: 'recovery', flow: null })).toBe('/sifre-yenile')
    expect(routeAfterRedirect({ ...session, type: null, flow: null })).toBe('/giris')
    expect(routeAfterRedirect({ ...session, type: 'magiclink', flow: null })).toBe('/giris')
    expect(routeAfterRedirect({ kind: 'error', code: 'otp_expired' })).toBe('/auth/onay?error=otp_expired')
  })

  it('opens the INVITE page for a recovery-type link that carries ?flow=invite (invite clicked before, never finished)', () => {
    expect(routeAfterRedirect({ ...session, type: 'recovery', flow: 'invite' })).toBe('/auth/onay')
    expect(routeAfterRedirect({ ...session, type: null, flow: 'invite' })).toBe('/auth/onay')
  })
})

function visit(hash: string, search = '') {
  window.history.replaceState(null, '', `/aen-bina-yon/${search}${hash}`)
}

describe('handleAuthRedirect', () => {
  beforeEach(() => {
    mocks.configured = true
    mocks.setSession.mockReset().mockResolvedValue({ data: {}, error: null })
    visit('')
  })

  it('does nothing on a normal visit', async () => {
    visit('#/giris')
    await handleAuthRedirect()
    expect(mocks.setSession).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#/giris')
  })

  it('opens the invite page for a recovery link that carries ?flow=invite, and drops the query string', async () => {
    visit(RECOVERY_HASH, '?flow=invite')
    await handleAuthRedirect()
    expect(window.location.hash).toBe('#/auth/onay')
    expect(window.location.search).toBe('')
    expect(mocks.setSession).toHaveBeenCalledTimes(1)
  })

  it('removes the tokens from the address BEFORE saving the session, then opens the invite page', async () => {
    let finish!: (value: unknown) => void
    mocks.setSession.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    visit(INVITE_HASH)

    const done = handleAuthRedirect()

    // setSession has not finished yet, but the address is already clean:
    expect(window.location.href).not.toContain('access_token')
    expect(window.location.href).not.toContain('refresh_token')
    expect(window.location.pathname).toBe('/aen-bina-yon/')
    expect(window.location.hash).toBe('#/auth/onay')

    finish({ data: {}, error: null })
    await done
    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.sig',
      refresh_token: 'abc123',
    })
    expect(window.location.hash).toBe('#/auth/onay')
  })

  it('opens the password-reset page for a recovery link', async () => {
    visit(RECOVERY_HASH)
    await handleAuthRedirect()
    expect(window.location.hash).toBe('#/sifre-yenile')
    expect(mocks.setSession).toHaveBeenCalledTimes(1)
  })

  it('shows the "link is invalid" page for an expired link and saves nothing', async () => {
    visit(EXPIRED_HASH)
    await handleAuthRedirect()
    expect(mocks.setSession).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#/auth/onay?error=otp_expired')
  })

  it('drops an error query string from the address too', async () => {
    visit('', '?error=access_denied&error_code=otp_expired')
    await handleAuthRedirect()
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#/auth/onay?error=otp_expired')
  })

  it('shows the "link is invalid" page when Supabase rejects the tokens', async () => {
    mocks.setSession.mockResolvedValue({ data: {}, error: { message: 'invalid JWT' } })
    visit(INVITE_HASH)
    await handleAuthRedirect()
    expect(window.location.hash).toBe('#/auth/onay?error=invalid_link')
  })

  it('shows the "link is invalid" page when saving the session throws', async () => {
    mocks.setSession.mockRejectedValue(new Error('network'))
    visit(INVITE_HASH)
    await handleAuthRedirect()
    expect(window.location.hash).toBe('#/auth/onay?error=invalid_link')
  })

  it('still cleans the address when this build has no Supabase settings', async () => {
    mocks.configured = false
    visit(INVITE_HASH)
    await handleAuthRedirect()
    expect(mocks.setSession).not.toHaveBeenCalled()
    expect(window.location.href).not.toContain('access_token')
  })
})
