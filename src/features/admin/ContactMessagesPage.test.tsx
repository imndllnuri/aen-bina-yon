import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageRow } from '@/features/messages/api'
import { renderRoutes, signedInState } from '@/test/render'
import { ContactMessagesPage } from './ContactMessagesPage'

const api = vi.hoisted(() => ({ fetchMessages: vi.fn(), updateMessageStatus: vi.fn(), updateMessageNote: vi.fn(), deleteMessage: vi.fn() }))
vi.mock('@/features/messages/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/messages/api')>()), ...api }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const message = (over: Partial<MessageRow> = {}): MessageRow => ({
  id: 'm1', name: 'Ali Veli', phone: '0532 111 22 33', email: 'ali@example.com', message: 'Merhaba\n<script>alert(1)</script>', status: 'new', adminNote: null, createdAt: '2026-11-20T08:00:00Z', ...over,
})
const open = () => renderRoutes([{ path: '/yonetim/mesajlar', element: <ContactMessagesPage /> }], { path: '/yonetim/mesajlar', authState: signedInState(['admin']) })

beforeEach(() => {
  for (const fn of [...Object.values(api), ...Object.values(toast)]) fn.mockReset()
  api.fetchMessages.mockResolvedValue([message(), message({ id: 'm2', name: 'Zeynep Hanım', status: 'answered', adminNote: 'Arandı, yarın dönecek', phone: null })])
  api.updateMessageStatus.mockResolvedValue(undefined)
  api.updateMessageNote.mockResolvedValue(undefined)
  api.deleteMessage.mockResolvedValue(undefined)
})

describe('İletişim Mesajları', () => {
  it('lists the messages with phone and e-mail as links', async () => {
    open()
    const list = await screen.findByRole('list', { name: 'İletişim mesajları' })
    const first = within(list).getAllByRole('listitem')[0] as HTMLElement
    expect(within(first).getByText('Ali Veli')).toBeInTheDocument()
    expect(within(first).getByRole('link', { name: '0532 111 22 33' })).toHaveAttribute('href', 'tel:0532 111 22 33')
    expect(within(first).getByRole('link', { name: 'ali@example.com' })).toHaveAttribute('href', 'mailto:ali@example.com')
    expect(api.fetchMessages).toHaveBeenCalled()
  })
  it('shows the note of the admin and a dash for a missing phone', async () => {
    open()
    const second = (await screen.findAllByRole('listitem'))[1] as HTMLElement
    expect(within(second).getByText('Arandı, yarın dönecek')).toBeInTheDocument()
    expect(within(second).getByText('—')).toBeInTheDocument()
  })
  it('prints the message as plain text (a script tag stays text)', async () => {
    open()
    const first = (await screen.findAllByRole('listitem'))[0] as HTMLElement
    expect(first.querySelector('script')).toBeNull()
    expect(within(first).getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument()
  })
  it('marks new messages with a different badge than answered ones', async () => {
    open()
    await screen.findByText('Ali Veli')
    const badges = Array.from(document.querySelectorAll('[data-slot="badge"]'))
    const fresh = badges.find((b) => b.textContent === 'Yeni')
    const answered = badges.find((b) => b.textContent === 'Yanıtlandı')
    expect(fresh?.className).toContain('bg-primary')
    expect(answered?.className).not.toContain('bg-primary')
  })
  it('changes the status with the box of that message, and loads the list again', async () => {
    const user = userEvent.setup()
    open()
    const box = await screen.findByRole('combobox', { name: 'Ali Veli için durum' })
    const before = api.fetchMessages.mock.calls.length
    await user.selectOptions(box, 'read')
    await waitFor(() => expect(api.updateMessageStatus).toHaveBeenCalledWith('m1', 'read'))
    await waitFor(() => expect(api.fetchMessages.mock.calls.length).toBeGreaterThan(before))
  })
  it('shows a message when the status could not be changed', async () => {
    api.updateMessageStatus.mockRejectedValue({ code: '42501' })
    const user = userEvent.setup()
    open()
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Ali Veli için durum' }), 'read')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Bu işlem için yetkiniz yok.'))
  })
  it('filters by status', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByText('Ali Veli')
    expect(screen.getByRole('option', { name: 'Tümü (2)' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Durum'), 'answered')
    expect(screen.queryByText('Ali Veli')).not.toBeInTheDocument()
    expect(screen.getByText('Zeynep Hanım')).toBeInTheDocument()
  })
  it('opens the whole message, saves a note, and loads the list again', async () => {
    const user = userEvent.setup()
    open()
    await user.click((await screen.findAllByRole('button', { name: 'Mesajın tamamı ve not' }))[0] as HTMLElement)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/Notunuz/), 'Yarın ararım')
    const before = api.fetchMessages.mock.calls.length
    await user.click(within(dialog).getByRole('button', { name: 'Notu kaydet' }))
    await waitFor(() => expect(api.updateMessageNote).toHaveBeenCalledWith('m1', 'Yarın ararım'))
    expect(toast.success).toHaveBeenCalledWith('Not kaydedildi.')
    await waitFor(() => expect(api.fetchMessages.mock.calls.length).toBeGreaterThan(before))
  })
  it('asks before deleting, then deletes and loads the list again', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: 'Ali Veli mesajını sil' }))
    expect(api.deleteMessage).not.toHaveBeenCalled()
    const before = api.fetchMessages.mock.calls.length
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sil' }))
    await waitFor(() => expect(api.deleteMessage).toHaveBeenCalledWith('m1'))
    expect(toast.success).toHaveBeenCalledWith('Mesaj silindi.')
    await waitFor(() => expect(api.fetchMessages.mock.calls.length).toBeGreaterThan(before))
  })
  it('says so when there is nothing yet, and when no message has the chosen status', async () => {
    api.fetchMessages.mockResolvedValue([])
    open()
    expect(await screen.findByText('Henüz mesaj gelmedi.')).toBeInTheDocument()
  })
  it('shows "try again" on an error', async () => {
    api.fetchMessages.mockRejectedValueOnce(new Error('boom'))
    const user = userEvent.setup()
    open()
    expect(await screen.findByText(/şu anda yüklenemedi/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByText('Ali Veli')).toBeInTheDocument()
  })
})
