/**
 * AUREKA zero-file ingestion. Never uploads a File, Blob, data URL, or binary body.
 * Parsing and export run in the user's browser. Only caller-selected structured
 * fields can subsequently be committed through authenticated database APIs.
 */
export type LocalDocumentResult = {
  title: string
  extractedText: string
  kind: string
  pageCount: number | null
  sha256: string
  notes: string[]
  status: 'completed' | 'metadata_only'
}
export type StructuredSection = { heading: string; text: string }
export const MAX_LOCAL_FILE_BYTES = 15 * 1024 * 1024
const MAX_TEXT = 240_000
const MAX_PAGES = 150
const MAX_SHEETS = 50

const supported = new Set(['pdf', 'docx', 'xlsx', 'csv', 'txt', 'json', 'png', 'jpg', 'jpeg', 'webp', 'gif'])
function extension(filename: string) { return filename.split('.').pop()?.toLowerCase() || '' }
function sha256Hex(bytes: ArrayBuffer) {
  return crypto.subtle.digest('SHA-256', bytes).then(hash =>
    Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join(''))
}
function normalizeText(value: string) {
  return value.replace(/\u0000/g, '').replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ').trim().slice(0, MAX_TEXT)
}
function zipMagic(bytes: Uint8Array) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b
}
function pdfMagic(bytes: Uint8Array) {
  return String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-'
}
function imageMagic(bytes: Uint8Array, ext: string) {
  if (ext === 'png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (ext === 'jpg' || ext === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8
  if (ext === 'gif') return String.fromCharCode(...bytes.slice(0, 3)) === 'GIF'
  if (ext === 'webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  return false
}
function docxParagraphs(xml: string) {
  if (xml.length > 8_000_000) throw new Error('Teks dokumen terlalu besar untuk pemrosesan lokal.')
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Struktur XML DOCX tidak valid.')
  const paragraphs = Array.from(doc.getElementsByTagName('w:p'))
  return paragraphs.map(p => Array.from(p.getElementsByTagName('w:t'))
    .map(t => t.textContent || '').join('').trim()).filter(Boolean)
}
async function readDocx(bytes: ArrayBuffer) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
  const names = Object.keys(zip.files)
  if (names.length > 1200 || !zip.file('word/document.xml')) throw new Error('Isi atau struktur DOCX tidak valid.')
  const xml = await zip.file('word/document.xml')!.async('string')
  return normalizeText(docxParagraphs(xml).join('\n'))
}
async function readPdf(bytes: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
  // PDF.js 6 removed isEvalSupported. Only extract page text; do not execute PDF scripts.
  const loading = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })
  try {
    const document = await loading.promise
    if (document.numPages > MAX_PAGES) throw new Error('PDF terlalu panjang untuk diproses pada browser.')
    const lines: string[] = []
    let length = 0
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i)
      const content = await page.getTextContent()
      // Preserve real page row boundaries so SPO headings are not merged
      // with body text. Never execute scripts or follow embedded PDF links.
      const grouped = new Map<number, Array<{ x: number; text: string }>>()
      for (const item of content.items) {
        if (!('str' in item) || typeof item.str !== 'string' || !item.str.trim()) continue
        const transform = item.transform
        const y = Math.round((Number(transform?.[5]) || 0) / 2) * 2
        const x = Number(transform?.[4]) || 0
        const row = grouped.get(y) || []
        row.push({ x, text: item.str })
        grouped.set(y, row)
      }
      const pageLines = [...grouped.entries()].sort((a, b) => b[0] - a[0])
        .map(([, row]) => row.sort((a, b) => a.x - b.x).map(i => i.text).join(' ').trim())
        .filter(Boolean)
      lines.push(...pageLines)
      length += pageLines.join('').length
      page.cleanup()
      if (length > MAX_TEXT) break
    }
    return { text: normalizeText(lines.join('\n')), pages: document.numPages }
  } finally { await loading.destroy() }
}
async function readXlsx(bytes: ArrayBuffer) {
  const module = await import('exceljs-hardened')
  const ExcelJS: any = (module as any).default ?? module
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes)
  if (workbook.worksheets.length > MAX_SHEETS) throw new Error('Workbook mempunyai terlalu banyak worksheet.')
  const chunks: string[] = []
  let length = 0
  for (const sheet of workbook.worksheets.slice(0, MAX_SHEETS)) {
    chunks.push('[WORKSHEET ' + String(sheet.name).slice(0, 100) + ']')
    for (let n = 1; n <= Math.min(sheet.rowCount, 5000); n++) {
      const cells = (sheet.getRow(n).values || []).slice(1, 80)
        .map((v: unknown) => typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? ''))
      const line = cells.join(' | ').trim()
      if (line) { chunks.push(line); length += line.length }
      if (length > MAX_TEXT) break
    }
    if (length > MAX_TEXT) break
  }
  return normalizeText(chunks.join('\n'))
}
export async function readLocalDocument(file: File): Promise<LocalDocumentResult> {
  const ext = extension(file.name)
  if (!supported.has(ext)) throw new Error('Format tidak didukung untuk ekstraksi lokal: ' + ext)
  if (file.size < 1 || file.size > MAX_LOCAL_FILE_BYTES) throw new Error('Ukuran file harus antara 1 byte dan 15 MB.')
  const bytes = await file.arrayBuffer()
  const header = new Uint8Array(bytes.slice(0, 16))
  if (ext === 'pdf' && !pdfMagic(header)) throw new Error('Isi file tidak sesuai format PDF.')
  if (['docx', 'xlsx'].includes(ext) && !zipMagic(header)) throw new Error('Isi file tidak sesuai format Office Open XML.')
  if (['png','jpg','jpeg','webp','gif'].includes(ext) && !imageMagic(header, ext)) throw new Error('Format gambar tidak sesuai ekstensi file.')
  const sha256 = await sha256Hex(bytes)
  let text = '', pages: number | null = null
  if (ext === 'docx') text = await readDocx(bytes)
  else if (ext === 'pdf') { const result = await readPdf(bytes); text = result.text; pages = result.pages }
  else if (ext === 'xlsx') text = await readXlsx(bytes)
  else if (['csv', 'txt', 'json'].includes(ext)) {
    text = normalizeText(new TextDecoder('utf-8', { fatal: false }).decode(bytes))
    if (ext === 'json') {
      const parsed = JSON.parse(text)
      if (typeof parsed !== 'object' || parsed === null) throw new Error('File JSON harus berisi objek atau array.')
    }
  }
  const notes = ['File sumber tidak disimpan di server maupun cache browser.']
  if (!text) notes.push('Tidak ditemukan teks digital. Jika berupa scan/gambar, masukkan isi secara manual; gambar asli tidak diarsipkan.')
  return {
    title: file.name.replace(/\.[^.]+$/, '').slice(0, 180),
    extractedText: text,
    kind: ext.toUpperCase(),
    pageCount: pages,
    sha256,
    notes,
    status: text ? 'completed' : 'metadata_only'
  }
}

function cleanHeading(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '') }
export function parseSpoSections(text: string) {
  const result: Record<string, string> = {}
  const keys: Record<string,string> = {
    pengertian: 'understanding', definisi: 'understanding',
    tujuan: 'purpose', kebijakan: 'policy',
    prosedur: 'procedure', langkahkerja: 'procedure', langkahlangkah: 'procedure',
    unitterkait: 'related_units', unitkerja: 'related_units'
  }
  let section = ''
  for (const original of text.split(/\n+/)) {
    const line = original.trim()
    if (!line) continue
    const heading = line.replace(/^\d+[.\s)-]*/, '').replace(/\s*:\s*$/, '')
    const found = keys[cleanHeading(heading)]
    if (found) { section = found; continue }
    const inline = /^([^:]{2,38})\s*:\s*(.+)$/.exec(line)
    const inlineKey = inline ? keys[cleanHeading(inline[1].trim())] : undefined
    if (inlineKey) { section = inlineKey; result[section] = [result[section], inline![2]].filter(Boolean).join('\n'); continue }
    if (section) result[section] = [result[section], line].filter(Boolean).join('\n')
  }
  const procedure = (result.procedure || '').split(/\n+/).map((line, i) => ({
    step_number: i + 1, content: line.replace(/^\s*\d+[.)]\s*/, '').trim()
  })).filter(p => p.content).slice(0, 120)
  return {
    understanding: (result.understanding || '').slice(0, 16000),
    purpose: (result.purpose || '').slice(0, 16000),
    policy: (result.policy || '').slice(0, 16000),
    procedure_steps: procedure,
    related_units: (result.related_units || '').split(/[\n;,]+/).map(s => s.trim()).filter(Boolean).slice(0, 80),
  }
}

function xmlEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
export async function makeStructuredDocx(title: string, sections: StructuredSection[]): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const paragraph = (text: string, heading = false) =>
    '<w:p><w:pPr>' + (heading ? '<w:pStyle w:val="Heading1"/>' : '') + '</w:pPr><w:r><w:t xml:space="preserve">' +
    xmlEscape(text) + '</w:t></w:r></w:p>'
  const body = [paragraph(title, true), ...sections.flatMap(s =>
    [paragraph(s.heading, true), ...s.text.split(/\n/).map(line => paragraph(line))])].join('')
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.folder('_rels')!.file('.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.folder('word')!.file('document.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'<w:sectPr/></w:body></w:document>')
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
export function downloadBrowserBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 180)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
export function printStructuredContent(title: string, sections: StructuredSection[]) {
  const popup = window.open('about:blank', '_blank')
  if (!popup) throw new Error('Izinkan pop-up browser untuk mencetak atau menyimpan PDF.')
  const encode = (v: string) => xmlEscape(v).replace(/\n/g, '<br/>')
  popup.document.open()
  popup.document.write('<!doctype html><html lang="id"><head><meta charset="UTF-8"><title>'+
    xmlEscape(title)+'</title><style>body{font:12pt Arial,sans-serif;max-width:190mm;margin:20mm auto;color:#111}h1{font-size:18pt;text-align:center}h2{font-size:12pt;margin-top:22pt}p{line-height:1.5;white-space:normal}@media print{body{margin:0;max-width:initial}}</style></head><body><h1>'+
    xmlEscape(title)+'</h1>'+sections.map(s=>'<h2>'+xmlEscape(s.heading)+'</h2><p>'+encode(s.text)+'</p>').join('')+
    '<p style="font-size:9pt;margin-top:40pt">Dokumen diregenerasi dari data terstruktur AUREKA, bukan salinan file asli.</p></body></html>')
  popup.document.close()
  popup.focus()
  popup.print()
}
