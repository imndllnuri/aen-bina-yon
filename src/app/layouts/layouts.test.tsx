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
    // the pages of slice 10
    expect(within(sidebar).getByRole('link', { name: 'Raporlar' })).toHaveAttribute('href', '/yonetim/raporlar')
    expect(within(sidebar).getByRole('link', { name: 'Ayarlar' })).toHaveAttribute('href', '/yonetim/ayarlar')
    expect(within(sidebar).getByRole('link', { name: 'İşlem Geçmişi' })).toHaveAttribute('href', '/yonetim/islem-gecmisi')
    expect(within(sidebar).getByRole('link', { name: 'Teklif Talepleri' })).toHaveAttribute('href', '/yonetim/teklif-talepleri')
    expect(screen.getByRole('button', { name: /Çıkış/ })).toBeInTheDocument()
    expect(screen.getByText('sayfa içeriği')).toBeInTheDocument()
  })

  it('hides the menu and the header on paper (reports are printed from here)', () => {
    mountLayout(<AdminLayout />, '/yonetim/raporlar')
    expect(screen.getAllByRole('navigation', { name: 'Ana menü' })[0]?.closest('aside')?.className).toContain('print:hidden')
    expect(screen.getByRole('banner').className).toContain('print:hidden')
  })

  it('has the bell in the header, pointing to the admin\'s own Bildirimler page', () => {
    mountLayout(<AdminLayout />, '/yonetim/daireler')
    expect(screen.getByRole('link', { name: 'Bildirimler' })).toHaveAttribute('href', '/yonetim/bildirimler')
  })

  it('has "Profilim" in the side menu and as a button in the header (the side menu is hidden on a phone)', () => {
    mountLayout(<AdminLayout />, '/yonetim/daireler')
    const inMenu = within(screen.getAllByRole('navigation', { name: 'Ana menü' })[0] as HTMLElement).getByRole('link', { name: 'Profilim' })
    expect(inMenu).toHaveAttribute('href', '/yonetim/profil')
    const button = within(screen.getByRole('banner')).getByRole('link', { name: 'Profilim' })
    expect(button).toHaveAttribute('href', '/yonetim/profil')
    // on a phone the header button must show: it is hidden only from the size where the side menu takes over
    for (let el: HTMLElement | null = button; el; el = el.parentElement) {
      expect(el.classList.contains('hidden') || el.classList.contains('max-lg:hidden') || el.classList.contains('max-md:hidden')).toBe(false)
    }
    expect(button.className).toContain('lg:hidden')
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

  it('has a "Profilim" button in the header for phones (the bottom bar has no room for it; desktop has it in the side menu)', () => {
    mountLayout(<ResidentLayout />, '/borclarim')
    const button = screen.getByRole('link', { name: 'Profilim' })
    expect(button).toHaveAttribute('href', '/profil')
    expect(button.closest('header')).not.toBeNull()
    // visible on a phone: nothing around it is hidden below the md size (it is only "md:hidden", because the side menu takes over)
    for (let el: HTMLElement | null = button; el; el = el.parentElement) {
      expect(el.classList.contains('hidden') || el.classList.contains('max-md:hidden') || el.classList.contains('max-sm:hidden')).toBe(false)
    }
    expect(button.className).toContain('md:hidden')
    // and the side menu still has its own "Profil" entry
    expect(within(screen.getByRole('navigation', { name: 'Ana menü' })).getByRole('link', { name: 'Profil' })).toHaveAttribute('href', '/profil')
  })

  it('has the bell in the header on every screen size (the phone bar has only five fixed tabs)', () => {
    mountLayout(<ResidentLayout />, '/borclarim')
    const bell = screen.getByRole('link', { name: 'Bildirimler' })
    expect(bell).toHaveAttribute('href', '/bildirimler')
    expect(bell.closest('header')).not.toBeNull()
    // not inside anything that is hidden on small screens (a plain "hidden" class, or "max-md:hidden")
    for (let el: HTMLElement | null = bell; el; el = el.parentElement) {
      expect(el.classList.contains('hidden') || el.classList.contains('max-md:hidden') || el.classList.contains('max-sm:hidden')).toBe(false)
    }
  })
})
