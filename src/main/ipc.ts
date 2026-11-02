import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dialog, ipcMain, shell, type BrowserWindow, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { OPEN_FILTERS } from '@shared/formats'
import { assertReadable, rememberRegistration, readRecent, rememberRecent, readDocument, writeDocument, type RecentItem } from './files'

const exec = promisify(execFile)
let fontNames: string[] | null = null

async function installedFonts(): Promise<string[]> {
  if (fontNames) return fontNames
  if (process.platform !== 'win32') return []
  const { stdout } = await exec('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Add-Type -AssemblyName System.Drawing; [System.Drawing.Text.InstalledFontCollection]::new().Families | ForEach-Object { $_.Name }',
  ], { windowsHide: true, timeout: 20000 })
  fontNames = [...new Set(stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
  return fontNames
}
import { detectTools, officeConvert, pandocConvert, type ToolPaths } from './external'
import { convertMedia, decodeStill, preparePlayback, releaseMedia } from './playback'
import { inlineLocalImages } from './images'
import { htmlToPdf } from './pdf'
import { registerOpenWith } from './associations'

interface Host {
  getWindow: () => BrowserWindow | null
  setDirty: (dirty: boolean) => void
  onRecent: (items: RecentItem[]) => void
  getTools: () => ToolPaths
  setTools: (tools: ToolPaths) => void
  getRegistration: () => 'added' | 'skipped' | 'failed' | 'pending'
  forceClose: () => void
  cancelClose: () => void
  rendererReady: () => void
}

function asBytes(input: unknown): Uint8Array {
  if (input instanceof Uint8Array) return input
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) return new Uint8Array(input)
  throw new Error('Missing file bytes.')
}

function mediaRequest(input: unknown): { path: string | null; ext: string; to: string; data: Uint8Array | null; kind: string; force: boolean } {
  if (!input || typeof input !== 'object') throw new Error('Missing file details.')
  const record = input as { path?: unknown; ext?: unknown; to?: unknown; data?: unknown; kind?: unknown; force?: unknown }
  const ext = typeof record.ext === 'string' ? record.ext.toLowerCase().replace(/^\./, '') : ''
  const to = typeof record.to === 'string' ? record.to.toLowerCase().replace(/^\./, '') : ''
  if (!/^[a-z0-9]{1,8}$/.test(ext) || (to && !/^[a-z0-9]{1,8}$/.test(to))) throw new Error('Unknown format.')
  const filePath = typeof record.path === 'string' && record.path.length > 0 ? record.path : null
  let data: Uint8Array | null = null
  if (record.data != null) data = asBytes(record.data)
  if (!filePath && !data) throw new Error('Choose a file to open.')
  return {
    path: filePath,
    ext,
    to,
    data,
    kind: typeof record.kind === 'string' ? record.kind : '',
    force: record.force === true,
  }
}

function asFilters(input: unknown): { name: string; extensions: string[] }[] {
  if (!Array.isArray(input)) return [{ name: 'All files', extensions: ['*'] }]
  const filters = input.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as { name?: unknown; extensions?: unknown }
    if (typeof candidate.name !== 'string' || !Array.isArray(candidate.extensions)) return []
    const extensions = candidate.extensions.filter((ext): ext is string => typeof ext === 'string' && ext.length < 20)
    if (extensions.length === 0) return []
    return [{ name: candidate.name.slice(0, 80), extensions }]
  })
  return filters.length > 0 ? filters : [{ name: 'All files', extensions: ['*'] }]
}

export function registerIpc(host: Host): void {
  ipcMain.handle('dialog:open', async () => {
    const options: OpenDialogOptions = {
      title: 'Open a document',
      properties: ['openFile'],
      filters: OPEN_FILTERS,
    }
    const win = host.getWindow()
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    const opened = await readDocument(result.filePaths[0])
    const recent = await rememberRecent(opened.path)
    host.onRecent(recent)
    return opened
  })

  ipcMain.handle('file:read', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string') throw new Error('Choose a file to open.')
    const opened = await readDocument(filePath)
    const recent = await rememberRecent(opened.path)
    host.onRecent(recent)
    return opened
  })

  ipcMain.handle('dialog:save', async (_event, defaultName: unknown, filters: unknown) => {
    const options: SaveDialogOptions = {
      title: 'Save document',
      defaultPath: typeof defaultName === 'string' ? defaultName : 'Untitled.txt',
      filters: asFilters(filters),
    }
    const win = host.getWindow()
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    return result.filePath
  })

  ipcMain.handle('file:write', async (_event, filePath: unknown, data: unknown) => {
    if (typeof filePath !== 'string') throw new Error('Choose where to save.')
    await writeDocument(filePath, asBytes(data))
    const recent = await rememberRecent(filePath)
    host.onRecent(recent)
  })

  ipcMain.handle('pdf:html', async (_event, html: unknown) => {
    if (typeof html !== 'string' || html.length === 0) throw new Error('There is nothing to export.')
    return htmlToPdf(html)
  })

  ipcMain.handle('tools:get', async () => {
    const tools = await detectTools()
    host.setTools(tools)
    return tools
  })

  ipcMain.handle('recent:list', async () => readRecent())

  ipcMain.handle('file:reveal', async (_event, filePath: unknown) => {
    shell.showItemInFolder(assertReadable(filePath))
  })

  ipcMain.handle('fonts:list', async () => {
    try {
      return await installedFonts()
    } catch {
      return []
    }
  })

  ipcMain.handle('pandoc:text', async (_event, input: unknown, from: unknown, to: unknown) => {
    const tools = host.getTools()
    if (!tools.pandocPath) throw new Error('Install Pandoc to convert this format.')
    if (typeof input !== 'string' || typeof from !== 'string' || typeof to !== 'string') {
      throw new Error('Missing conversion details.')
    }
    const output = await pandocConvert({ pandocPath: tools.pandocPath, input, from, to })
    if (typeof output !== 'string') throw new Error('Pandoc returned a file instead of text.')
    return output
  })

  ipcMain.handle('pandoc:bytes', async (_event, input: unknown, from: unknown, to: unknown) => {
    const tools = host.getTools()
    if (!tools.pandocPath) throw new Error('Install Pandoc to convert this format.')
    if (typeof input !== 'string' || typeof from !== 'string' || typeof to !== 'string') {
      throw new Error('Missing conversion details.')
    }
    const output = await pandocConvert({ pandocPath: tools.pandocPath, input, from, to })
    if (typeof output === 'string') return new TextEncoder().encode(output)
    return output
  })

  ipcMain.handle('office:convert', async (_event, data: unknown, fromExt: unknown, toExt: unknown) => {
    const tools = host.getTools()
    if (!tools.libreofficePath) {
      throw new Error('Install LibreOffice to open this file, or save it as .docx.')
    }
    if (typeof fromExt !== 'string' || typeof toExt !== 'string') throw new Error('Missing conversion details.')
    return officeConvert({
      sofficePath: tools.libreofficePath,
      data: asBytes(data),
      fromExt,
      toExt,
    })
  })

  ipcMain.on('doc:dirty', (_event, value: unknown) => {
    host.setDirty(value === true)
  })

  ipcMain.on('window:destroy', () => {
    host.forceClose()
  })

  ipcMain.on('window:cancel-close', () => {
    host.cancelClose()
  })

  ipcMain.handle('associations:status', async () => host.getRegistration())

  ipcMain.handle('media:decode', async (_event, payload: unknown) => {
    const request = mediaRequest(payload)
    const tools = host.getTools()
    return decodeStill({
      ffmpegPath: tools.ffmpegPath,
      sourcePath: request.path,
      data: request.data,
      ext: request.ext,
    })
  })

  ipcMain.handle('media:prepare', async (_event, payload: unknown) => {
    const request = mediaRequest(payload)
    const tools = host.getTools()
    if (request.kind !== 'video' && request.kind !== 'audio') throw new Error('That file is not audio or video.')
    return preparePlayback({
      ffmpegPath: tools.ffmpegPath,
      ffprobePath: tools.ffprobePath,
      sourcePath: request.path,
      data: request.data,
      ext: request.ext,
      kind: request.kind,
      force: request.force,
    })
  })

  ipcMain.handle('media:convert', async (_event, payload: unknown) => {
    const request = mediaRequest(payload)
    if (!request.to) throw new Error('Choose a format to convert to.')
    const tools = host.getTools()
    return convertMedia({
      ffmpegPath: tools.ffmpegPath,
      sourcePath: request.path,
      data: request.data,
      from: request.ext,
      to: request.to,
    })
  })

  ipcMain.handle('media:inline', async (_event, html: unknown, documentPath: unknown) => {
    if (typeof html !== 'string' || typeof documentPath !== 'string') return ''
    return inlineLocalImages(html, documentPath)
  })

  ipcMain.on('media:release', (_event, url: unknown) => {
    if (typeof url === 'string') releaseMedia(url)
  })

  ipcMain.on('renderer:ready', () => {
    host.rendererReady()
  })
}

export async function registerAssociations(exe: string, remember: typeof rememberRegistration): Promise<'added' | 'failed'> {
  try {
    await registerOpenWith(exe)
    await remember(exe)
    return 'added'
  } catch (error) {
    console.error(error)
    return 'failed'
  }
}
