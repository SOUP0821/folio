import { OPEN_EXTENSIONS } from '@shared/formats'
import type { RecentItem, Registration, Tools } from './types'
import { EMPTY_TOOLS } from './types'

export interface OpenedFile {
  path: string | null
  name: string
  data: Uint8Array
}

export interface SaveFilter {
  name: string
  extensions: string[]
}

export interface FolioClient {
  isDesktop: boolean
  openFile: () => Promise<OpenedFile | null>
  readPath: (path: string) => Promise<OpenedFile>
  pickSave: (defaultName: string, filters: SaveFilter[]) => Promise<string | null>
  writeBytes: (path: string, data: Uint8Array) => Promise<void>
  htmlToPdf: (html: string) => Promise<Uint8Array>
  tools: () => Promise<Tools>
  recent: () => Promise<RecentItem[]>
  reveal: (path: string) => Promise<void>
  fonts: () => Promise<string[]>
  pandocToText: (input: string, from: string, to: string) => Promise<string>
  pandocToBytes: (input: string, from: string, to: string) => Promise<Uint8Array>
  officeConvert: (data: Uint8Array, fromExt: string, toExt: string) => Promise<Uint8Array>
  decodeImage: (payload: { path: string | null; ext: string; data?: Uint8Array }) => Promise<{ png: Uint8Array; width: number; height: number }>
  prepareMedia: (payload: { path: string | null; ext: string; kind: string; force?: boolean; data?: Uint8Array }) => Promise<{
    url: string | null
    poster: Uint8Array | null
    width: number | null
    height: number | null
    duration: number | null
    note: string | null
  }>
  convertMedia: (payload: { path: string | null; ext: string; to: string; data?: Uint8Array }) => Promise<Uint8Array>
  inlineImages: (html: string, documentPath: string) => Promise<string>
  releaseMedia: (url: string) => void
  setDirty: (dirty: boolean) => void
  forceClose: () => void
  cancelClose: () => void
  registration: () => Promise<Registration>
  ready: () => void
  minimize: () => void
  toggleMaximize: () => void
  closeWindow: () => void
  setBackground: (color: string) => void
  setIcon: (theme: 'light' | 'dark') => void
  onCommand: (handler: (command: string, payload?: string) => void) => () => void
  getPathForFile: (file: File) => string
}

function unavailable(action: string): never {
  throw new Error(`${action} is available in the Folio desktop app.`)
}

function pickBrowserFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = OPEN_EXTENSIONS.map((ext) => `.${ext}`).join(',')
    let settled = false
    const finish = (file: File | null) => {
      if (settled) return
      settled = true
      resolve(file)
    }
    input.addEventListener('change', () => finish(input.files?.[0] ?? null))
    window.addEventListener('focus', () => {
      window.setTimeout(() => finish(input.files?.[0] ?? null), 400)
    }, { once: true })
    input.click()
  })
}

async function fileToOpened(file: File): Promise<OpenedFile> {
  return {
    path: null,
    name: file.name,
    data: new Uint8Array(await file.arrayBuffer()),
  }
}

const browserClient: FolioClient = {
  isDesktop: false,
  openFile: async () => {
    const file = await pickBrowserFile()
    return file ? fileToOpened(file) : null
  },
  readPath: (path) => unavailable(`Opening ${path}`),
  pickSave: async () => null,
  writeBytes: async () => unavailable('Saving to a path'),
  htmlToPdf: async () => unavailable('PDF export'),
  tools: async () => EMPTY_TOOLS,
  recent: async () => [],
  reveal: async () => unavailable('Show in Explorer'),
  fonts: async () => [],
  pandocToText: async () => unavailable('Pandoc'),
  pandocToBytes: async () => unavailable('Pandoc'),
  officeConvert: async () => unavailable('LibreOffice conversion'),
  decodeImage: async () => unavailable('Picture decoding'),
  prepareMedia: async () => ({ url: null, poster: null, width: null, height: null, duration: null, note: null }),
  convertMedia: async () => unavailable('Conversion'),
  inlineImages: async (html) => html,
  releaseMedia: () => undefined,
  setDirty: () => undefined,
  forceClose: () => undefined,
  cancelClose: () => undefined,
  registration: async () => 'skipped',
  ready: () => undefined,
  minimize: () => undefined,
  toggleMaximize: () => undefined,
  closeWindow: () => undefined,
  setBackground: () => undefined,
  setIcon: () => undefined,
  onCommand: () => () => undefined,
  getPathForFile: () => '',
}

export function getBridge(): FolioClient {
  const desktop = window.folio
  if (!desktop) return browserClient
  return desktop
}

export function downloadBytes(name: string, data: Uint8Array, mime: string): void {
  const copy = new Uint8Array(data)
  const blob = new Blob([copy.buffer], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
