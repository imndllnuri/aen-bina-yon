// Photos of a request: what we accept, and how a photo is made ready before it leaves the phone.
// The database and the private bucket repeat the hard rules (5 MB, JPG / PNG / WEBP, <unit id>/<uuid>.<ext>, at most 3).
// This code gives friendly messages and does two helpful things to the picture:
//   1. it shrinks it (a phone photo is often 4 to 10 MB; 1600 px is plenty to see a leaking pipe), and
//   2. it re-draws it, which DROPS the hidden data a phone writes into a photo (the EXIF block holds the GPS place:
//      the home of the resident). Only the picture itself is uploaded.

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024
/** A file bigger than this is refused before we even try to open it (opening a huge picture can freeze a phone). */
export const PHOTO_PICK_LIMIT = 30 * 1024 * 1024
export const PHOTO_MAX_SIDE = 1600
const JPEG_QUALITY = 0.82

export type PhotoType = 'jpg' | 'png' | 'webp'
export const PHOTO_MIME: Record<PhotoType, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

/** What a file REALLY is, from its first bytes. A file called "foto.jpg" that is not a JPEG is refused. */
export function sniffPhoto(bytes: Uint8Array): PhotoType | null {
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte)
  if (starts(0xff, 0xd8, 0xff)) return 'jpg'
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png'
  // WEBP: "RIFF" + 4 size bytes + "WEBP"
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'webp'
  return null
}

/** The size of the picture after shrinking: the long side becomes at most `max`, the shape stays. */
export function fitSize(width: number, height: number, max: number = PHOTO_MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= max) return { width, height }
  const scale = max / longest
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** <unit id>/<file id>.<ext>  The folder is the unit: the storage rules look at it. */
export function photoPath(unitId: string, fileId: string, type: PhotoType): string {
  return `${unitId}/${fileId}.${type}`
}

export function photoSizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

export interface PreparedPhoto {
  blob: Blob
  type: PhotoType
  mime: string
  /** The name the person picked (shown in the list). */
  name: string
  /** A random name for the file in the bucket, made when the photo is picked (a retry reuses it). */
  id: string
}

export type PhotoResult = { ok: true; photo: PreparedPhoto } | { ok: false; message: string }

/** What the browser can do with a picture. Passed in, so tests can replace it (jsdom has no canvas). */
export interface PhotoShrinker {
  (file: Blob): Promise<Blob | null>
}

/** A picture opened in the browser, ready to be drawn. `release` frees what the browser holds for it. */
interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

/**
 * Way 1: a plain <img>. Every browser can do this, and every modern browser turns the picture the right way up by itself
 * (a phone writes "rotate me" into the photo instead of rotating the pixels). Safari on an iPhone is the one to think about.
 */
async function decodeWithImage(file: Blob): Promise<Decoded | null> {
  if (typeof Image === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null
  const url = URL.createObjectURL(file)
  const release = () => URL.revokeObjectURL(url)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('image could not be decoded'))
      image.src = url
    })
    if (!image.naturalWidth || !image.naturalHeight) {
      release()
      return null
    }
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release }
  } catch {
    release()
    return null
  }
}

/** Way 2, when <img> cannot: createImageBitmap. Older browsers do not know the "from-image" option, so it is tried without it too. */
async function decodeWithBitmap(file: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap !== 'function') return null
  const open = async (): Promise<ImageBitmap | null> => {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      try {
        return await createImageBitmap(file)
      } catch {
        return null
      }
    }
  }
  const bitmap = await open()
  if (!bitmap) return null
  return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
}

/** The real shrinker: open the picture (keeping it the right way up), draw it on a white sheet, save it as a JPEG. Null when it cannot. */
export const shrinkWithCanvas: PhotoShrinker = async (file) => {
  if (typeof document === 'undefined') return null
  const decoded = (await decodeWithImage(file)) ?? (await decodeWithBitmap(file))
  if (!decoded) return null
  try {
    const { width, height } = fitSize(decoded.width, decoded.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.fillStyle = '#ffffff' // a transparent PNG must not turn black
    context.fillRect(0, 0, width, height)
    context.drawImage(decoded.source, 0, 0, width, height)
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  } catch {
    return null
  } finally {
    decoded.release()
  }
}

/**
 * Check a picked file and make it ready. Never throws: a problem comes back as a Turkish message.
 */
export async function preparePhoto(file: File, shrink: PhotoShrinker = shrinkWithCanvas, makeId: () => string = () => crypto.randomUUID()): Promise<PhotoResult> {
  if (file.size === 0) return { ok: false, message: 'Seçtiğiniz dosya boş.' }
  if (file.size > PHOTO_PICK_LIMIT) return { ok: false, message: 'Fotoğraf çok büyük (30 MB üstü). Daha küçük bir fotoğraf seçin.' }
  const type = sniffPhoto(new Uint8Array(await file.slice(0, 12).arrayBuffer()))
  if (!type) return { ok: false, message: 'Yalnızca JPG, PNG veya WEBP fotoğraf yükleyebilirsiniz.' }

  // The picture is always re-drawn. If the browser cannot do that, the original is NOT sent: it would still carry the
  // hidden data (the place where the photo was taken).
  const small = await shrink(file)
  if (!small) return { ok: false, message: 'Bu fotoğraf açılamadı. Başka bir fotoğraf seçin.' }
  if (small.size > PHOTO_MAX_BYTES) return { ok: false, message: 'Fotoğraf küçültülse bile 5 MB’tan büyük kaldı. Başka bir fotoğraf seçin.' }
  return { ok: true, photo: { blob: small, type: 'jpg', mime: PHOTO_MIME.jpg, name: file.name, id: makeId() } }
}
