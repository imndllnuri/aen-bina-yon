import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, matchRoutes } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { AppProviders } from '@/app/providers'
import { routes } from '@/app/routes'
import { site } from '@/config/site'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AUTH_QUERY_KEY } from '@/lib/auth'
import { signedInState } from '@/test/render'

// The real app uses a hash router. Tests run the same route table in memory.
function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return router
}

/** The whole route table, with a signed-in person already in the cache (the panels need the theme and tooltip providers). */
function renderSignedIn(path: string, role: 'admin' | 'resident') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  queryClient.setQueryData(AUTH_QUERY_KEY, signedInState([role]))
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  )
  return router
}

describe('routes', () => {
  it('shows the public home page with the slogan and the Demo badge', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { level: 1, name: site.slogan })).toBeInTheDocument()
    expect(screen.getAllByText('Demo').length).toBeGreaterThan(0)
  })

  it.each([
    ['/iletisim', 'İletişim'],
    ['/hizmetler', 'Hizmetlerimiz'],
    ['/teklif-al', 'Teklif Al'],
    ['/kvkk', 'KVKK Aydınlatma Metni'],
    ['/sss', 'Sıkça Sorulan Sorular'],
    ['/cerez-politikasi', 'Çerez Politikası'],
    ['/mesafeli-satis', 'Mesafeli Satış Sözleşmesi'],
    ['/kat-mulkiyeti-kanunu', 'Kat Mülkiyeti Kanunu (KMK) hakkında kısa bilgi'],
    ['/hizmetler/aidat-ve-tahsilat', 'Aidat ve Tahsilat'],
  ])('renders the public page %s', (path, heading) => {
    renderAt(path)
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  it('shows the 404 page for a service address that does not exist', () => {
    renderAt('/hizmetler/yok-boyle-bir-hizmet')
    expect(screen.getByRole('heading', { name: 'Sayfa bulunamadı' })).toBeInTheDocument()
  })

  it('sends a logged-out visitor from the admin panel to the login page', async () => {
    const router = renderAt('/yonetim')
    expect(await screen.findByRole('heading', { level: 1, name: 'Giriş yap' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/giris')
  })

  it('sends a logged-out visitor from the resident panel to the login page', async () => {
    const router = renderAt('/borclarim')
    expect(await screen.findByRole('heading', { level: 1, name: 'Giriş yap' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/giris')
  })

  it('shows a 404 page for unknown addresses', () => {
    renderAt('/yok-boyle-bir-sayfa')
    expect(screen.getByRole('heading', { name: 'Sayfa bulunamadı' })).toBeInTheDocument()
  })

  it.each([
    ['/taleplerim', '/taleplerim'],
    ['/taleplerim/yeni', '/taleplerim/yeni'],
    ['/taleplerim/3f2b8c1e-aaaa-bbbb-cccc-123456789012', '/taleplerim/:id'],
    ['/yonetim/talepler', 'talepler'],
    ['/yonetim/talepler/3f2b8c1e-aaaa-bbbb-cccc-123456789012', 'talepler/:id'],
    ['/profil', '/profil'],
    ['/yonetim/profil', 'profil'],
  ])('has its own page for the request address %s (not a placeholder, not "not found")', (path, route) => {
    const matches = matchRoutes(routes, path)
    expect(matches?.at(-1)?.route.path).toBe(route)
    expect(matches?.at(-1)?.route.element).toBeDefined()
    // the page is a real component, not the generic placeholder
    expect((matches?.at(-1)?.route.element as { type: { name?: string } }).type.name).not.toBe('PlaceholderPage')
  })

  it.each([
    ['/profil', 'resident'],
    ['/yonetim/profil', 'admin'],
  ] as const)('opens the real Profil page at %s for a signed-in %s (the panel menu and the page title are there)', async (path, role) => {
    renderSignedIn(path, role)
    expect(await screen.findByRole('heading', { level: 1, name: 'Profilim' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Çıkış/ })).toBeInTheDocument() // inside the panel layout
  })

  it.each(['/taleplerim/yeni', '/taleplerim/abc', '/yonetim/talepler/abc', '/profil', '/yonetim/profil', '/yonetim/mesajlar'])('sends a logged-out visitor from %s to the login page', async (path) => {
    const router = renderAt(path)
    expect(await screen.findByRole('heading', { level: 1, name: 'Giriş yap' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/giris')
  })
})
