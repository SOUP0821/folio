import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const exec = promisify(execFile)

export interface ToolPaths {
  pandoc: boolean
  libreoffice: boolean
  ffmpeg: boolean
  pandocPath: string | null
  libreofficePath: string | null
  ffmpegPath: string | null
  ffprobePath: string | null
}

async function which(command: string): Promise<string | null> {
  const finder = process.platform === 'win32' ? 'where.exe' : 'which'
  try {
    const { stdout } = await exec(finder, [command], { windowsHide: true })
    const line = stdout.split(/\r?\n/).map((entry) => entry.trim()).find(Boolean)
    return line ?? null
  } catch {
    return null
  }
}

async function firstExisting(candidates: (string | null)[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      /* try the next location */
    }
  }
  return null
}

export async function detectTools(): Promise<ToolPaths> {
  const links = process.env.LOCALAPPDATA
  const pandocPath = await firstExisting([
    await which('pandoc'),
    process.platform === 'win32' ? 'C:\\Program Files\\Pandoc\\pandoc.exe' : null,
    links ? path.join(links, 'Microsoft', 'WinGet', 'Links', 'pandoc.exe') : null,
  ])
  const libreofficePath = await firstExisting([
    await which('soffice'),
    process.platform === 'win32' ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe' : null,
    process.platform === 'win32' ? 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe' : null,
  ])
  const ffmpegPath = await firstExisting([
    process.env.FOLIO_FFMPEG ?? null,
    await which('ffmpeg'),
    process.platform === 'win32' ? 'C:\\ffmpeg\\bin\\ffmpeg.exe' : null,
    links ? path.join(links, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe') : null,
  ])
  const ffprobePath = await firstExisting([
    ffmpegPath ? path.join(path.dirname(ffmpegPath), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe') : null,
    await which('ffprobe'),
  ])
  return {
    pandoc: Boolean(pandocPath),
    libreoffice: Boolean(libreofficePath),
    ffmpeg: Boolean(ffmpegPath),
    pandocPath,
    libreofficePath,
    ffmpegPath,
    ffprobePath,
  }
}

const BINARY_OUTPUT = new Set(['docx', 'odt', 'epub', 'doc', 'pdf', 'xlsx'])

export async function pandocConvert(options: {
  pandocPath: string
  input: string
  from: string
  to: string
}): Promise<Uint8Array | string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-pandoc-'))
  try {
    const inputPath = path.join(dir, 'input.txt')
    const outputPath = path.join(dir, `output.${options.to}`)
    await fs.writeFile(inputPath, options.input, 'utf8')
    await exec(options.pandocPath, ['-f', options.from, '-t', options.to, '-o', outputPath, inputPath], {
      timeout: 120000,
      windowsHide: true,
    })
    if (BINARY_OUTPUT.has(options.to)) {
      const bytes = await fs.readFile(outputPath)
      return new Uint8Array(bytes)
    }
    return fs.readFile(outputPath, 'utf8')
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

export async function officeConvert(options: {
  sofficePath: string
  data: Uint8Array
  fromExt: string
  toExt: string
}): Promise<Uint8Array> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-office-'))
  try {
    const inputPath = path.join(dir, `input.${options.fromExt.replace(/^\./, '')}`)
    await fs.writeFile(inputPath, options.data)
    await exec(options.sofficePath, [
      '--headless',
      '--norestore',
      '--convert-to',
      options.toExt.replace(/^\./, ''),
      '--outdir',
      dir,
      inputPath,
    ], {
      timeout: 180000,
      windowsHide: true,
    })
    const outputPath = path.join(dir, `input.${options.toExt.replace(/^\./, '')}`)
    const bytes = await fs.readFile(outputPath)
    return new Uint8Array(bytes)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}
