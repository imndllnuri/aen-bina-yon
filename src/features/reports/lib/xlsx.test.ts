import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildXlsx, cellXml, cleanText, columnName, crc32, dateSerial, dateTimeSerial, downloadXlsx, escapeXml, safeSheetName, XLSX_MIME, zipStored, type XSheet } from './xlsx'

// A tiny unzip for "stored" zips, to look INSIDE the file we made (and to check every checksum).
function unzip(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  const out: Record<string, string> = {}
  let at = 0
  while (view.getUint32(at, true) === 0x04034b50) {
    const crc = view.getUint32(at + 14, true)
    const size = view.getUint32(at + 18, true)
    const nameLength = view.getUint16(at + 26, true)
    const name = decoder.decode(bytes.subarray(at + 30, at + 30 + nameLength))
    const data = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size)
    expect(crc32(data)).toBe(crc) // every file's checksum is right
    out[name] = decoder.decode(data)
    at += 30 + nameLength + size
  }
  return out
}

const sheet = (over: Partial<XSheet> = {}): XSheet => ({
  name: 'Borç listesi',
  head: ['Daire', 'Tutar'],
  rows: [[{ t: 'str', v: 'A Blok · 1' }, { t: 'money', kurus: 123456 }]],
  ...over,
})

describe('crc32 and the zip', () => {
  it('computes the standard checksum ("123456789" -> CBF43926)', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926')
    expect(crc32(new Uint8Array())).toBe(0)
  })

  it('stores every file as it is, with names and a central directory that match', () => {
    const zip = zipStored([
      { name: 'a.txt', data: new TextEncoder().encode('merhaba') },
      { name: 'dizin/ç.txt', data: new TextEncoder().encode('çğış') },
    ])
    const files = unzip(zip)
    expect(files).toEqual({ 'a.txt': 'merhaba', 'dizin/ç.txt': 'çğış' })
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    // the end record: two entries, central directory inside the file
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50)
    expect(view.getUint16(zip.length - 22 + 10, true)).toBe(2)
    expect(view.getUint32(view.getUint32(zip.length - 22 + 16, true), true)).toBe(0x02014b50)
  })

  it('gives the same bytes for the same sheet (no clock inside)', () => {
    expect(Array.from(buildXlsx(sheet()))).toEqual(Array.from(buildXlsx(sheet())))
  })
})

describe('an .xlsx file', () => {
  it('has the six parts of the smallest valid workbook', () => {
    const files = unzip(buildXlsx(sheet()))
    expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'])
    for (const xml of Object.values(files)) expect(xml.startsWith('<?xml')).toBe(true)
  })

  it('names the sheet, freezes the header row and writes the header in bold', () => {
    const files = unzip(buildXlsx(sheet()))
    expect(files['xl/workbook.xml']).toContain('<sheet name="Borç listesi" sheetId="1"')
    expect(files['xl/worksheets/sheet1.xml']).toContain('state="frozen"')
    expect(files['xl/worksheets/sheet1.xml']).toContain('<c r="A1" s="7" t="inlineStr"><is><t xml:space="preserve">Daire</t></is></c>')
  })

  it('writes money as a real number of TL (whole kuruş / 100), with the ₺ look', () => {
    const files = unzip(buildXlsx(sheet()))
    expect(files['xl/worksheets/sheet1.xml']).toContain('<c r="B2" s="1"><v>1234.56</v></c>')
    expect(files['xl/styles.xml']).toContain('#,##0.00&quot; ₺&quot;')
  })

  it('never makes a rounding error out of kuruş (0.07, 1.15 and 10.05 stay exact)', () => {
    expect(cellXml('A1', { t: 'money', kurus: 7 }, false)).toContain('<v>0.07</v>')
    expect(cellXml('A1', { t: 'money', kurus: 115 }, false)).toContain('<v>1.15</v>')
    expect(cellXml('A1', { t: 'money', kurus: 1005 }, false)).toContain('<v>10.05</v>')
    expect(cellXml('A1', { t: 'money', kurus: 0 }, false)).toContain('<v>0</v>')
  })

  it('writes a total row in bold styles', () => {
    const xml = unzip(buildXlsx(sheet({ total: [{ t: 'str', v: 'Toplam' }, { t: 'money', kurus: 5 }] })))['xl/worksheets/sheet1.xml']
    expect(xml).toContain('<c r="A3" s="8" t="inlineStr">')
    expect(xml).toContain('<c r="B3" s="9"><v>0.05</v></c>')
  })

  it('keeps Turkish letters in cells, sheet names and the file', () => {
    const files = unzip(buildXlsx(sheet({ name: 'Şeker İşçi Çğ', head: ['Ğ'], rows: [[{ t: 'str', v: 'İstanbul çocuk öğretmen ışık' }]] })))
    expect(files['xl/workbook.xml']).toContain('Şeker İşçi Çğ')
    expect(files['xl/worksheets/sheet1.xml']).toContain('İstanbul çocuk öğretmen ışık')
  })

  it('leaves empty cells out and writes dates as day numbers', () => {
    expect(cellXml('A1', { t: 'str', v: null }, false)).toBe('')
    expect(cellXml('A1', { t: 'str', v: '' }, false)).toBe('')
    expect(cellXml('A1', { t: 'blank' }, false)).toBe('')
    expect(cellXml('A1', { t: 'pct', v: null }, false)).toBe('')
    expect(cellXml('A1', { t: 'date', v: 'not a date' }, false)).toBe('')
    expect(cellXml('A1', { t: 'date', v: '2026-11-23' }, false)).toBe('<c r="A1" s="3"><v>46349</v></c>')
  })
})

describe('text that other people typed is only ever text', () => {
  it('writes a formula as an inline STRING, never as a formula', () => {
    for (const evil of ['=HYPERLINK("http://evil.example","tıkla")', '=1+1', '+SUM(A1:A2)', '-2+3', '@SUM(1)', '=cmd|\' /C calc\'!A0']) {
      const xml = cellXml('A2', { t: 'str', v: evil }, false)
      expect(xml).toContain('t="inlineStr"')
      expect(xml).not.toContain('<f>')
      expect(xml).not.toContain('<f ')
    }
  })

  it('escapes XML so a name cannot break out of the cell', () => {
    const xml = cellXml('A1', { t: 'str', v: '</t></is></c><c r="Z9"><f>1</f></c> & "q" <b>' }, false)
    expect(xml).not.toContain('<f>')
    expect(xml).toContain('&lt;/t&gt;&lt;/is&gt;')
    expect(xml).toContain('&amp;')
    expect(xml).toContain('&quot;q&quot;')
  })

  it('removes characters that XML cannot hold, and cuts a text at the cell limit', () => {
    expect(cleanText('a\u0000b\u0008c\u000Bd\u001Fe￾f')).toBe('abcdef')
    expect(cleanText('tab\there\nnewline')).toBe('tab\there\nnewline') // tab and line break are fine
    expect(cleanText('x'.repeat(40000))).toHaveLength(32767)
    expect(escapeXml('a<b>"&')).toBe('a&lt;b&gt;&quot;&amp;')
  })
})

describe('sheet names', () => {
  it('drops the characters Excel refuses and keeps at most 31', () => {
    expect(safeSheetName('Borç/Liste?*[x]:y\\z')).toBe('Borç Liste x y z')
    expect(safeSheetName('a'.repeat(50))).toHaveLength(31)
    expect(safeSheetName("'quoted'")).toBe('quoted')
  })
  it('never gives an empty name', () => {
    expect(safeSheetName('')).toBe('Rapor')
    expect(safeSheetName('///')).toBe('Rapor')
    expect(safeSheetName('   ')).toBe('Rapor')
  })
})

describe('serial numbers and column letters', () => {
  it('counts days from 1899-12-30 like Excel', () => {
    expect(dateSerial('1900-01-01')).toBe(2)
    expect(dateSerial('2026-11-23')).toBe(46349)
    expect(dateSerial('2026-02-30')).not.toBeNull() // the shape is checked here; real dates come from the database
    expect(dateSerial('23.11.2026')).toBeNull()
  })
  it('adds the time of day as a fraction', () => {
    expect(dateTimeSerial('2026-11-23T12:00')).toBeCloseTo(46349.5, 6)
    expect(dateTimeSerial('2026-11-23T06:30')).toBeCloseTo(46349 + 390 / 1440, 6)
    expect(dateTimeSerial('2026-11-23')).toBeNull()
  })
  it('names columns A..Z, AA..', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA'])
  })
})

describe('the zip is one that every program opens', () => {
  it('stores every file (method 0) with UTF-8 names, in the local header and in the central directory', () => {
    const zip = buildXlsx(sheet())
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    let at = 0
    let files = 0
    while (view.getUint32(at, true) === 0x04034b50) {
      expect(view.getUint16(at + 8, true)).toBe(0) // "stored": the bytes are the file as it is
      expect(view.getUint16(at + 6, true) & 0x0800).toBe(0x0800) // the name is UTF-8
      at += 30 + view.getUint16(at + 26, true) + view.getUint32(at + 18, true)
      files++
    }
    expect(files).toBe(6)
    let central = 0
    while (view.getUint32(at, true) === 0x02014b50) {
      expect(view.getUint16(at + 10, true)).toBe(0)
      at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true)
      central++
    }
    expect(central).toBe(6)
  })
  it('says in the central directory where each file starts (the offset)', () => {
    const zip = zipStored([
      { name: 'a.txt', data: new TextEncoder().encode('bir') },
      { name: 'b.txt', data: new TextEncoder().encode('iki') },
    ])
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    const start = view.getUint32(zip.length - 22 + 16, true)
    expect(view.getUint32(start + 42, true)).toBe(0) // a.txt starts at the beginning
    const second = start + 46 + 'a.txt'.length
    expect(view.getUint32(second + 42, true)).toBe(30 + 'a.txt'.length + 3) // b.txt right after it
    expect(view.getUint32(view.getUint32(second + 42, true), true)).toBe(0x04034b50)
  })
})

describe('rows, styles and number looks', () => {
  const wide = (): XSheet => ({
    name: 'Tümü',
    head: ['Metin', 'Para', 'Sayı', 'Oran', 'Pay', 'Gün', 'Zaman'],
    rows: [
      [{ t: 'str', v: 'a' }, { t: 'money', kurus: 150 }, { t: 'int', v: 7 }, { t: 'pct', v: 6.2 }, { t: 'dec4', v: 33.3333 }, { t: 'date', v: '2026-11-23' }, { t: 'datetime', v: '2026-11-23T14:05' }],
      [{ t: 'str', v: 'b' }, { t: 'money', kurus: 0 }, { t: 'int', v: 8 }, { t: 'pct', v: 1 }, { t: 'dec4', v: 1 }, { t: 'date', v: '2026-11-24' }, { t: 'datetime', v: '2026-11-24T00:00' }],
    ],
    total: [{ t: 'str', v: 'T' }, { t: 'money', kurus: 150 }, { t: 'int', v: 15 }, { t: 'pct', v: 3 }, { t: 'dec4', v: 34.3333 }, { t: 'blank' }, { t: 'blank' }],
  })
  it('numbers the rows 1 (header), 2, 3 and the total 4, and every cell reference matches its row', () => {
    const xml = unzip(buildXlsx(wide()))['xl/worksheets/sheet1.xml'] as string
    expect(xml.match(/<row r="(\d+)">/g)).toEqual(['<row r="1">', '<row r="2">', '<row r="3">', '<row r="4">'])
    expect(xml).toContain('<row r="2"><c r="A2"')
    expect(xml).toContain('<row r="3"><c r="A3"')
    expect(xml).toContain('<row r="4"><c r="A4"')
  })
  it('gives every kind of cell its own number look (style numbers 1-6) and the total row the bold ones (8-12)', () => {
    const xml = unzip(buildXlsx(wide()))['xl/worksheets/sheet1.xml'] as string
    expect(xml).toContain('<c r="B2" s="1"><v>1.5</v></c>')
    expect(xml).toContain('<c r="C2" s="2"><v>7</v></c>')
    expect(xml).toContain('<c r="D2" s="5"><v>6.2</v></c>')
    expect(xml).toContain('<c r="E2" s="6"><v>33.3333</v></c>')
    expect(xml).toContain('<c r="F2" s="3"><v>46349</v></c>')
    expect(xml).toContain('<c r="G2" s="4">')
    expect(xml).toContain('<c r="B4" s="9"><v>1.5</v></c>')
    expect(xml).toContain('<c r="C4" s="10"><v>15</v></c>')
    expect(xml).toContain('<c r="D4" s="11"><v>3</v></c>')
    expect(xml).toContain('<c r="E4" s="12"><v>34.3333</v></c>')
  })
  it('defines those looks: money with ₺, dates as dd.mm.yyyy, percent, four decimals', () => {
    const styles = unzip(buildXlsx(wide()))['xl/styles.xml'] as string
    expect(styles).toContain('numFmtId="164" formatCode="#,##0.00&quot; ₺&quot;"')
    expect(styles).toContain('numFmtId="165" formatCode="dd\\.mm\\.yyyy"')
    expect(styles).toContain('numFmtId="166" formatCode="dd\\.mm\\.yyyy\\ hh:mm"')
    expect(styles).toContain('numFmtId="167" formatCode="0.0&quot;%&quot;"')
    expect(styles).toContain('numFmtId="168" formatCode="#,##0.0000"')
    expect(styles).toContain('<cellXfs count="13">')
  })
})

describe('downloadXlsx', () => {
  const realCreate = URL.createObjectURL
  const realRevoke = URL.revokeObjectURL
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    URL.createObjectURL = realCreate
    URL.revokeObjectURL = realRevoke
  })
  it('names the file type, starts the download, and frees the link only later', () => {
    vi.useFakeTimers()
    const create = vi.fn(() => 'blob:abc')
    const revoke = vi.fn()
    URL.createObjectURL = create
    URL.revokeObjectURL = revoke
    const downloads: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(`${this.download} ${this.href}`)
    })
    downloadXlsx('borc-listesi-2026-11-24.xlsx', sheet())
    expect(create).toHaveBeenCalledTimes(1)
    expect((create.mock.calls[0] as unknown as [Blob])[0].type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(XLSX_MIME).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(downloads).toEqual(['borc-listesi-2026-11-24.xlsx blob:abc'])
    expect(document.querySelector('a[download]')).toBeNull() // the helper link is removed again
    expect(revoke).not.toHaveBeenCalled() // the browser may still be reading the file
    vi.advanceTimersByTime(10_000)
    expect(revoke).toHaveBeenCalledWith('blob:abc')
  })
})
