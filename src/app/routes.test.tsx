import { render, screen } from '@testing-library/react'
import { createMemoryRouter, matchRoutes } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { AppProviders } from '@/app/providers'
import { routes } from '@/app/routes'
import { site } from '@/config/site'

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
  ])('renders the public page %s', (path, heading) => {
    renderAt(path)
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
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

  it.each(['/taleplerim/yeni', '/taleplerim/abc', '/yonetim/talepler/abc', '/profil', '/yonetim/profil'])('sends a logged-out visitor from %s to the login page', async (path) => {
    const router = renderAt(path)
    expect(await screen.findByRole('heading', { level: 1, name: 'Giriş yap' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/giris')
  })
})
