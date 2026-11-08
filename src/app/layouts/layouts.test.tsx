import { render, screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { AdminLayout } from '@/app/layouts/AdminLayout'
import { ResidentLayout } from '@/app/layouts/ResidentLayout'
import { AppProviders } from '@/app/providers'

// The panels sit behind the login guard, so we mount the layouts directly here
// (a real login needs a Supabase project). This checks menus and structure only.
function mountLayout(layout: ReactElement, path: string) {
  const router = createMemoryRouter(
    [{ element: layout, children: [{ path: '*', element: <p>sayfa içeriği</p> }] }],
    { initialEntries: [path] },
  )
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
}

describe('AdminLayout', () => {
  it('shows the plan’s sidebar groups and a sign-out button', () => {
    mountLayout(<AdminLayout />, '/yonetim/daireler')
    const sidebar = screen.getAllByRole('navigation', { name: 'Ana menü' })[0]
    for (const group of ['Yapı', 'Kişiler', 'Finans', 'İletişim', 'Operasyon', 'Sistem']) {
      expect(within(sidebar).getByText(group)).toBeInTheDocument()
    }
    expect(within(sidebar).getByRole('link', { name: 'Daireler' })).toHaveAttribute('href', '/yonetim/daireler')
    expect(within(sidebar).getByRole('link', { name: 'Genel Bakış' })).toHaveAttribute('href', '/yonetim')
    expect(screen.getByRole('button', { name: /Çıkış/ })).toBeInTheDocument()
    expect(screen.getByText('sayfa içeriği')).toBeInTheDocument()
  })
})

describe('ResidentLayout', () => {
  it('has a sidebar for desktop and a five-tab bottom bar for phones', () => {
    mountLayout(<ResidentLayout />, '/borclarim')
    const tabBar = screen.getByRole('navigation', { name: 'Alt menü' })
    expect(within(tabBar).getAllByRole('link')).toHaveLength(5)
    expect(within(tabBar).getByRole('link', { name: 'Borçlarım' })).toHaveAttribute('aria-current', 'page')

    const sidebar = screen.getByRole('navigation', { name: 'Ana menü' })
    expect(within(sidebar).getAllByRole('link')).toHaveLength(8)
    expect(screen.getByRole('button', { name: /Çıkış/ })).toBeInTheDocument()
  })
})
