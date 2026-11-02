import fs from 'node:fs/promises'
import path from 'node:path'
import { playbackMime } from '@shared/media'

const MAX_IMAGES = 16
const MAX_IMAGE_BYTES = 12 * 1024 * 1024

function bytesToBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64')
}

export async function inlineLocalImages(html: string, documentPath: string): Promise<string> {
  const directory = path.dirname(path.resolve(documentPath))
  let count = 0
  const pattern = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi
  const matches = [...html.matchAll(pattern)]
  let next = html
  for (const match of matches) {
    if (count >= MAX_IMAGES) break
    const src = match[3]
    if (/^(data:|blob:|https?:|folio-media:)/i.test(src)) continue
    let relative = src.split('#')[0].split('?')[0]
    try {
      relative = decodeURIComponent(relative)
    } catch {
      continue
    }
    if (!relative || path.isAbsolute(relative)) continue
    const resolved = path.resolve(directory, relative)
    const fromRoot = path.relative(directory, resolved)
    if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) continue
    let bytes: Uint8Array
    try {
      const info = await fs.stat(resolved)
      if (!info.isFile() || info.size > MAX_IMAGE_BYTES) continue
      bytes = new Uint8Array(await fs.readFile(resolved))
    } catch {
      continue
    }
    const ext = path.extname(resolved).slice(1).toLowerCase()
    const mime = playbackMime(ext)
    if (mime === 'application/octet-stream') continue
    const dataUrl = `data:${mime};base64,${bytesToBase64(bytes)}`
    next = next.replace(match[0], `${match[1]}${match[2]}${dataUrl}${match[2]}`)
    count += 1
  }
  return next
}
