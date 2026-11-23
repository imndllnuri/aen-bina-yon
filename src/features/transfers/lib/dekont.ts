// The dekont (bank slip) file: what we accept, and how the path in the private bucket is made.
// The database and the bucket repeat these rules (5 MB, PDF / JPG / PNG, <unit id>/<uuid>.<ext>).
// This code only gives a friendly message before the upload starts.

export const DEKONT_MAX_BYTES = 5 * 1024 * 1024

export type DekontType = 'pdf' | 'jpg' | 'png'

export const DEKONT_MIME: Record<DekontType, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png' }

/**
 * What a file REALLY is, from its first bytes ("magic bytes"). A file called "dekont.pdf" that is
 * not a PDF is refused. (The name and the type the browser reports can be anything.)
 */
export function sniffDekont(bytes: Uint8Array): DekontType | null {
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte)
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'pdf' // %PDF-
  if (starts(0xff, 0xd8, 0xff)) return 'jpg'
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png'
  return null
}

export type DekontCheck = { ok: true; type: DekontType; mime: string } | { ok: false; message: string }

export async function checkDekont(file: File): Promise<DekontCheck> {
  if (file.size === 0) return { ok: false, message: 'Seçtiğiniz dosya boş.' }
  if (file.size > DEKONT_MAX_BYTES) return { ok: false, message: 'Dosya 5 MB’tan büyük olamaz. Daha küçük bir dosya seçin.' }
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const type = sniffDekont(head)
  if (!type) return { ok: false, message: 'Yalnızca PDF, JPG veya PNG dosyası yükleyebilirsiniz.' }
  return { ok: true, type, mime: DEKONT_MIME[type] }
}

/** <unit id>/<file id>.<ext>  The folder is the unit: the storage rules look at it. */
export function dekontPath(unitId: string, fileId: string, type: DekontType): string {
  return `${unitId}/${fileId}.${type}`
}

/** "3,2 MB" / "850 KB" for the file the person picked. */
export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
