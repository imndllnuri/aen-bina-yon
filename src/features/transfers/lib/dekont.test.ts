import { describe, expect, it } from 'vitest'
import { checkDekont, dekontPath, DEKONT_MAX_BYTES, fileSizeLabel, sniffDekont } from './dekont'

const bytes = (...values: number[]) => new Uint8Array(values)
const file = (content: BlobPart[], name: string, type = '') => new File(content, name, { type })

describe('sniffDekont: what a file really is, from its first bytes', () => {
  it('knows a PDF, a JPG and a PNG', () => {
    expect(sniffDekont(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31))).toBe('pdf')
    expect(sniffDekont(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpg')
    expect(sniffDekont(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png')
  })
  it('refuses everything else: text, an executable, a web page, an empty file, a half signature', () => {
    expect(sniffDekont(new TextEncoder().encode('hello world'))).toBeNull()
    expect(sniffDekont(new TextEncoder().encode('<html><script>'))).toBeNull()
    expect(sniffDekont(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull() // MZ: a Windows program
    expect(sniffDekont(bytes())).toBeNull()
    expect(sniffDekont(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull() // "%PDF" without the dash
    expect(sniffDekont(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull()
  })
})

describe('checkDekont', () => {
  it('accepts a real PDF and says what it is, whatever the file is called', async () => {
    const result = await checkDekont(file([bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34)], 'dekont.dat'))
    expect(result).toEqual({ ok: true, type: 'pdf', mime: 'application/pdf' })
  })
  it('accepts a JPG and a PNG', async () => {
    expect(await checkDekont(file([bytes(0xff, 0xd8, 0xff, 0xdb, 0, 0)], 'a.jpeg'))).toMatchObject({ ok: true, type: 'jpg', mime: 'image/jpeg' })
    expect(await checkDekont(file([bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)], 'a.png'))).toMatchObject({ ok: true, type: 'png', mime: 'image/png' })
  })
  it('refuses a program that is called dekont.pdf (the name and the browser type mean nothing)', async () => {
    const result = await checkDekont(file([bytes(0x4d, 0x5a, 0x90, 0x00, 0x03)], 'dekont.pdf', 'application/pdf'))
    expect(result).toEqual({ ok: false, message: 'Yalnızca PDF, JPG veya PNG dosyası yükleyebilirsiniz.' })
  })
  it('refuses an empty file and a file over 5 MB', async () => {
    expect(await checkDekont(file([], 'bos.pdf'))).toEqual({ ok: false, message: 'Seçtiğiniz dosya boş.' })
    const big = new File([new Uint8Array(DEKONT_MAX_BYTES + 1)], 'buyuk.pdf')
    expect(await checkDekont(big)).toEqual({ ok: false, message: 'Dosya 5 MB’tan büyük olamaz. Daha küçük bir dosya seçin.' })
  })
  it('accepts a file of exactly 5 MB', async () => {
    const content = new Uint8Array(DEKONT_MAX_BYTES)
    content.set([0x25, 0x50, 0x44, 0x46, 0x2d])
    expect(await checkDekont(new File([content], 'tam.pdf'))).toMatchObject({ ok: true })
  })
})

describe('dekontPath and fileSizeLabel', () => {
  it('puts the file in the folder of the unit', () => {
    expect(dekontPath('40000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'jpg')).toBe(
      '40000000-0000-0000-0000-000000000001/aaaaaaaa-aaaa-aaaa-aaaa-000000000001.jpg',
    )
  })
  it('writes sizes in plain Turkish', () => {
    expect(fileSizeLabel(500)).toBe('1 KB')
    expect(fileSizeLabel(850 * 1024)).toBe('850 KB')
    expect(fileSizeLabel(3.2 * 1024 * 1024)).toBe('3,2 MB')
  })
})
