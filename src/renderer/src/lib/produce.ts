import {
  extensionOf,
  imageMime,
  replaceExt,
  type ExportChoice,
} from '@shared/formats'
import { canDecodeWithoutFfmpeg, canonExt, isNativeStill, mediaChoices, playbackMime } from '@shared/media'
import {
  htmlToMarkdown,
  htmlToRtf,
  htmlToText,
  markdownToHtml,
  rowsToHtml,
  textToHtml,
  wrapDocument,
} from '@shared/text'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { FolioDoc } from '../types'
import { activeRows } from '../types'
import { htmlToDocxBytes } from './docxBuild'

export interface ExportDeps {
  isDesktop: boolean
  pandoc: boolean
  htmlToPdf: (html: string) => Promise<Uint8Array>
  pandocToBytes: (input: string, from: string, to: string) => Promise<Uint8Array>
  printHtml: (html: string, title: string) => void
  convertMedia: (payload: { path: string | null; ext: string; to: string; data?: Uint8Array }) => Promise<Uint8Array>
  decodeImage: (payload: { path: string | null; ext: string; data?: Uint8Array }) => Promise<{ png: Uint8Array; width: number; height: number }>
  rasterize: (data: Uint8Array, mime: string, target: 'png' | 'jpg' | 'webp') => Promise<Uint8Array>
  ffmpeg: boolean
}

export type ExportResult =
  | { kind: 'bytes'; data: Uint8Array; mime: string }
  | { kind: 'printed' }

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  epub: 'application/epub+zip',
  rtf: 'application/rtf',
  html: 'text/html',
  htm: 'text/html',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  jxl: 'image/jxl',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  aiff: 'audio/aiff',
  wma: 'audio/x-ms-wma',
  xml: 'application/xml',
  json: 'application/json',
  tex: 'application/x-tex',
}

const PANDOC_TARGETS: Record<string, string> = {
  odt: 'odt',
  epub: 'epub',
  tex: 'latex',
  latex: 'latex',
  rst: 'rst',
  org: 'org',
}

export function mimeFor(ext: string): string {
  return MIME[ext] ?? 'application/octet-stream'
}

export function saveFilters(preferred: string): { name: string; extensions: string[] }[] {
  const media = mediaChoices('image').concat(mediaChoices('video'), mediaChoices('audio'))
  if (media.some((choice) => choice.ext === canonExt(preferred))) {
    const filters = media.map((choice) => ({ name: choice.label, extensions: [choice.ext] }))
    const index = filters.findIndex((filter) => filter.extensions[0] === canonExt(preferred))
    if (index <= 0) return filters
    return [filters[index], ...filters.slice(0, index), ...filters.slice(index + 1)]
  }
  const filters = [
    { name: 'PDF', extensions: ['pdf'] },
    { name: 'Word', extensions: ['docx'] },
    { name: 'Markdown', extensions: ['md'] },
    { name: 'HTML', extensions: ['html'] },
    { name: 'Plain text', extensions: ['txt'] },
    { name: 'Rich text', extensions: ['rtf'] },
    { name: 'OpenDocument', extensions: ['odt'] },
    { name: 'EPUB', extensions: ['epub'] },
    { name: 'LaTeX', extensions: ['tex'] },
    { name: 'CSV', extensions: ['csv'] },
    { name: 'Excel', extensions: ['xlsx'] },
  ]
  const index = filters.findIndex((filter) => filter.extensions[0] === preferred)
  if (index <= 0) return filters
  return [filters[index], ...filters.slice(0, index), ...filters.slice(index + 1)]
}

export function choiceEnabled(choice: ExportChoice, tools: { pandoc: boolean; ffmpeg: boolean }): boolean {
  if (choice.needs === 'pandoc' && !tools.pandoc) return false
  if (choice.needs === 'ffmpeg' && !tools.ffmpeg) return false
  return true
}

function encode(text: string, encoding: 'utf-8' | 'utf-16le' | 'utf-16be' = 'utf-8'): Uint8Array {
  if (encoding === 'utf-8') return new TextEncoder().encode(text)
  const bytes = new Uint8Array(2 + text.length * 2)
  bytes[0] = encoding === 'utf-16le' ? 0xff : 0xfe
  bytes[1] = encoding === 'utf-16le' ? 0xfe : 0xff
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    const offset = 2 + index * 2
    if (encoding === 'utf-16le') {
      bytes[offset] = code & 255
      bytes[offset + 1] = code >> 8
    } else {
      bytes[offset] = code >> 8
      bytes[offset + 1] = code & 255
    }
  }
  return bytes
}

async function pictureBytes(doc: FolioDoc, deps: ExportDeps): Promise<{ data: Uint8Array; mime: string }> {
  if (doc.ext === 'svg') {
    return { data: await deps.rasterize(doc.original, 'image/svg+xml', 'png'), mime: 'image/png' }
  }
  if (isNativeStill(doc.ext)) return { data: doc.original, mime: imageMime(doc.ext) }
  if (!deps.isDesktop) throw new Error('Open this picture in the Folio desktop app.')
  const still = await deps.decodeImage(doc.path
    ? { path: doc.path, ext: doc.ext }
    : { path: null, ext: doc.ext, data: doc.original })
  return { data: still.png, mime: 'image/png' }
}

async function exportMedia(doc: FolioDoc, target: string, deps: ExportDeps): Promise<ExportResult> {
  const wanted = canonExt(target)
  if (doc.kind === 'image' && wanted === 'pdf') {
    const picture = await pictureBytes(doc, deps)
    const html = `<p><img src="data:${picture.mime};base64,${bytesToBase64(picture.data)}" alt=""></p>`
    if (!deps.isDesktop) {
      deps.printHtml(html, doc.name)
      return { kind: 'printed' }
    }
    return { kind: 'bytes', data: await deps.htmlToPdf(wrapDocument(html, doc.name)), mime: mimeFor('pdf') }
  }
  if (doc.kind === 'image' && (wanted === 'png' || wanted === 'jpg' || wanted === 'webp') && canDecodeWithoutFfmpeg(doc.ext)) {
    if (doc.ext === 'svg') {
      const rasterTarget = wanted === 'jpg' ? 'jpg' : wanted === 'webp' ? 'webp' : 'png'
      return { kind: 'bytes', data: await deps.rasterize(doc.original, 'image/svg+xml', rasterTarget), mime: mimeFor(wanted) }
    }
    const picture = await pictureBytes(doc, deps)
    if (wanted === 'png' && picture.mime === 'image/png') return { kind: 'bytes', data: picture.data, mime: 'image/png' }
    const rasterTarget = wanted === 'jpg' ? 'jpg' : wanted === 'webp' ? 'webp' : 'png'
    return { kind: 'bytes', data: await deps.rasterize(picture.data, picture.mime, rasterTarget), mime: mimeFor(rasterTarget) }
  }
  if (!deps.isDesktop) throw new Error('Open the Folio desktop app to convert this file.')
  const data = await deps.convertMedia(doc.dirty || !doc.path
    ? { path: null, ext: doc.ext, to: wanted, data: doc.original }
    : { path: doc.path, ext: doc.ext, to: wanted })
  return { kind: 'bytes', data, mime: mimeFor(wanted) === 'application/octet-stream' ? playbackMime(wanted) : mimeFor(wanted) }
}

function bytesToBase64(data: Uint8Array): string {
  let binary = ''
  const size = 0x8000
  for (let index = 0; index < data.length; index += size) {
    binary += String.fromCharCode(...data.subarray(index, index + size))
  }
  return btoa(binary)
}

function bodyHtml(doc: FolioDoc): string {
  if (doc.kind === 'image') {
    const mime = imageMime(doc.ext)
    return `<p><img src="data:${mime};base64,${bytesToBase64(doc.original)}" alt=""></p>`
  }
  if (doc.kind === 'grid') return rowsToHtml(activeRows(doc))
  if (doc.lang === 'markdown') return markdownToHtml(doc.text)
  if (doc.lang === 'html') return doc.text
  if (doc.htmlReady && doc.html) return doc.html
  return textToHtml(doc.text)
}

function workbookBytes(doc: FolioDoc, bookType: 'xlsx' | 'xls'): Uint8Array {
  const workbook = XLSX.utils.book_new()
  const sheets = doc.sheets.length > 0 ? doc.sheets : [{ name: 'Sheet', rows: activeRows(doc) }]
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows)
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31) || 'Sheet')
  }
  const output = XLSX.write(workbook, { type: 'array', bookType }) as ArrayBuffer | Uint8Array
  return output instanceof Uint8Array ? output : new Uint8Array(output)
}

export async function buildExport(doc: FolioDoc, ext: string, deps: ExportDeps): Promise<ExportResult> {
  const target = ext.toLowerCase().replace(/^\./, '')
  if (!doc.dirty && target === doc.ext) {
    return { kind: 'bytes', data: doc.original, mime: mimeFor(target) }
  }
  if (!doc.dirty && doc.ext === 'doc' && target === 'docx' && doc.kind === 'docx') {
    return { kind: 'bytes', data: doc.original, mime: mimeFor('docx') }
  }
  if ((doc.kind === 'video' || doc.kind === 'audio') && target === doc.ext && doc.textReady) {
    return { kind: 'bytes', data: encode(doc.text, doc.encoding), mime: 'text/plain;charset=utf-8' }
  }
  if (doc.kind === 'image' || doc.kind === 'video' || doc.kind === 'audio') {
    return exportMedia(doc, target, deps)
  }
  if (doc.kind === 'pdf' && target === 'pdf' && doc.painted && doc.mode !== 'edit') {
    return { kind: 'bytes', data: doc.original, mime: mimeFor('pdf') }
  }

  const html = bodyHtml(doc)

  if (target === 'pdf') {
    const wrapped = wrapDocument(html, doc.name)
    if (!deps.isDesktop) {
      deps.printHtml(html, doc.name)
      return { kind: 'printed' }
    }
    return { kind: 'bytes', data: await deps.htmlToPdf(wrapped), mime: mimeFor('pdf') }
  }

  if (target === 'docx') {
    if (deps.pandoc && deps.isDesktop) {
      return { kind: 'bytes', data: await deps.pandocToBytes(html, 'html', 'docx'), mime: mimeFor('docx') }
    }
    return { kind: 'bytes', data: await htmlToDocxBytes(html, doc.name), mime: mimeFor('docx') }
  }

  const pandocTarget = PANDOC_TARGETS[target]
  if (pandocTarget) {
    if (!deps.pandoc || !deps.isDesktop) throw new Error('Install Pandoc and use the Folio desktop app to export this format.')
    return { kind: 'bytes', data: await deps.pandocToBytes(html, 'html', pandocTarget), mime: mimeFor(target) }
  }

  if (target === 'md' || target === 'markdown') {
    const markdown = doc.lang === 'markdown' ? doc.text : htmlToMarkdown(html)
    return { kind: 'bytes', data: encode(markdown), mime: mimeFor('md') }
  }

  if (target === 'html' || target === 'htm') {
    const source = doc.lang === 'html' ? doc.text : wrapDocument(html, doc.name)
    return { kind: 'bytes', data: encode(source), mime: mimeFor('html') }
  }

  if (target === 'txt' || target === 'text') {
    const text = doc.kind === 'source' && doc.lang !== 'html' ? doc.text : htmlToText(html)
    return { kind: 'bytes', data: encode(text), mime: mimeFor('txt') }
  }

  if (target === 'rtf') {
    return { kind: 'bytes', data: encode(htmlToRtf(html)), mime: mimeFor('rtf') }
  }

  if (target === 'csv' || target === 'tsv') {
    const delimiter = target === 'tsv' ? '\t' : ','
    return { kind: 'bytes', data: encode(Papa.unparse(activeRows(doc), { delimiter })), mime: mimeFor(target) }
  }

  if (target === 'xlsx' || target === 'xls') {
    return { kind: 'bytes', data: workbookBytes(doc, target), mime: mimeFor(target) }
  }

  if (target === 'json' || target === 'xml') {
    return { kind: 'bytes', data: encode(doc.text, doc.encoding), mime: mimeFor(target) }
  }

  if (doc.kind === 'source' && target === doc.ext && doc.textReady) {
    return { kind: 'bytes', data: encode(doc.text, doc.encoding), mime: 'text/plain;charset=utf-8' }
  }

  throw new Error(`Folio can’t export .${target} from this document.`)
}

export function exportedName(name: string, ext: string): string {
  return replaceExt(name, ext)
}

export function chosenExtension(filePath: string, fallback: string): { path: string; ext: string } {
  const ext = extensionOf(filePath)
  if (ext) return { path: filePath, ext }
  return { path: `${filePath}.${fallback}`, ext: fallback }
}
