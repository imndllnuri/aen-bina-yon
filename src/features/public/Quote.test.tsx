import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Quote } from './Quote'

// A fake Supabase client. `from()` returns an object that has ONLY `insert`.
// If the code ever chained `.select()` after `.insert()` (visitors are not allowed to read),
// it would throw here, the form would show an error, and these tests would fail.
const mocks = vi.hoisted(() => ({
  configured: true,
  insert: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocks.configured ? { from: mocks.from } : null
  },
  get isSupabaseConfigured() {
    return mocks.configured
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
      <Quote />
    </MemoryRouter>,
  )
  return { user, ...view }
}

type User = ReturnType<typeof userEvent.setup>

async function fillRequired(user: User) {
  await user.type(screen.getByRole('textbox', { name: 'Adınız soyadınız' }), 'Ahmet Yılmaz')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Yapı tipi' }), 'apartman')
  await user.type(screen.getByRole('textbox', { name: 'Daire sayısı' }), '16')
  await user.type(screen.getByRole('textbox', { name: 'İl' }), 'Kayseri')
  await user.click(screen.getByRole('checkbox', { name: /KVKK Aydınlatma Metni/ }))
}

const send = (user: User) => user.click(screen.getByRole('button', { name: 'Teklif talebini gönder' }))

describe('Quote page', () => {
  it('saves a valid request to quote_requests and shows the thank-you message', async () => {
    const { user } = setup()
    await fillRequired(user)
    await user.type(screen.getByRole('textbox', { name: 'Telefon' }), '0532 000 00 00')
    await send(user)

    expect(await screen.findByRole('heading', { name: 'Talebiniz alındı' })).toBeInTheDocument()
    expect(mocks.from).toHaveBeenCalledWith('quote_requests')
    expect(mocks.insert).toHaveBeenCalledTimes(1)
    expect(mocks.insert).toHaveBeenCalledWith({
      name: 'Ahmet Yılmaz',
      phone: '0532 000 00 00',
      email: null,
      building_type: 'apartman',
      unit_count: 16,
      il: 'Kayseri',
      ilce: null,
      message: null,
    })
  })

  it('works with an e-mail instead of a phone number', async () => {
    const { user } = setup()
    await fillRequired(user)
    await user.type(screen.getByRole('textbox', { name: 'E-posta' }), 'ahmet@ornek.com')
    await send(user)

    expect(await screen.findByRole('heading', { name: 'Talebiniz alındı' })).toBeInTheDocument()
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ phone: null, email: 'ahmet@ornek.com' }))
  })

  it('shows friendly messages and sends nothing when the form is empty', async () => {
    const { user } = setup()
    await send(user)

    expect(await screen.findByText('Lütfen adınızı ve soyadınızı yazın.')).toBeInTheDocument()
    expect(screen.getByText('Lütfen yapı tipini seçin.')).toBeInTheDocument()
    expect(screen.getByText('1 ile 100.000 arasında bir sayı yazın.')).toBeInTheDocument()
    expect(screen.getByText(/aydınlatma metnini okuduğunuzu onaylayın/)).toBeInTheDocument()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('asks for a phone or an e-mail', async () => {
    const { user } = setup()
    await fillRequired(user)
    await send(user)

    expect(await screen.findByText('Telefon veya e-posta alanlarından en az birini doldurun.')).toBeInTheDocument()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('marks invalid fields for screen readers', async () => {
    const { user } = setup()
    await send(user)
    const name = await screen.findByRole('textbox', { name: 'Adınız soyadınız' })
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription('Lütfen adınızı ve soyadınızı yazın.')
  })

  it('pretends to succeed but sends nothing when the hidden honeypot field is filled (bots)', async () => {
    const { user, container } = setup()
    await fillRequired(user)
    await user.type(screen.getByRole('textbox', { name: 'Telefon' }), '0532 000 00 00')
    await user.type(container.querySelector<HTMLInputElement>('#website')!, 'http://spam.example')
    await send(user)

    expect(await screen.findByRole('heading', { name: 'Talebiniz alındı' })).toBeInTheDocument()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('shows a calm error with the phone number when the database refuses the request', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } })
    const { user } = setup()
    await fillRequired(user)
    await user.type(screen.getByRole('textbox', { name: 'Telefon' }), '0532 000 00 00')
    await send(user)

    expect(await screen.findByText(/şu anda gönderilemedi/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Talebiniz alındı' })).not.toBeInTheDocument()
    // The person's typing is kept, so they can try again.
    expect(screen.getByRole('textbox', { name: 'Adınız soyadınız' })).toHaveValue('Ahmet Yılmaz')
  })

  it('shows the same calm error when the network fails (for example a paused project)', async () => {
    mocks.insert.mockRejectedValue(new TypeError('Failed to fetch'))
    const { user } = setup()
    await fillRequired(user)
    await user.type(screen.getByRole('textbox', { name: 'Telefon' }), '0532 000 00 00')
    await send(user)

    expect(await screen.findByText(/şu anda gönderilemedi/)).toBeInTheDocument()
  })

  it('shows the error when this build has no Supabase settings', async () => {
    mocks.configured = false
    const { user } = setup()
    await fillRequired(user)
    await user.type(screen.getByRole('textbox', { name: 'Telefon' }), '0532 000 00 00')
    await send(user)

    expect(await screen.findByText(/şu anda gönderilemedi/)).toBeInTheDocument()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('lets the person send another request after success', async () => {
    const { user } = setup()
    await fillRequired(user)
    await user.type(screen.getByRole('textbox', { name: 'Telefon' }), '0532 000 00 00')
    await send(user)
    await screen.findByRole('heading', { name: 'Talebiniz alındı' })

    await user.click(screen.getByRole('button', { name: 'Yeni bir talep gönder' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Teklif Al' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Adınız soyadınız' })).toHaveValue('')
  })
})
