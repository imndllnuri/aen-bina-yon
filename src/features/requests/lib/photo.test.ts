import { describe, expect, it, vi } from 'vitest'
import { fitSize, PHOTO_MAX_BYTES, PHOTO_PICK_LIMIT, photoPath, photoSizeLabel, preparePhoto, sniffPhoto } from './photo'

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]
const file = (bytes: number[], name = 'foto.jpg', size?: number) => {
  const f = new File([new Uint8Array(bytes)], name)
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('sniffPhoto (what a file really is)', () => {
  it('recognises JPEG, PNG and WEBP by their first bytes', () => {
    expect(sniffPhoto(new Uint8Array(JPEG))).toBe('jpg')
    expect(sniffPhoto(new Uint8Array(PNG))).toBe('png')
    expect(sniffPhoto(new Uint8Array(WEBP))).toBe('webp')
  })

  it('refuses everything else, whatever the file is called', () => {
    expect(sniffPhoto(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0]))).toBeNull() // a PDF
    expect(sniffPhoto(new TextEncoder().encode('this is not a picture'))).toBeNull()
    expect(sniffPhoto(new Uint8Array([]))).toBeNull()
    // RIFF but not WEBP (a WAV sound file)
    expect(sniffPhoto(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]))).toBeNull()
    // GIF
    expect(sniffPhoto(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]))).toBeNull()
  })
})

describe('fitSize', () => {
  it('shrinks the long side to 1600 and keeps the shape', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(fitSize(3000, 4000)).toEqual({ width: 1200, height: 1600 })
    expect(fitSize(1601, 1601)).toEqual({ width: 1600, height: 1600 })
  })

  it('never makes a picture bigger', () => {
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 })
    expect(fitSize(1600, 1600)).toEqual({ width: 1600, height: 1600 })
  })

  it('never makes a side smaller than one pixel', () => {
    expect(fitSize(100_000, 10)).toEqual({ width: 1600, height: 1 })
  })
})

describe('photoPath and photoSizeLabel', () => {
  it('puts the photo in the folder of the unit', () => {
    expect(photoPath('unit-1', 'file-2', 'jpg')).toBe('unit-1/file-2.jpg')
  })
  it('writes sizes the Turkish way', () => {
    expect(photoSizeLabel(500)).toBe('1 KB')
    expect(photoSizeLabel(850 * 1024)).toBe('850 KB')
    expect(photoSizeLabel(3.2 * 1024 * 1024)).toBe('3,2 MB')
  })
})

describe('preparePhoto', () => {
  const shrinkTo = (size: number) => vi.fn(async () => new Blob([new Uint8Array(size)], { type: 'image/jpeg' }))
  const id = () => 'fixed-id'

  it('makes a small JPEG of a good picture, with a fresh id', async () => {
    const result = await preparePhoto(file(JPEG, 'tavan.jpg'), shrinkTo(1000), id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.photo).toMatchObject({ type: 'jpg', mime: 'image/jpeg', name: 'tavan.jpg', id: 'fixed-id' })
    expect(result.photo.blob.size).toBe(1000)
  })

  it('turns a PNG or a WEBP into a JPEG too (one format in the bucket, no hidden data)', async () => {
    for (const bytes of [PNG, WEBP]) {
      const result = await preparePhoto(file(bytes, 'x.bin'), shrinkTo(10), id)
      expect(result.ok && result.photo.type).toBe('jpg')
    }
  })

  it('refuses an empty file, a huge file and a wrong kind of file BEFORE trying to open it', async () => {
    const shrink = shrinkTo(10)
    expect(await preparePhoto(file([], 'a.jpg'), shrink, id)).toEqual({ ok: false, message: 'Seçtiğiniz dosya boş.' })
    const huge = await preparePhoto(file(JPEG, 'a.jpg', PHOTO_PICK_LIMIT + 1), shrink, id)
    expect(huge.ok).toBe(false)
    expect(!huge.ok && huge.message).toMatch(/30 MB/)
    const wrong = await preparePhoto(file([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0], 'a.jpg'), shrink, id)
    expect(!wrong.ok && wrong.message).toMatch(/Yalnızca JPG, PNG veya WEBP/)
    expect(shrink).not.toHaveBeenCalled()
  })

  it('does NOT send the original when the picture cannot be re-drawn (it would keep its hidden place data)', async () => {
    const result = await preparePhoto(file(JPEG, 'a.jpg', 1000), async () => null, id)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.message).toMatch(/açılamadı/)
  })

  it('refuses a picture that is still over 5 MB after shrinking', async () => {
    const result = await preparePhoto(file(JPEG), shrinkTo(PHOTO_MAX_BYTES + 1), id)
    expect(!result.ok && result.message).toMatch(/5 MB/)
    // exactly 5 MB is fine
    expect((await preparePhoto(file(JPEG), shrinkTo(PHOTO_MAX_BYTES), id)).ok).toBe(true)
  })

  it('makes a different id for each photo', async () => {
    const a = await preparePhoto(file(JPEG), shrinkTo(10))
    const b = await preparePhoto(file(JPEG), shrinkTo(10))
    expect(a.ok && b.ok && a.photo.id !== b.photo.id).toBe(true)
  })
})
