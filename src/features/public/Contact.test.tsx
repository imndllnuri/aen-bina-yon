import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { site } from '@/config/site'
import { mapsUrl } from '@/lib/maps'
import { Contact } from './Contact'

vi.mock('@/lib/supabase', () => ({ supabase: null }))

const show = () =>
  render(
    <MemoryRouter>
      <Contact />
    </MemoryRouter>,
  )

describe('İletişim page', () => {
  it('has the contact form under the contact details', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'İletişim' })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'İletişim formu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mesajı gönder' })).toBeInTheDocument()
  })
  it('has a "Haritada aç" link that searches the address in a new tab, safely', () => {
    show()
    const link = screen.getByRole('link', { name: 'Haritada aç' })
    expect(link).toHaveAttribute('href', mapsUrl(site.address))
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })
  it('keeps the phone, WhatsApp and e-mail links', () => {
    show()
    expect(screen.getByRole('link', { name: site.phone })).toHaveAttribute('href', `tel:${site.phone.replace(/\s/g, '')}`)
    expect(screen.getByRole('link', { name: 'WhatsApp ile yazın' })).toHaveAttribute('href', `https://wa.me/${site.whatsapp}`)
    expect(screen.getByRole('link', { name: site.email })).toHaveAttribute('href', `mailto:${site.email}`)
  })
})
