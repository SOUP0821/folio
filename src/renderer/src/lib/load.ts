import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import Papa from 'papaparse'
import {
  defaultMode,
  extensionOf,
  formatFor,
  imageMime,
  isPlaylist,
  looksBinary,
  PANDOC_PREVIEW,
  type DocKind,
} from '@shared/formats'
import { isNativeStill } from '@shared/media'
import { odtXmlToHtml } from '@shared/odt'
import { htmlToText, rtfToHtml, sanitizeHtml } from '@shared/text'
import type { FolioDoc, SheetData, Tools } from '../types'
import { readDocx } from './docxParts'
import { extractPdfText } from './pdfText'

const LARGE_GRID_CELLS = 2500

function looksLikeTransportStream(data: Uint8Array): boolean {
  if (data.length < 188 * 2) return false
  return data[0] === 0x47 && data[188] === 0x47
}

function encodingOf(data: Uint8Array): 'utf-8' | 'utf-16le' | 'utf-16be' {
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) return 'utf-16le'
  if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) return 'utf-16be'
  return 'utf-8'
}

function decode(data: Uint8Array): string {
  const encoding = encodingOf(data)
  if (encoding === 'utf-8') return new TextDecoder('utf-8', { fatal: false }).decode(data).replace(/^\uFEFF/, '')
  const units = new Uint16Array(Math.floor((data.length - 2) / 2))
  for (let index = 0; index < units.length; index += 1) {
    const offset = 2 + index * 2
    const first = data[offset]
    const second = data[offset + 1]
    units[index] = encoding === 'utf-16le' ? first | (second << 8) : (first << 8) | second
  }
  let text = ''
  for (let index = 0; index < units.length; index += 8192) {
    text += String.fromCharCode(...units.subarray(index, index + 8192))
  }
  return text.replace(/^\uFEFF/, '')
}

function copyBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  return copy.buffer
}

export function blobUrl(data: Uint8Array, mime: string): string {
  return URL.createObjectURL(new Blob([copyBuffer(data)], { type: mime }))
}

function blank(name: string, path: string | null, ext: string, data: Uint8Array, kind: DocKind, label: string): FolioDoc {
  return {
    id: crypto.randomUUID(),
    path,
    name,
    ext,
    label,
    kind,
    lang: 'plain',
    original: data,
    text: '',
    html: '',
    sheets: [],
    sheet: '',
    imageUrl: null,
    mediaUrl: null,
    width: null,
    height: null,
    duration: null,
    dirty: false,
    mode: defaultMode(kind, ext),
    notice: null,
    textReady: false,
    htmlReady: false,
    readOnly: false,
    encoding: encodingOf(data),
    painted: false,
  }
}

function gridNotice(rows: string[][]): string | null {
  const cells = rows.reduce((total, row) => total + row.length, 0)
  if (cells <= LARGE_GRID_CELLS) return null
  return 'This sheet is large, so Folio opened it read-only.'
}

function asRows(value: unknown): string[][] {
  if (!Array.isArray(value)) return [['']]
  const rows = value.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : [])
  return rows.length > 0 ? rows : [['']]
}

function sheetsFromWorkbook(data: Uint8Array): SheetData[] {
  const workbook = XLSX.read(data, { type: 'array' })
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: asRows(XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: '' })),
  }))
  return sheets.length > 0 ? sheets : [{ name: 'Sheet', rows: [['']] }]
}

function sheetsFromDelimited(text: string, delimiter: string): SheetData[] {
  const parsed = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: false })
  return [{ name: 'Sheet', rows: asRows(parsed.data) }]
}

function zipJoin(base: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0].split('?')[0])
  if (clean.startsWith('/')) return clean.replace(/^\/+/, '')
  const stack = base.split('/').filter(Boolean)
  for (const piece of clean.split('/')) {
    if (piece === '..') stack.pop()
    else if (piece && piece !== '.') stack.push(piece)
  }
  return stack.join('/')
}

function mediaType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'svg') return 'image/svg+xml'
  return 'image/png'
}

async function embedImages(zip: JSZip, base: string, html: string): Promise<string> {
  let next = html
  const seen = new Set<string>()
  for (const match of html.matchAll(/\bsrc=(["'])([^"']+)\1/g)) {
    const raw = match[2]
    if (seen.has(raw) || raw.startsWith('data:') || raw.startsWith('http:') || raw.startsWith('https:')) continue
    seen.add(raw)
    const file = zip.file(zipJoin(base, raw))
    if (!file) continue
    const src = `data:${mediaType(raw)};base64,${await file.async('base64')}`
    next = next.replaceAll(match[0], `src=${match[1]}${src}${match[1]}`)
  }
  return next
}

async function epubToHtml(data: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(copyBuffer(data))
  const container = await zip.file('META-INF/container.xml')?.async('string')
  if (!container) throw new Error('This EPUB has no container.')
  const root = /full-path="([^"]+)"/.exec(container)?.[1]
  if (!root) throw new Error('This EPUB has no package document.')
  const opf = await zip.file(root)?.async('string')
  if (!opf) throw new Error('This EPUB is missing its package document.')
  const base = root.includes('/') ? root.slice(0, root.lastIndexOf('/') + 1) : ''
  const manifest = new Map<string, string>()
  for (const match of opf.matchAll(/<item\b[^>]*>/g)) {
    const tag = match[0]
    const id = /id="([^"]+)"/.exec(tag)?.[1]
    const href = /href="([^"]+)"/.exec(tag)?.[1]
    if (id && href) manifest.set(id, decodeURIComponent(href))
  }
  const parts: string[] = []
  for (const match of opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)) {
    const href = manifest.get(match[1])
    if (!href) continue
    const file = zip.file(base + href) ?? zip.file(href)
    if (!file) continue
    const xhtml = await file.async('string')
    const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(xhtml)?.[1] ?? xhtml
    const chapterBase = (base + href).includes('/') ? (base + href).slice(0, (base + href).lastIndexOf('/') + 1) : base
    parts.push(sanitizeHtml(await embedImages(zip, chapterBase.replace(/\/$/, ''), body)))
  }
  if (parts.length === 0) throw new Error('This EPUB has no readable chapters.')
  return parts.join('<hr>')
}

async function odtToHtml(data: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(copyBuffer(data))
  const xml = await zip.file('content.xml')?.async('string')
  if (!xml) throw new Error('This OpenDocument file has no content.')
  const pictures: { key: string; href: string }[] = []
  const marked = xml.replace(/<draw:image\b[^>]*href="([^"]+)"[^>]*\/?>/gi, (_tag, href: string) => {
    const key = `FOLIOIMG${pictures.length}`
    pictures.push({ key, href })
    return key
  })
  let html = odtXmlToHtml(marked)
  const extras: string[] = []
  for (const picture of pictures) {
    const file = zip.file(decodeURIComponent(picture.href))
    if (!file) continue
    const tag = `<img src="data:${mediaType(picture.href)};base64,${await file.async('base64')}" alt="">`
    if (html.includes(picture.key)) html = html.replaceAll(picture.key, tag)
    else extras.push(`<p>${tag}</p>`)
  }
  return html + extras.join('')
}

export async function ensurePdfText(doc: FolioDoc): Promise<FolioDoc> {
  if (doc.textReady) return doc
  const text = await extractPdfText(doc.original)
  return { ...doc, text, textReady: true }
}

export async function ensureDocxHtml(doc: FolioDoc): Promise<FolioDoc> {
  if (doc.htmlReady) return doc
  const [result, extras] = await Promise.all([
    mammoth.convertToHtml({ arrayBuffer: copyBuffer(doc.original) }, {
      convertImage: mammoth.images.dataUri,
    }),
    readDocx(doc.original),
  ])
  const html = sanitizeHtml(`${extras.headerHtml}${result.value || '<p></p>'}${extras.footerHtml}`)
  return { ...doc, html, text: htmlToText(html), htmlReady: true, textReady: true }
}

export async function loadDocument(
  name: string,
  path: string | null,
  data: Uint8Array,
  tools: Tools,
  convertOffice: (bytes: Uint8Array, fromExt: string, toExt: string) => Promise<Uint8Array>,
): Promise<FolioDoc> {
  const ext = extensionOf(name)
  if (ext === 'doc') {
    if (!tools.libreoffice) {
      throw new Error('Folio needs LibreOffice to open .doc files. Install LibreOffice, or save the file as .docx.')
    }
    const converted = await convertOffice(data, 'doc', 'docx')
    const opened = await loadDocument(name.replace(/\.doc$/i, '.docx'), null, converted, tools, convertOffice)
    return {
      ...opened,
      name,
      path,
      ext: 'doc',
      label: 'Word 97',
      notice: 'Converted from .doc with LibreOffice. Saving writes a .docx file.',
    }
  }

  let known = formatFor(ext)
  if (known?.kind === 'video' && (ext === 'ts' || ext === 'mts') && !looksLikeTransportStream(data) && !(encodingOf(data) === 'utf-8' && looksBinary(data))) {
    known = { ...known, kind: 'source', label: 'TypeScript', lang: 'plain', description: 'Text you can edit' }
  }
  if (!known) {
    if (encodingOf(data) === 'utf-8' && looksBinary(data)) {
      throw new Error(`Folio doesn’t know how to open ${ext ? `.${ext}` : 'this'} file.`)
    }
    const doc = blank(name, path, ext || 'txt', data, 'source', ext ? ext.toUpperCase() : 'Text')
    return { ...doc, text: decode(data), textReady: true, mode: 'edit', notice: 'Opened as text.' }
  }

  const doc = blank(name, path, ext, data, known.kind, known.label)
  doc.lang = known.lang

  if (known.kind === 'pdf') {
    return { ...doc, notice: 'Pages stay as they are. Text edits export as a new document.' }
  }

  if (known.kind === 'image') {
    let bytes = data
    let mimeExt = ext
    if (ext === 'svgz') {
      const stream = new Blob([copyBuffer(data)]).stream().pipeThrough(new DecompressionStream('gzip'))
      bytes = new Uint8Array(await new Response(stream).arrayBuffer())
      mimeExt = 'svg'
    } else if (!isNativeStill(ext)) {
      return { ...doc, mode: 'pages' }
    }
    const url = URL.createObjectURL(new Blob([copyBuffer(bytes)], { type: imageMime(mimeExt) }))
    return { ...doc, imageUrl: url, mode: 'pages' }
  }

  if (known.kind === 'video' || known.kind === 'audio') {
    if (!isPlaylist(ext)) return { ...doc, mode: 'pages' }
    return {
      ...doc,
      mode: 'pages',
      text: decode(data),
      textReady: true,
      notice: 'Play uses FFmpeg. Edit changes the playlist text.',
    }
  }

  if (known.kind === 'source' && doc.encoding === 'utf-8' && looksBinary(data)) {
    throw new Error(`Folio can’t show .${ext} as text. It looks like a binary file.`)
  }

  if (known.kind === 'docx') {
    return {
      ...doc,
      notice: 'Layout keeps the Word file as it is. Editing rebuilds the file from the text, so complex layout can change.',
    }
  }

  if (ext === 'odt') {
    const html = await odtToHtml(data)
    return {
      ...doc,
      html,
      text: htmlToText(html),
      htmlReady: true,
      textReady: true,
      notice: 'Folio reads the text of this OpenDocument file. Export writes a new file.',
    }
  }

  if (ext === 'rtf') {
    const html = rtfToHtml(decode(data))
    return {
      ...doc,
      html,
      text: htmlToText(html),
      htmlReady: true,
      textReady: true,
      notice: 'Basic formatting is kept. Unusual RTF features are skipped.',
    }
  }

  if (ext === 'epub') {
    const html = await epubToHtml(data)
    return {
      ...doc,
      html,
      text: htmlToText(html),
      htmlReady: true,
      textReady: true,
      notice: 'Chapters are shown in reading order. Export writes a new file.',
    }
  }

  if (known.kind === 'grid' && (ext === 'xlsx' || ext === 'xls')) {
    const sheets = sheetsFromWorkbook(data)
    const readOnly = sheets.some((sheet) => gridNotice(sheet.rows))
    return {
      ...doc,
      sheets,
      sheet: sheets[0].name,
      textReady: true,
      readOnly,
      notice: readOnly ? 'This workbook has a large sheet, so Folio opened it read-only.' : null,
    }
  }

  if (known.kind === 'grid') {
    const sheets = sheetsFromDelimited(decode(data), ext === 'tsv' ? '\t' : ',')
    const readOnly = Boolean(gridNotice(sheets[0].rows))
    return {
      ...doc,
      sheets,
      sheet: sheets[0].name,
      text: decode(data),
      textReady: true,
      readOnly,
      notice: readOnly ? 'This sheet is large, so Folio opened it read-only.' : null,
    }
  }

  let text = decode(data)
  let notice: string | null = null
  if (ext === 'json') {
    try {
      text = `${JSON.stringify(JSON.parse(text), null, 2)}\n`
    } catch {
      notice = 'This JSON has a syntax error. Folio opened it as text so you can fix it.'
    }
  }
  if (PANDOC_PREVIEW[ext] && !tools.pandoc) {
    notice = 'Install Pandoc to preview this format. You can still edit the source.'
  }
  return { ...doc, text, textReady: true, notice }
}
