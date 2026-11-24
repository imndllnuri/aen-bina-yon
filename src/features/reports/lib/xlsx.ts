// A small writer for .xlsx files (no library: nothing to download, nothing to trust but this file).
//
// An .xlsx is a zip of a few XML files. This writes the smallest valid one:
//   one sheet, a bold frozen header row, real numbers with a money / date / percent look, column widths.
// Safety:
//   * Every piece of text is written as an INLINE STRING: a text that starts with "=" or "+" is just text,
//     it is never a formula. (Names of residents and payers are typed by other people.)
//   * The zip is "stored" (not compressed): simple and exact. The files here are small.
//   * Text is cleaned of characters that XML cannot hold, and cut at the cell limit of Excel (32767).
// The file opens in Excel and LibreOffice (checked with LibreOffice and openpyxl in the browser test).

/** A cell. Money is whole kuruş and is written as TL with two decimals. */
export type XCell =
  | { t: 'str'; v: string | null }
  | { t: 'money'; kurus: number }
  | { t: 'int'; v: number }
  | { t: 'pct'; v: number | null }
  | { t: 'dec4'; v: number | null }
  /** "2026-11-23" */
  | { t: 'date'; v: string | null }
  /** a wall-clock time "2026-11-23T14:05" (Istanbul): the sheet has no time zone */
  | { t: 'datetime'; v: string | null }
  | { t: 'blank' }

export interface XSheet {
  name: string
  head: string[]
  rows: XCell[][]
  /** The last row, drawn in bold (a total). */
  total?: XCell[]
  /** Column widths in characters. */
  widths?: number[]
  landscape?: boolean
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// ---------------------------------------------------------------------------
// text and numbers
// ---------------------------------------------------------------------------
const MAX_TEXT = 32767

/** XML cannot hold most control characters. */
export function cleanText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').slice(0, MAX_TEXT)
}

export function escapeXml(text: string): string {
  return cleanText(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** A sheet name: at most 31 characters, none of  / \ ? * [ ] :  and never empty. */
export function safeSheetName(name: string): string {
  const cleaned = cleanText(name).replace(/[/\\?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').slice(0, 31).trim()
  return cleaned === '' ? 'Rapor' : cleaned
}

const EPOCH = Date.UTC(1899, 11, 30)
/** Days since 1899-12-30 (the date system of Excel), for a date "2026-11-23". */
export function dateSerial(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return Math.round((Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - EPOCH) / 86_400_000)
}
/** The same with a time of day: "2026-11-23T14:05". */
export function dateTimeSerial(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso)
  if (!m) return null
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - EPOCH
  return day / 86_400_000 + (Number(m[4]) * 60 + Number(m[5])) / 1440
}

/** A column letter: 0 -> A, 25 -> Z, 26 -> AA. */
export function columnName(index: number): string {
  let n = index
  let name = ''
  do {
    name = String.fromCharCode(65 + (n % 26)) + name
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return name
}

// Style numbers (the order of <cellXfs> in styles.xml below)
const S = { text: 0, money: 1, int: 2, date: 3, datetime: 4, pct: 5, dec4: 6, head: 7, boldText: 8, boldMoney: 9, boldInt: 10, boldPct: 11, boldDec4: 12 } as const

function textCell(ref: string, style: number, value: string): string {
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}
function numberCell(ref: string, style: number, value: number): string {
  return `<c r="${ref}" s="${style}"><v>${String(value)}</v></c>`
}

export function cellXml(ref: string, cell: XCell, bold: boolean): string {
  switch (cell.t) {
    case 'str':
      return cell.v === null || cell.v === '' ? '' : textCell(ref, bold ? S.boldText : S.text, cell.v)
    case 'money':
      // whole kuruş / 100: always an exact two-decimal number
      return numberCell(ref, bold ? S.boldMoney : S.money, Math.round(cell.kurus) / 100)
    case 'int':
      return numberCell(ref, bold ? S.boldInt : S.int, cell.v)
    case 'pct':
      return cell.v === null ? '' : numberCell(ref, bold ? S.boldPct : S.pct, cell.v)
    case 'dec4':
      return cell.v === null ? '' : numberCell(ref, bold ? S.boldDec4 : S.dec4, cell.v)
    case 'date': {
      const serial = cell.v ? dateSerial(cell.v) : null
      return serial === null ? '' : numberCell(ref, S.date, serial)
    }
    case 'datetime': {
      const serial = cell.v ? dateTimeSerial(cell.v) : null
      return serial === null ? '' : numberCell(ref, S.datetime, serial)
    }
    case 'blank':
      return ''
  }
}

function sheetXml(sheet: XSheet): string {
  const rows: string[] = []
  const head = sheet.head.map((text, c) => textCell(`${columnName(c)}1`, S.head, text)).join('')
  rows.push(`<row r="1">${head}</row>`)
  sheet.rows.forEach((row, r) => {
    rows.push(`<row r="${r + 2}">${row.map((cell, c) => cellXml(`${columnName(c)}${r + 2}`, cell, false)).join('')}</row>`)
  })
  if (sheet.total) {
    const r = sheet.rows.length + 2
    rows.push(`<row r="${r}">${sheet.total.map((cell, c) => cellXml(`${columnName(c)}${r}`, cell, true)).join('')}</row>`)
  }
  const cols = (sheet.widths ?? sheet.head.map(() => 14)).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')
  const page = sheet.landscape ? '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' : ''
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${cols}</cols><sheetData>${rows.join('')}</sheetData>${page}</worksheet>`
  )
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="5">' +
  '<numFmt numFmtId="164" formatCode="#,##0.00&quot; ₺&quot;"/>' +
  '<numFmt numFmtId="165" formatCode="dd\\.mm\\.yyyy"/>' +
  '<numFmt numFmtId="166" formatCode="dd\\.mm\\.yyyy\\ hh:mm"/>' +
  '<numFmt numFmtId="167" formatCode="0.0&quot;%&quot;"/>' +
  '<numFmt numFmtId="168" formatCode="#,##0.0000"/>' +
  '</numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="13">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + // 0 text
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // 1 money
  '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // 2 int
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // 3 date
  '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // 4 datetime
  '<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // 5 pct
  '<xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // 6 dec4
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' + // 7 header
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' + // 8 bold text
  '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' + // 9 bold money
  '<xf numFmtId="1" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' + // 10 bold int
  '<xf numFmtId="167" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' + // 11 bold pct
  '<xf numFmtId="168" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' + // 12 bold dec4
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>'

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>'

const WORKBOOK_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>'

function workbookXml(name: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${escapeXml(safeSheetName(name))}" sheetId="1" r:id="rId1"/></sheets></workbook>`
  )
}

// ---------------------------------------------------------------------------
// the zip ("stored": no compression)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = (CRC_TABLE[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  data: Uint8Array
}

/** A zip with every file stored as it is. The time stamp is a fixed date, so the same sheet gives the same bytes. */
export function zipStored(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const DOS_TIME = 0
  const DOS_DATE = (46 << 9) | (1 << 5) | 1 // 2026-01-01
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // names are UTF-8
    local.setUint16(8, 0, true) // stored
    local.setUint16(10, DOS_TIME, true)
    local.setUint16(12, DOS_DATE, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, entry.data.length, true)
    local.setUint32(22, entry.data.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    chunks.push(new Uint8Array(local.buffer), name, entry.data)

    const head = new DataView(new ArrayBuffer(46))
    head.setUint32(0, 0x02014b50, true)
    head.setUint16(4, 20, true)
    head.setUint16(6, 20, true)
    head.setUint16(8, 0x0800, true)
    head.setUint16(10, 0, true)
    head.setUint16(12, DOS_TIME, true)
    head.setUint16(14, DOS_DATE, true)
    head.setUint32(16, crc, true)
    head.setUint32(20, entry.data.length, true)
    head.setUint32(24, entry.data.length, true)
    head.setUint16(28, name.length, true)
    head.setUint32(42, offset, true)
    central.push(new Uint8Array(head.buffer), name)
    offset += 30 + name.length + entry.data.length
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  const all = [...chunks, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of all) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** The bytes of an .xlsx with one sheet. */
export function buildXlsx(sheet: XSheet): Uint8Array {
  const encoder = new TextEncoder()
  return zipStored([
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: encoder.encode(ROOT_RELS) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml(sheet.name)) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(WORKBOOK_RELS) },
    { name: 'xl/styles.xml', data: encoder.encode(STYLES_XML) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheetXml(sheet)) },
  ])
}

/** Hands the file to the browser as a download. */
export function downloadXlsx(fileName: string, sheet: XSheet): void {
  const blob = new Blob([buildXlsx(sheet) as BlobPart], { type: XLSX_MIME })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // the browser has the file now: free it a little later
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
