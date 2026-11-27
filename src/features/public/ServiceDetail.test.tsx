import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ServiceDetail } from './ServiceDetail'
import { Services } from './Services'
import { services } from './services-data'

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/hizmetler" element={<Services />} />
        <Route path="/hizmetler/:slug" element={<ServiceDetail />} />
      </Routes>
    </MemoryRouter>,
  )

describe('the services data', () => {
  it('has six services with their own address, a long text and a short list', () => {
    expect(services).toHaveLength(6)
    expect(new Set(services.map((s) => s.slug)).size).toBe(6)
    for (const s of services) {
      expect(s.slug).toMatch(/^[a-z]+(-[a-z]+)*$/) // safe in an address: lower case letters and dashes
      expect(s.details.length).toBeGreaterThanOrEqual(2)
      expect(s.points.length).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('Hizmetler grid', () => {
  it('links every card to its own detail page', () => {
    at('/hizmetler')
    for (const s of services) expect(screen.getByRole('link', { name: `${s.title}: ayrıntılar` })).toHaveAttribute('href', `/hizmetler/${s.slug}`)
  })
})

describe('a service detail page', () => {
  it.each(services.map((s) => [s.title, s.slug] as const))('shows "%s" with its text, its list and a way back', (title, slug) => {
    at(`/hizmetler/${slug}`)
    const service = services.find((s) => s.slug === slug)!
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.getByText(service.text)).toBeInTheDocument()
    for (const paragraph of service.details) expect(screen.getByText(paragraph)).toBeInTheDocument()
    for (const point of service.points) expect(screen.getByText(point)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tüm hizmetler/ })).toHaveAttribute('href', '/hizmetler')
    expect(screen.getByRole('link', { name: 'Teklif Al' })).toHaveAttribute('href', '/teklif-al')
  })
  it('lists the OTHER five services (not itself) as links', () => {
    at(`/hizmetler/${services[0]?.slug}`)
    const section = screen.getByRole('heading', { name: 'Diğer hizmetler' }).nextElementSibling as HTMLElement
    const links = within(section).getAllByRole('link')
    expect(links).toHaveLength(5)
    expect(links.map((l) => l.getAttribute('href'))).not.toContain(`/hizmetler/${services[0]?.slug}`)
  })
  it('shows the "not found" page for an address no service has', () => {
    at('/hizmetler/yok-boyle-bir-hizmet')
    expect(screen.getByRole('heading', { name: 'Sayfa bulunamadı' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Aidat ve Tahsilat' })).not.toBeInTheDocument()
  })
})
