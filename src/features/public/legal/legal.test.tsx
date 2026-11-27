import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { KVKK_VERSION } from '@/config/kvkk'
import { site } from '@/config/site'
import { Kvkk } from '../Kvkk'
import { Cookies } from './Cookies'
import { DistanceSales } from './DistanceSales'
import { Faq } from './Faq'
import { faq } from './faq-data'
import { Kmk, KMK_URL } from './Kmk'
import { DRAFT_NOTE } from './LegalPage'

const show = (page: ReactElement) => render(<MemoryRouter>{page}</MemoryRouter>)

describe('every legal text', () => {
  it.each([
    ['KVKK Aydınlatma Metni', <Kvkk key="k" />],
    ['Çerez Politikası', <Cookies key="c" />],
    ['Mesafeli Satış Sözleşmesi', <DistanceSales key="d" />],
    ['Sıkça Sorulan Sorular', <Faq key="f" />],
    ['Kat Mülkiyeti Kanunu (KMK) hakkında kısa bilgi', <Kmk key="m" />],
  ])('has one title "%s" and the draft warning (a lawyer must review it)', (title, page) => {
    show(page)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(DRAFT_NOTE)
  })
})

describe('KVKK Aydınlatma Metni', () => {
  it('shows its version (the version stored with each person\'s consent)', () => {
    show(<Kvkk />)
    expect(screen.getByText(`Sürüm: ${KVKK_VERSION}`)).toBeInTheDocument()
    expect(KVKK_VERSION).toBe('2026-11-taslak-3')
  })
  it('names the company and its contact details', () => {
    show(<Kvkk />)
    expect(screen.getByText(new RegExp(`veri sorumlusu ${site.name.replace(/[[\]]/g, '\\$&')}`))).toBeInTheDocument()
  })
  it('lists what the portal really stores: forms, accounts, money, requests with photos, announcements, the log', () => {
    show(<Kvkk />)
    for (const word of [/Teklif ve iletişim formları/, /Sakin ve yönetici hesapları/, /Mali bilgiler/, /Talepler/, /fotoğraf/, /Duyuru ve bildirimler/, /İşlem kayıtları/, /Oturum bilgisi/]) {
      expect(screen.getAllByText(word).length).toBeGreaterThan(0)
    }
  })
  it('says honestly that the servers are abroad and that the period is still open', () => {
    show(<Kvkk />)
    expect(screen.getByText(/Sunucular Londra’dadır/)).toBeInTheDocument()
    expect(screen.getByText(/\[SÜRE\]/)).toBeInTheDocument()
  })
  it('has the eight numbered sections and links the cookie policy', () => {
    show(<Kvkk />)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.slice(0, 2))).toEqual(['1.', '2.', '3.', '4.', '5.', '6.', '7.', '8.'])
    expect(screen.getByRole('link', { name: 'Çerez Politikası' })).toHaveAttribute('href', '/cerez-politikasi')
  })
})

describe('Sıkça Sorulan Sorular', () => {
  it('has every question as a closed block that opens with a click', async () => {
    const user = userEvent.setup()
    const { container } = show(<Faq />)
    const blocks = container.querySelectorAll('details')
    expect(blocks).toHaveLength(faq.length)
    expect(faq.length).toBeGreaterThanOrEqual(10)
    const first = blocks[0] as HTMLDetailsElement
    expect(first.open).toBe(false)
    await user.click(within(first).getByText(faq[0]?.question as string))
    expect(first.open).toBe(true)
  })
  it('has unique questions with a real answer', () => {
    expect(new Set(faq.map((f) => f.question)).size).toBe(faq.length)
    for (const item of faq) expect(item.answer.length).toBeGreaterThan(40)
  })
  it('says the card payment is a test in this demo, and who can see what', () => {
    show(<Faq />)
    expect(screen.getByText(/gerçek para çekmez/)).toBeInTheDocument()
    expect(screen.getByText(/Kiracı, yalnızca yönetimin kiracıya yansıttığı/)).toBeInTheDocument()
  })
  it('links to the contact page', () => {
    show(<Faq />)
    expect(screen.getByRole('link', { name: 'bize yazın' })).toHaveAttribute('href', '/iletisim')
  })
})

describe('Çerez Politikası', () => {
  it('says the site sets no cookies and tracks nothing, and names what it stores', () => {
    show(<Cookies />)
    expect(screen.getByText('çerez (cookie) kullanmaz')).toBeInTheDocument()
    expect(screen.getByText(/reklam, analiz ya da izleme amacıyla hiçbir veri toplamaz/)).toBeInTheDocument()
    expect(screen.getByText('Oturum bilgisi:')).toBeInTheDocument()
    expect(screen.getByText('“Beni hatırla” tercihi:')).toBeInTheDocument()
    expect(screen.getByText('Seçili daire:')).toBeInTheDocument()
  })
  it('links the KVKK text', () => {
    show(<Cookies />)
    expect(screen.getByRole('link', { name: 'KVKK Aydınlatma Metni' })).toHaveAttribute('href', '/kvkk')
  })
})

describe('Mesafeli Satış Sözleşmesi', () => {
  it('names the seller, the 14-day right to withdraw and the dispute bodies', () => {
    show(<DistanceSales />)
    expect(screen.getByText(new RegExp(site.email))).toBeInTheDocument()
    expect(screen.getByText(/14 gün içinde gerekçe göstermeksizin/)).toBeInTheDocument()
    expect(screen.getByText(/Tüketici Hakem Heyetleri/)).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(9)
  })
  it('says that dues are not a sale, and links the KMK page and the KVKK text', () => {
    show(<DistanceSales />)
    expect(screen.getByText(/bu sözleşme kapsamında bir “satış” değildir/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'KMK bilgi sayfasına' })).toHaveAttribute('href', '/kat-mulkiyeti-kanunu')
    expect(screen.getByRole('link', { name: 'KVKK Aydınlatma Metni' })).toHaveAttribute('href', '/kvkk')
  })
  it('leaves the open facts visible as [BRACKETS] for the lawyer', () => {
    show(<DistanceSales />)
    expect(screen.getAllByText(/\[[A-ZÇĞİÖŞÜ ]+\]/).length).toBeGreaterThan(0)
  })
})

describe('KMK bilgi sayfası', () => {
  it('links the official law text in a new tab, safely', () => {
    show(<Kmk />)
    const link = screen.getByRole('link', { name: /mevzuat\.gov\.tr/ })
    expect(link).toHaveAttribute('href', KMK_URL)
    expect(KMK_URL).toBe('https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=634&MevzuatTur=1&MevzuatTertip=3')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })
  it('says it is information and not legal advice, and names the 5 % late fee of article 20', () => {
    show(<Kmk />)
    expect(screen.getByText(/hukuki danışmanlık değildir/)).toBeInTheDocument()
    expect(screen.getByText(/%5 oranında gecikme tazminatı öngörür \(md\. 20\)/)).toBeInTheDocument()
  })
})
