import { render, screen } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
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

  it('renders a public placeholder page', () => {
    renderAt('/iletisim')
    expect(screen.getByRole('heading', { level: 1, name: 'İletişim' })).toBeInTheDocument()
  })

  it('sends a logged-out visitor from the admin panel to the login page', async () => {
    const router = renderAt('/yonetim')
    expect(await screen.findByText(/Giriş formu yapım aşamasında/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/giris')
  })

  it('sends a logged-out visitor from the resident panel to the login page', async () => {
    const router = renderAt('/borclarim')
    expect(await screen.findByText(/Giriş formu yapım aşamasında/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/giris')
  })

  it('shows a 404 page for unknown addresses', () => {
    renderAt('/yok-boyle-bir-sayfa')
    expect(screen.getByRole('heading', { name: 'Sayfa bulunamadı' })).toBeInTheDocument()
  })
})
