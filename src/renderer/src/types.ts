import type { DocKind, SourceLang, ViewMode } from '@shared/formats'

export interface SheetData {
  name: string
  rows: string[][]
}

export interface FolioDoc {
  id: string
  path: string | null
  name: string
  ext: string
  label: string
  kind: DocKind
  lang: SourceLang
  original: Uint8Array
  text: string
  html: string
  sheets: SheetData[]
  sheet: string
  imageUrl: string | null
  mediaUrl: string | null
  width: number | null
  height: number | null
  duration: number | null
  dirty: boolean
  mode: ViewMode
  notice: string | null
  textReady: boolean
  htmlReady: boolean
  readOnly: boolean
  encoding: 'utf-8' | 'utf-16le' | 'utf-16be'
  painted: boolean
}

export function activeRows(doc: FolioDoc): string[][] {
  return doc.sheets.find((sheet) => sheet.name === doc.sheet)?.rows ?? doc.sheets[0]?.rows ?? []
}

export interface Tools {
  pandoc: boolean
  libreoffice: boolean
  ffmpeg: boolean
  pandocPath: string | null
  libreofficePath: string | null
  ffmpegPath: string | null
  ffprobePath: string | null
}

export interface RecentItem {
  path: string
  name: string
  ext: string
  openedAt: number
}

export type Registration = 'added' | 'skipped' | 'failed' | 'pending'

export type PageLook = 'match' | 'paper' | 'night'

export const EMPTY_TOOLS: Tools = {
  pandoc: false,
  libreoffice: false,
  ffmpeg: false,
  pandocPath: null,
  libreofficePath: null,
  ffmpegPath: null,
  ffprobePath: null,
}
