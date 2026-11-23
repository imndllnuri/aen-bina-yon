import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PickedPhoto } from './components/PhotoPicker'
import { openRequest, tokenPayload } from './submit'

const api = vi.hoisted(() => ({ uploadRequestPhoto: vi.fn(), createRequest: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }))

const photo = (id: string): PickedPhoto => ({ blob: new Blob(['x']), type: 'jpg', mime: 'image/jpeg', name: `${id}.jpg`, id, previewUrl: `blob:${id}` })
const values = { category: 'asansor' as const, title: 'Başlık', description: 'Metin', priority: 'normal' as const, location: '' }

beforeEach(() => {
  api.uploadRequestPhoto.mockReset().mockResolvedValue(undefined)
  api.createRequest.mockReset().mockResolvedValue('r1')
})

describe('openRequest', () => {
  it('uploads each photo into the folder of the unit, THEN makes the request with those paths', async () => {
    const order: string[] = []
    api.uploadRequestPhoto.mockImplementation(async (path: string) => void order.push(`upload ${path}`))
    api.createRequest.mockImplementation(async () => (order.push('create'), 'r1'))
    const id = await openRequest({ token: 't1', unitId: 'u1', requesterId: null, values, photos: [photo('p1'), photo('p2')] })
    expect(id).toBe('r1')
    expect(order).toEqual(['upload u1/p1.jpg', 'upload u1/p2.jpg', 'create'])
    expect(api.createRequest).toHaveBeenCalledWith({
      token: 't1', unitId: 'u1', requesterId: null, photoPaths: ['u1/p1.jpg', 'u1/p2.jpg'], category: 'asansor', title: 'Başlık', description: 'Metin', priority: 'normal', location: null,
    })
  })

  it('makes no request when a photo cannot be uploaded (nothing half-done)', async () => {
    api.uploadRequestPhoto.mockRejectedValue({ message: 'too large' })
    await expect(openRequest({ token: 't1', unitId: 'u1', requesterId: null, values, photos: [photo('p1')] })).rejects.toMatchObject({ message: 'too large' })
    expect(api.createRequest).not.toHaveBeenCalled()
  })

  it('works without photos, and passes the place and the person of a request opened by phone', async () => {
    await openRequest({ token: 't2', unitId: 'u1', requesterId: 'p9', values: { ...values, location: 'Zemin kat' }, photos: [] })
    expect(api.uploadRequestPhoto).not.toHaveBeenCalled()
    expect(api.createRequest).toHaveBeenCalledWith(expect.objectContaining({ photoPaths: [], requesterId: 'p9', location: 'Zemin kat' }))
  })
})

describe('tokenPayload', () => {
  it('changes when the text, the person or a photo changes (so a changed request never reuses the old token)', () => {
    const base = JSON.stringify(tokenPayload('u1', null, values, [photo('p1')]))
    expect(JSON.stringify(tokenPayload('u1', null, values, [photo('p1')]))).toBe(base)
    expect(JSON.stringify(tokenPayload('u1', null, { ...values, title: 'Başka' }, [photo('p1')]))).not.toBe(base)
    expect(JSON.stringify(tokenPayload('u1', null, values, [photo('p2')]))).not.toBe(base)
    expect(JSON.stringify(tokenPayload('u1', 'p9', values, [photo('p1')]))).not.toBe(base)
    expect(JSON.stringify(tokenPayload('u2', null, values, [photo('p1')]))).not.toBe(base)
  })
})
