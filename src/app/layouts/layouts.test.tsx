import { render, screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { AdminLayout } from '@/app/layouts/AdminLayout'
import { PublicLayout } from '@/app/layouts/PublicLayout'
import { ResidentLayout } from '@/app/layouts/ResidentLayout'
import { AppProviders } from '@/app/providers'
import { site } from '@/config/site'

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

describe('PublicLayout', () => {
  it('has the legal links in the footer: SSS, KVKK, Çerez, Mesafeli Satış, KMK', () => {
    mountLayout(<PublicLayout />, '/')
    const nav = screen.getByRole('navigation', { name: 'Yasal' })
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['SSS', '/sss'],
      ['KVKK Aydınlatma Metni', '/kvkk'],
      ['Çerez Politikası', '/cerez-politikasi'],
      ['Mesafeli Satış Sözleşmesi', '/mesafeli-satis'],
      ['KMK Bilgi', '/kat-mulkiyeti-kanunu'],
    ])
  })
  it('has a floating WhatsApp button that opens the company number in a new tab, and hides it on paper', () => {
    mountLayout(<PublicLayout />, '/')
    const button = screen.getByRole('link', { name: 'WhatsApp ile yazın' })
    expect(button).toHaveAttribute('href', `https://wa.me/${site.whatsapp}`)
    expect(button).toHaveAttribute('target', '_blank')
    expect(button.getAttribute('rel')).toContain('noopener')
    expect(button.className).toContain('fixed')
    expect(button.className).toContain('print:hidden')
  })
  it('shows no WhatsApp button inside the resident and admin panels', () => {
    mountLayout(<AdminLayout />, '/yonetim')
    expect(screen.queryByRole('link', { name: 'WhatsApp ile yazın' })).not.toBeInTheDocument()
  })
  it('shows no WhatsApp button in the resident panel either', () => {
    mountLayout(<ResidentLayout />, '/panel')
    expect(screen.queryByRole('link', { name: 'WhatsApp ile yazın' })).not.toBeInTheDocument()
  })
  it('keeps the footer links clear of the round button (extra space at the bottom)', () => {
    mountLayout(<PublicLayout />, '/')
    const nav = screen.getByRole('navigation', { name: 'Yasal' })
    expect(nav.parentElement?.className).toContain('pb-20')
  })
})

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

  it('has "Yöneticiler" in the Kişiler group, next to Sakinler', () => {
    mountLayout(<AdminLayout />, '/yonetim/daireler')
    const menu = screen.getAllByRole('navigation', { name: 'Ana menü' })[0] as HTMLElement
    expect(within(menu).getByRole('link', { name: 'Yöneticiler' })).toHaveAttribute('href', '/yonetim/yoneticiler')
    expect(within(menu).getByRole('link', { name: 'Sakinler' })).toHaveAttribute('href', '/yonetim/sakinler')
  })

  it('has "Gecikme Tazminatı" in the Finans group, after Havale Onayları', () => {
    mountLayout(<AdminLayout />, '/yonetim/daireler')
    const menu = screen.getAllByRole('navigation', { name: 'Ana menü' })[0] as HTMLElement
    const links = within(menu).getAllByRole('link').map((a) => a.textContent)
    expect(within(menu).getByRole('link', { name: 'Gecikme Tazminatı' })).toHaveAttribute('href', '/yonetim/gecikme-tazminati')
    expect(links.indexOf('Gecikme Tazminatı')).toBe(links.indexOf('Havale Onayları') + 1)
  })

  it('has "İletişim Mesajları" in the İletişim group', () => {
    mountLayout(<AdminLayout />, '/yonetim/daireler')
    const menu = screen.getAllByRole('navigation', { name: 'Ana menü' })[0] as HTMLElement
    expect(within(menu).getByRole('link', { name: 'İletişim Mesajları' })).toHaveAttribute('href', '/yonetim/mesajlar')
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
