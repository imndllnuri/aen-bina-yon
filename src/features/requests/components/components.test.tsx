import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState, type ReactNode } from 'react'
import type { RequestComment, RequestEvent } from '../api'
import { PriorityBadge, SlaBadge, StatusBadge } from './Badges'
import { CommentForm, CommentThread } from './CommentThread'
import { PhotoPicker, type PickedPhoto } from './PhotoPicker'
import { RatingPicker, Stars } from './RatingPicker'
import { RequestTimeline } from './RequestTimeline'

const api = vi.hoisted(() => ({ addRequestComment: vi.fn(), rateRequest: vi.fn() }))
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api')>()), ...api }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const withClient = (ui: ReactNode) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>

beforeEach(() => {
  api.addRequestComment.mockReset().mockResolvedValue(undefined)
  api.rateRequest.mockReset().mockResolvedValue(undefined)
  toast.error.mockReset()
  toast.success.mockReset()
})

const comment = (over: Partial<RequestComment> = {}): RequestComment => ({
  id: 'c1', authorId: 'u-admin', authorName: 'Yönetici Yıldız', byAdmin: true, isInternal: false, body: 'Teknisyen yarın gelecek.', createdAt: '2026-11-20T09:00:00Z', ...over,
})

describe('badges', () => {
  it('shows the status in words, and the priority only when it is not the usual one', () => {
    render(
      <>
        <StatusBadge status="islemde" />
        <PriorityBadge priority="normal" />
        <PriorityBadge priority="acil" />
        <PriorityBadge priority="dusuk" />
      </>,
    )
    expect(screen.getByText('İşlemde')).toBeInTheDocument()
    expect(screen.getByText('Acil')).toBeInTheDocument()
    expect(screen.getByText('Düşük')).toBeInTheDocument()
    expect(screen.queryByText('Normal')).not.toBeInTheDocument()
  })

  it('SlaBadge shows time left or late for an open request and nothing for a finished one', () => {
    const now = new Date('2026-11-25T09:00:00Z')
    const { rerender } = render(<SlaBadge request={{ status: 'acik', priority: 'yuksek', createdAt: '2026-11-20T09:00:00Z' }} now={now} />)
    expect(screen.getByText('2 gün gecikti')).toBeInTheDocument()
    rerender(<SlaBadge request={{ status: 'acik', priority: 'dusuk', createdAt: '2026-11-20T09:00:00Z' }} now={now} />)
    expect(screen.getByText('9 gün kaldı')).toBeInTheDocument()
    rerender(<SlaBadge request={{ status: 'cozuldu', priority: 'acil', createdAt: '2026-11-20T09:00:00Z' }} now={now} />)
    expect(screen.queryByText(/gecikti|kaldı/)).not.toBeInTheDocument()
  })
})

describe('CommentThread', () => {
  const thread = [
    comment({ id: 'c1', body: 'Teknisyen yarın gelecek.' }),
    comment({ id: 'c2', authorId: 'me', authorName: 'Kemal Kiracı', byAdmin: false, body: 'Teşekkürler.' }),
    comment({ id: 'c3', isInternal: true, body: 'GIZLI: komşu şikayetçi' }),
  ]

  it('shows a resident "Yönetim" and "Siz", never a name of an admin', () => {
    render(<CommentThread comments={thread.slice(0, 2)} viewer="resident" myId="me" />)
    expect(screen.getByText('Yönetim')).toBeInTheDocument()
    expect(screen.getByText('Siz')).toBeInTheDocument()
    expect(screen.queryByText('Yönetici Yıldız')).not.toBeInTheDocument()
    expect(screen.queryByText(/sakin görmez|sakine görünür/)).not.toBeInTheDocument()
  })

  it('shows an admin the names, marks an internal note, and says which answers the resident sees', () => {
    render(<CommentThread comments={thread} viewer="admin" myId="u-admin" />)
    expect(screen.getAllByText('Yönetici Yıldız').length).toBe(2)
    expect(screen.getByText('Kemal Kiracı')).toBeInTheDocument()
    expect(screen.getByText(/İç not \(sakin görmez\)/)).toBeInTheDocument()
    expect(screen.getAllByText('· sakine görünür')).toHaveLength(1) // the public answer only, not the internal note
  })

  it('prints a comment as plain text', () => {
    const evil = '<script>alert(1)</script> <b>kalın</b>\nikinci satır'
    const { container } = render(<CommentThread comments={[comment({ body: evil })]} viewer="resident" myId="x" />)
    expect(container.querySelector('script, b')).toBeNull()
    expect(container.querySelector('p.whitespace-pre-wrap')?.textContent).toBe(evil)
  })

  it('says when there is no comment yet', () => {
    render(<CommentThread comments={[]} viewer="resident" myId="x" />)
    expect(screen.getByText('Henüz yorum yok.')).toBeInTheDocument()
  })
})

describe('CommentForm', () => {
  it('a resident has no internal-note box and sends a normal comment', async () => {
    const user = userEvent.setup()
    render(withClient(<CommentForm requestId="r1" viewer="resident" />))
    expect(screen.queryByLabelText(/İç not/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Yorum yaz'), '  Merhaba  ')
    await user.click(screen.getByRole('button', { name: 'Gönder' }))
    await waitFor(() => expect(api.addRequestComment).toHaveBeenCalledWith('r1', 'Merhaba', false))
    expect(screen.getByLabelText('Yorum yaz')).toHaveValue('') // cleared after sending
  })

  it('an admin can tick "İç not": then the call says internal, and the button says so', async () => {
    const user = userEvent.setup()
    render(withClient(<CommentForm requestId="r1" viewer="admin" />))
    await user.type(screen.getByLabelText('Yorum ya da iç not'), 'Gizli bilgi')
    await user.click(screen.getByLabelText(/İç not: sakin görmez/))
    await user.click(screen.getByRole('button', { name: 'Notu kaydet' }))
    await waitFor(() => expect(api.addRequestComment).toHaveBeenCalledWith('r1', 'Gizli bilgi', true))
  })

  it('an admin who does not tick sends an ordinary comment', async () => {
    const user = userEvent.setup()
    render(withClient(<CommentForm requestId="r1" viewer="admin" />))
    await user.type(screen.getByLabelText('Yorum ya da iç not'), 'Herkes görsün')
    await user.click(screen.getByRole('button', { name: 'Gönder' }))
    await waitFor(() => expect(api.addRequestComment).toHaveBeenCalledWith('r1', 'Herkes görsün', false))
  })

  it('a resident can never send an internal note, even if the box state were forced (the flag is ignored for residents)', async () => {
    const user = userEvent.setup()
    render(withClient(<CommentForm requestId="r1" viewer="resident" />))
    await user.type(screen.getByLabelText('Yorum yaz'), 'x')
    await user.click(screen.getByRole('button', { name: 'Gönder' }))
    await waitFor(() => expect(api.addRequestComment).toHaveBeenCalled())
    expect(api.addRequestComment.mock.calls[0]?.[2]).toBe(false)
  })

  it('does not send an empty comment', async () => {
    const user = userEvent.setup()
    render(withClient(<CommentForm requestId="r1" viewer="resident" />))
    await user.type(screen.getByLabelText('Yorum yaz'), '   ')
    await user.click(screen.getByRole('button', { name: 'Gönder' }))
    expect(await screen.findByText('Yorum yazın.')).toBeInTheDocument()
    expect(api.addRequestComment).not.toHaveBeenCalled()
  })

  it('shows the refusal of the database in Turkish', async () => {
    api.addRequestComment.mockRejectedValue({ message: 'request_closed' })
    const user = userEvent.setup()
    render(withClient(<CommentForm requestId="r1" viewer="resident" />))
    await user.type(screen.getByLabelText('Yorum yaz'), 'Merhaba')
    await user.click(screen.getByRole('button', { name: 'Gönder' }))
    expect(await screen.findByText(/kapandı ya da iptal edildi/)).toBeInTheDocument()
  })

  it('shows only the reason when comments are closed', () => {
    render(withClient(<CommentForm requestId="r1" viewer="resident" disabledText="Bu talep kapandı." />))
    expect(screen.getByText('Bu talep kapandı.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gönder' })).not.toBeInTheDocument()
  })
})

describe('RequestTimeline', () => {
  const events: RequestEvent[] = [
    { id: 'e1', kind: 'created', fromStatus: null, toStatus: 'acik', rating: null, actorName: 'Kemal Kiracı', actorId: 'u1', createdAt: '2026-11-20T08:00:00Z' },
    { id: 'e2', kind: 'status', fromStatus: 'acik', toStatus: 'inceleniyor', rating: null, actorName: 'Yönetici Yıldız', actorId: 'u2', createdAt: '2026-11-20T09:00:00Z' },
  ]

  it('shows the five steps with the current one marked, and the history', () => {
    render(<RequestTimeline status="inceleniyor" events={events} showNames={false} />)
    const steps = within(screen.getByRole('list', { name: 'Talebin aşamaları' }))
    expect(steps.getAllByRole('listitem')).toHaveLength(5)
    expect(steps.getByText('İnceleniyor').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(steps.getByText('Açık').closest('li')).not.toHaveAttribute('aria-current')
    expect(screen.getByText('Talep açıldı')).toBeInTheDocument()
    expect(screen.getByText('Durum: İnceleniyor')).toBeInTheDocument()
  })

  it('shows names to an admin only', () => {
    const { rerender } = render(<RequestTimeline status="inceleniyor" events={events} showNames={false} />)
    expect(screen.queryByText(/Yönetici Yıldız/)).not.toBeInTheDocument()
    rerender(<RequestTimeline status="inceleniyor" events={events} showNames />)
    expect(screen.getByText(/Yönetici Yıldız/)).toBeInTheDocument()
  })

  it('says so for a cancelled request and shows no steps', () => {
    render(<RequestTimeline status="iptal" events={events} showNames={false} />)
    expect(screen.getByText('Bu talep iptal edildi.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Talebin aşamaları' })).not.toBeInTheDocument()
  })
})

describe('Stars and RatingPicker', () => {
  it('Stars reads aloud the points', () => {
    render(<Stars value={4} />)
    expect(screen.getByRole('img', { name: '4 / 5 puan' })).toBeInTheDocument()
  })

  it('RatingPicker cannot send until a star is picked, then sends that number', async () => {
    const user = userEvent.setup()
    render(withClient(<RatingPicker requestId="r1" />))
    const send = screen.getByRole('button', { name: 'Puanı gönder' })
    expect(send).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: '4 yıldız' }))
    expect(screen.getByRole('radio', { name: '4 yıldız' })).toBeChecked()
    expect(send).toBeEnabled()
    await user.click(send)
    await waitFor(() => expect(api.rateRequest).toHaveBeenCalledWith('r1', 4))
    expect(toast.success).toHaveBeenCalled()
  })

  it('RatingPicker shows a refusal in Turkish', async () => {
    api.rateRequest.mockRejectedValue({ message: 'already_rated' })
    const user = userEvent.setup()
    render(withClient(<RatingPicker requestId="r1" />))
    await user.click(screen.getByRole('radio', { name: '5 yıldız' }))
    await user.click(screen.getByRole('button', { name: 'Puanı gönder' }))
    expect(await screen.findByText('Bu çözümü zaten değerlendirdiniz.')).toBeInTheDocument()
  })
})

describe('PhotoPicker', () => {
  const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]
  const jpeg = (name: string) => new File([new Uint8Array(JPEG)], name, { type: 'image/jpeg' })
  // jsdom cannot draw: a fake shrinker that "makes a small JPEG"
  const shrink = vi.fn(async () => new Blob([new Uint8Array(2048)], { type: 'image/jpeg' }))

  beforeEach(() => {
    shrink.mockClear()
    URL.createObjectURL = vi.fn(() => `blob:${Math.random()}`)
    URL.revokeObjectURL = vi.fn()
  })

  function Harness({ initial = [] as PickedPhoto[] }: { initial?: PickedPhoto[] }) {
    const [photos, setPhotos] = useState<PickedPhoto[]>(initial)
    return <PhotoPicker photos={photos} onChange={setPhotos} shrink={shrink} />
  }

  it('adds photos, shows a preview and the size, and counts them', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText('0/3 fotoğraf · JPG, PNG veya WEBP')).toBeInTheDocument()
    await user.upload(screen.getByLabelText('Fotoğraf seç'), [jpeg('a.jpg'), jpeg('b.jpg')])
    expect(await screen.findByAltText('Seçilen fotoğraf 2')).toBeInTheDocument()
    expect(screen.getByText('2/3 fotoğraf · JPG, PNG veya WEBP')).toBeInTheDocument()
    expect(screen.getAllByText('2 KB')).toHaveLength(2)
  })

  it('takes at most three, says so, and turns the add button off', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.upload(screen.getByLabelText('Fotoğraf seç'), [jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg'), jpeg('d.jpg')])
    expect(await screen.findByText('En fazla 3 fotoğraf ekleyebilirsiniz.')).toBeInTheDocument()
    expect(screen.getAllByAltText(/Seçilen fotoğraf/)).toHaveLength(3)
    expect(screen.getByRole('button', { name: /Fotoğraf ekle/ })).toBeDisabled()
    expect(shrink).toHaveBeenCalledTimes(3) // the 4th was not even opened
  })

  it('shows why a file was refused and keeps the good ones', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const notPicture = new File([new TextEncoder().encode('hello world, not a picture')], 'x.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText('Fotoğraf seç'), [notPicture, jpeg('ok.jpg')])
    expect(await screen.findByText('Yalnızca JPG, PNG veya WEBP fotoğraf yükleyebilirsiniz.')).toBeInTheDocument()
    expect(screen.getAllByAltText(/Seçilen fotoğraf/)).toHaveLength(1)
  })

  it('removes a photo, frees its preview memory, and lets the person add one again', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.upload(screen.getByLabelText('Fotoğraf seç'), [jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')])
    await screen.findByAltText('Seçilen fotoğraf 3')
    await user.click(screen.getByRole('button', { name: 'Fotoğraf 3 kaldır' }))
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(screen.getAllByAltText(/Seçilen fotoğraf/)).toHaveLength(2)
    expect(screen.getByRole('button', { name: /Fotoğraf ekle/ })).toBeEnabled()
  })
})
