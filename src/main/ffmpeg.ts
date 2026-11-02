import { spawn } from 'node:child_process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { FfmpegPlan } from '@shared/media'

const exec = promisify(execFile)

export function playlistDir(filePath: string): string | undefined {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  if (ext === 'm3u8' || ext === 'm3u' || ext === 'pls') return path.dirname(filePath)
  return undefined
}

export async function playlistInput(filePath: string): Promise<{ filePath: string; cwd?: string; cleanup: string | null }> {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  const cwd = playlistDir(filePath)
  if (ext === 'm3u8' || ext === 'm3u') return { filePath, cwd, cleanup: null }
  if (ext !== 'pls') return { filePath, cleanup: null }
  const text = await fs.readFile(filePath, 'utf8')
  const files = [...text.matchAll(/^File\d+\s*=\s*(.+)$/gim)].map((match) => match[1].trim()).filter(Boolean)
  if (files.length === 0 || !cwd) return { filePath, cwd, cleanup: null }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-pls-'))
  const list = path.join(dir, 'list.m3u8')
  const lines = ['#EXTM3U']
  for (const entry of files) {
    const target = (path.isAbsolute(entry) ? entry : path.resolve(cwd, entry)).replaceAll('\\', '/')
    lines.push('#EXTINF:-1,', target)
  }
  await fs.writeFile(list, `${lines.join('\n')}\n`)
  return { filePath: list, cwd, cleanup: dir }
}

export function runFfmpeg(bin: string, args: string[], timeoutMs = 480000, cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['-hide_banner', '-y', ...args], { windowsHide: true, cwd })
    let errorText = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('That conversion took too long and was stopped.'))
    }, timeoutMs)
    child.stderr.on('data', (chunk: Buffer) => {
      errorText = (errorText + chunk.toString()).slice(-5000)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      const detail = errorText.trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' ')
      reject(new Error(detail || `FFmpeg stopped (${code ?? 'unknown'}).`))
    })
  })
}

export async function convertFile(bin: string, inputPath: string, outputPath: string, plan: FfmpegPlan): Promise<void> {
  const opened = await playlistInput(inputPath)
  try {
    await runFfmpeg(bin, [...plan.input, '-i', opened.filePath, ...plan.output, outputPath], 480000, opened.cwd)
  } finally {
    if (opened.cleanup) await fs.rm(opened.cleanup, { recursive: true, force: true })
  }
}

export interface Probe {
  width: number | null
  height: number | null
  duration: number | null
}

export async function probeFile(ffprobe: string, filePath: string): Promise<Probe> {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  const lead = ext === 'm3u8' || ext === 'm3u'
    ? ['-f', 'hls', '-protocol_whitelist', 'file,http,https,tcp,tls,crypto', '-allowed_extensions', 'ALL']
    : []
  const { stdout } = await exec(ffprobe, [
    '-v', 'error',
    ...lead,
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ], { windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024, cwd: playlistDir(filePath) })
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string }
    streams?: { codec_type?: string; width?: number; height?: number; duration?: string }[]
  }
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video' && stream.width && stream.height)
  const duration = Number(parsed.format?.duration ?? video?.duration)
  return {
    width: video?.width ?? null,
    height: video?.height ?? null,
    duration: Number.isFinite(duration) ? duration : null,
  }
}
