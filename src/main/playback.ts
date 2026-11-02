import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import { Readable } from 'node:stream'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  FFMPEG_MISSING,
  POSTER_ARGS,
  canonExt,
  ffmpegPlan,
  isNativePlayback,
  playbackMime,
  playlistFlags,
  previewPlan,
} from '@shared/media'
import { convertFile, playlistInput, probeFile, runFfmpeg } from './ffmpeg'
import { decodeHeic, encodeHeic } from './heif'
import { pngSize } from './png'

export interface PlaybackPrepared {
  url: string | null
  poster: Uint8Array | null
  width: number | null
  height: number | null
  duration: number | null
  note: string | null
}

const files = new Map<string, string>()
const cleanup = new Map<string, string>()

function tokenFor(filePath: string, removePath: string | null): string {
  const id = randomUUID()
  files.set(id, filePath)
  if (removePath) cleanup.set(id, removePath)
  return `folio-media://${id}/media`
}

function mediaId(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'folio-media:' ? parsed.hostname : null
  } catch {
    return null
  }
}

export function releaseMedia(url: string): void {
  const id = mediaId(url)
  if (!id) return
  files.delete(id)
  const remove = cleanup.get(id)
  cleanup.delete(id)
  if (remove) void fs.rm(remove, { recursive: true, force: true })
}

export async function cleanupMedia(): Promise<void> {
  const pending = [...cleanup.values()]
  cleanup.clear()
  files.clear()
  await Promise.all(pending.map((filePath) => fs.rm(filePath, { recursive: true, force: true })))
}

export async function serveMedia(request: Request): Promise<Response> {
  const id = mediaId(request.url)
  const filePath = id ? files.get(id) : undefined
  if (!filePath) return new Response('Not found', { status: 404 })
  const info = await fs.stat(filePath)
  const size = info.size
  const mime = playbackMime(path.extname(filePath).slice(1))
  const range = request.headers.get('range')
  if (!range) {
    return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
      },
    })
  }
  const match = /bytes=(\d*)-(\d*)/.exec(range)
  const start = match?.[1] ? Number(match[1]) : 0
  let end = match?.[2] ? Number(match[2]) : Math.min(start + 1024 * 1024 - 1, size - 1)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  }
  end = Math.min(end, size - 1)
  return new Response(Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream, {
    status: 206,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  })
}

async function materialize(sourcePath: string | null, data: Uint8Array | null, ext: string): Promise<{ filePath: string; cleanup: string | null }> {
  if (sourcePath) return { filePath: sourcePath, cleanup: null }
  if (!data) throw new Error('Choose a file to open.')
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-media-'))
  const filePath = path.join(dir, `input.${ext || 'bin'}`)
  await fs.writeFile(filePath, data)
  return { filePath, cleanup: dir }
}

async function removeDir(dir: string | null): Promise<void> {
  if (dir) await fs.rm(dir, { recursive: true, force: true })
}

export async function decodeStill(options: {
  ffmpegPath: string | null
  sourcePath: string | null
  data: Uint8Array | null
  ext: string
}): Promise<{ png: Uint8Array; width: number; height: number }> {
  const ext = options.ext.toLowerCase()
  const bytes = options.data ?? (options.sourcePath ? new Uint8Array(await fs.readFile(options.sourcePath)) : null)
  if ((ext === 'heic' || ext === 'heif') && bytes) {
    try {
      const png = await decodeHeic(bytes)
      return { png, ...pngSize(png) }
    } catch {
      /* try FFmpeg below */
    }
  }
  if (!options.ffmpegPath) throw new Error(FFMPEG_MISSING)
  const source = await materialize(options.sourcePath, bytes, ext || 'bin')
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-still-'))
  try {
    const output = path.join(dir, 'preview.png')
    await runFfmpeg(options.ffmpegPath, ['-i', source.filePath, ...POSTER_ARGS, output])
    const png = new Uint8Array(await fs.readFile(output))
    return { png, ...pngSize(png) }
  } finally {
    await removeDir(dir)
    await removeDir(source.cleanup)
  }
}

export async function convertMedia(options: {
  ffmpegPath: string | null
  sourcePath: string | null
  data: Uint8Array | null
  from: string
  to: string
}): Promise<Uint8Array> {
  if (!options.ffmpegPath) throw new Error(FFMPEG_MISSING)
  const from = options.from.toLowerCase()
  const to = canonExt(options.to)
  const source = await materialize(options.sourcePath, options.data, from || 'bin')
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-convert-'))
  try {
    if (to === 'heic' || to === 'heif') return await encodeHeic(options.ffmpegPath, source.filePath)
    const target = path.join(dir, `output.${to}`)
    await convertFile(options.ffmpegPath, source.filePath, target, ffmpegPlan(from, to))
    const bytes = new Uint8Array(await fs.readFile(target))
    if (bytes.byteLength > 200 * 1024 * 1024) throw new Error('That file would be over 200 MB.')
    return bytes
  } finally {
    await removeDir(dir)
    await removeDir(source.cleanup)
  }
}

export async function preparePlayback(options: {
  ffmpegPath: string | null
  ffprobePath: string | null
  sourcePath: string | null
  data: Uint8Array | null
  ext: string
  kind: 'video' | 'audio'
  force: boolean
}): Promise<PlaybackPrepared> {
  const ext = options.ext.toLowerCase()
  const source = await materialize(options.sourcePath, options.data, ext || 'bin')
  const opened = await playlistInput(source.filePath)
  let width: number | null = null
  let height: number | null = null
  let duration: number | null = null
  if (options.ffprobePath) {
    try {
      const probed = await probeFile(options.ffprobePath, opened.filePath)
      width = probed.width
      height = probed.height
      duration = probed.duration
    } catch {
      /* duration is a convenience */
    }
  }
  const playOriginal = isNativePlayback(ext) && !options.force
  if (playOriginal) {
    await removeDir(opened.cleanup)
    return {
      url: tokenFor(source.filePath, source.cleanup),
      poster: null,
      width,
      height,
      duration,
      note: null,
    }
  }
  if (!options.ffmpegPath) {
    await removeDir(source.cleanup)
    await removeDir(opened.cleanup)
    return {
      url: null,
      poster: null,
      width,
      height,
      duration,
      note: FFMPEG_MISSING,
    }
  }
  const preview = previewPlan(options.kind)
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-preview-'))
  const output = path.join(dir, `preview.${preview.ext}`)
  const lead = playlistFlags(ext)
  let poster: Uint8Array | null = null
  try {
    if (options.kind === 'video') {
      try {
        const posterPath = path.join(dir, 'poster.png')
        await runFfmpeg(options.ffmpegPath, [...lead, '-i', opened.filePath, ...POSTER_ARGS, posterPath], 60000, opened.cwd)
        poster = new Uint8Array(await fs.readFile(posterPath))
        const size = pngSize(poster)
        width = size.width
        height = size.height
      } catch {
        poster = null
      }
    }
    await runFfmpeg(options.ffmpegPath, [...lead, '-i', opened.filePath, ...preview.output, output], 480000, opened.cwd)
  } catch (error) {
    await removeDir(dir)
    await removeDir(source.cleanup)
    await removeDir(opened.cleanup)
    throw error
  }
  await removeDir(source.cleanup)
  await removeDir(opened.cleanup)
  return {
    url: tokenFor(output, dir),
    poster,
    width,
    height,
    duration,
    note: options.kind === 'video' ? 'Playback is the first 12 seconds. Export writes the whole file.' : null,
  }
}
