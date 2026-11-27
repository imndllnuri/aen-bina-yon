import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactForm } from './ContactForm'

const mocks = vi.hoisted(() => ({ configured: true, insert: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocks.configured ? { from: mocks.from } : null
  },
}))

beforeEach(() => {
  mocks.configured = true
  mocks.insert.mockReset().mockResolvedValue({ error: null })
  mocks.from.mockReset().mockImplementation(() => ({ insert: mocks.insert }))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

function setup() {
  const user = userEvent.setup()
  const view = render(
    <MemoryRouter>
      <ContactForm />
    </MemoryRouter>,
  )
  return { user, ...view }
}
type User = ReturnType<typeof userEvent.setup>

async function fill(user: User, { contact = '0532 000 00 00' }: { contact?: string } = {}) {
  await user.type(screen.getByRole('textbox', { name: /Adınız soyadınız/ }), 'Ahmet Yılmaz')
  if (contact) await user.type(screen.getByRole('textbox', { name: 'Telefon' }), contact)
  await user.type(screen.getByRole('textbox', { name: /Mesajınız/ }), 'Merhaba, bilgi almak istiyorum.')
  await user.click(screen.getByRole('checkbox', { name: /KVKK Aydınlatma Metni/ }))
}
const send = (user: User) => user.click(screen.getByRole('button', { name: 'Mesajı gönder' }))

describe('ContactForm', () => {
  it('saves a valid message to contact_messages and shows the thank-you message', async () => {
    const { user } = setup()
    await fill(user)
    await send(user)
    expect(await screen.findByRole('heading', { name: 'Mesajınız alındı' })).toBeInTheDocument()
    expect(mocks.from).toHaveBeenCalledWith('contact_messages')
    expect(mocks.insert).toHaveBeenCalledTimes(1)
    expect(mocks.insert).toHaveBeenCalledWith({ name: 'Ahmet Yılmaz', phone: '0532 000 00 00', email: null, message: 'Merhaba, bilgi almak istiyorum.' })
  })
  it('works with an e-mail instead of a phone number', async () => {
    const { user } = setup()
    await fill(user, { contact: '' })
    await user.type(screen.getByRole('textbox', { name: 'E-posta' }), 'ahmet@ornek.com')
    await send(user)
    expect(await screen.findByRole('heading', { name: 'Mesajınız alındı' })).toBeInTheDocument()
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ phone: null, email: 'ahmet@ornek.com' }))
  })
  it('shows friendly messages and sends nothing when the form is empty', async () => {
    const { user } = setup()
    await send(user)
    expect(await screen.findByText('Lütfen adınızı ve soyadınızı yazın.')).toBeInTheDocument()
    expect(screen.getByText('Lütfen mesajınızı yazın (en az 5 karakter).')).toBeInTheDocument()
    expect(screen.getByText(/aydınlatma metnini okuduğunuzu onaylayın/)).toBeInTheDocument()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('asks for a phone or an e-mail', async () => {
    const { user } = setup()
    await fill(user, { contact: '' })
    await send(user)
    expect(await screen.findByText('Telefon veya e-posta alanlarından en az birini doldurun.')).toBeInTheDocument()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('marks invalid fields for screen readers', async () => {
    const { user } = setup()
    await send(user)
    const name = await screen.findByRole('textbox', { name: /Adınız soyadınız/ })
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription('Lütfen adınızı ve soyadınızı yazın.')
  })
  it('pretends to succeed but sends nothing when the hidden honeypot field is filled (bots)', async () => {
    const { user, container } = setup()
    await fill(user)
    await user.type(container.querySelector<HTMLInputElement>('#contact-website')!, 'http://spam.example')
    await send(user)
    expect(await screen.findByRole('heading', { name: 'Mesajınız alındı' })).toBeInTheDocument()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('hides the honeypot from people and screen readers', () => {
    const { container } = setup()
    const wrapper = container.querySelector('#contact-website')?.parentElement
    expect(wrapper?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('#contact-website')?.getAttribute('tabindex')).toBe('-1')
  })
  it('shows a calm error with the phone number when the database refuses, and keeps what was typed', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } })
    const { user } = setup()
    await fill(user)
    await send(user)
    expect(await screen.findByText(/şu anda gönderilemedi/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mesajınız alındı' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Adınız soyadınız/ })).toHaveValue('Ahmet Yılmaz')
  })
  it('shows the same calm error when the network fails, and when the build has no Supabase settings', async () => {
    mocks.insert.mockRejectedValue(new TypeError('Failed to fetch'))
    const { user } = setup()
    await fill(user)
    await send(user)
    expect(await screen.findByText(/şu anda gönderilemedi/)).toBeInTheDocument()
    mocks.configured = false
    await send(user)
    expect(await screen.findByText(/şu anda gönderilemedi/)).toBeInTheDocument()
    expect(mocks.insert).toHaveBeenCalledTimes(1)
  })
  it('lets the person send another message after success, with an empty form', async () => {
    const { user } = setup()
    await fill(user)
    await send(user)
    await screen.findByRole('heading', { name: 'Mesajınız alındı' })
    await user.click(screen.getByRole('button', { name: 'Yeni bir mesaj yaz' }))
    expect(screen.getByRole('textbox', { name: /Adınız soyadınız/ })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: /Mesajınız/ })).toHaveValue('')
  })
  it('links the KVKK text in a new tab', () => {
    setup()
    const link = screen.getByRole('link', { name: 'KVKK Aydınlatma Metni' })
    expect(link).toHaveAttribute('href', '/kvkk')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
