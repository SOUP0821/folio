/// <reference types="vite/client" />

interface FolioFile {
  path: string | null
  name: string
  data: Uint8Array
}

interface FolioFilter {
  name: string
  extensions: string[]
}

interface FolioTools {
  pandoc: boolean
  libreoffice: boolean
  ffmpeg: boolean
  pandocPath: string | null
  libreofficePath: string | null
  ffmpegPath: string | null
  ffprobePath: string | null
}

interface StillPreview {
  png: Uint8Array
  width: number
  height: number
}

interface PlaybackPrepared {
  url: string | null
  poster: Uint8Array | null
  width: number | null
  height: number | null
  duration: number | null
  note: string | null
}

interface FolioRecent {
  path: string
  name: string
  ext: string
  openedAt: number
}

interface FolioDesktop {
  isDesktop: true
  openFile: () => Promise<FolioFile | null>
  readPath: (path: string) => Promise<FolioFile>
  pickSave: (defaultName: string, filters: FolioFilter[]) => Promise<string | null>
  writeBytes: (path: string, data: Uint8Array) => Promise<void>
  htmlToPdf: (html: string) => Promise<Uint8Array>
  tools: () => Promise<FolioTools>
  recent: () => Promise<FolioRecent[]>
  reveal: (path: string) => Promise<void>
  fonts: () => Promise<string[]>
  pandocToText: (input: string, from: string, to: string) => Promise<string>
  pandocToBytes: (input: string, from: string, to: string) => Promise<Uint8Array>
  officeConvert: (data: Uint8Array, fromExt: string, toExt: string) => Promise<Uint8Array>
  decodeImage: (payload: { path: string | null; ext: string; data?: Uint8Array }) => Promise<StillPreview>
  prepareMedia: (payload: { path: string | null; ext: string; kind: string; force?: boolean; data?: Uint8Array }) => Promise<PlaybackPrepared>
  convertMedia: (payload: { path: string | null; ext: string; to: string; data?: Uint8Array }) => Promise<Uint8Array>
  inlineImages: (html: string, documentPath: string) => Promise<string>
  releaseMedia: (url: string) => void
  setDirty: (dirty: boolean) => void
  forceClose: () => void
  cancelClose: () => void
  registration: () => Promise<'added' | 'skipped' | 'failed' | 'pending'>
  ready: () => void
  minimize: () => void
  toggleMaximize: () => void
  closeWindow: () => void
  setBackground: (color: string) => void
  setIcon: (theme: 'light' | 'dark') => void
  onCommand: (handler: (command: string, payload?: string) => void) => () => void
  getPathForFile: (file: File) => string
}

interface Window {
  folio?: FolioDesktop
}
