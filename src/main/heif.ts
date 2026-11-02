import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { encodePng } from './png'
import { runFfmpeg } from './ffmpeg'

const loadHeif = createRequire(import.meta.url)

interface HeifImage {
  get_width(): number
  get_height(): number
  display(
    image: { data: Uint8ClampedArray; width: number; height: number },
    done: (result: { data: Uint8ClampedArray; width: number; height: number } | null) => void,
  ): void
}

interface HeifModule {
  HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] }
}

function heifModule(): HeifModule {
  return loadHeif('libheif-js') as HeifModule
}

export async function decodeHeic(data: Uint8Array): Promise<Uint8Array> {
  const decoded = new (heifModule().HeifDecoder)().decode(data)
  if (!decoded || decoded.length === 0) throw new Error('This HEIC file has no picture.')
  const image = decoded.reduce((best, item) => (
    item.get_width() * item.get_height() > best.get_width() * best.get_height() ? item : best
  ))
  const width = image.get_width()
  const height = image.get_height()
  if (width < 1 || height < 1 || width * height > 48_000_000) {
    throw new Error('This picture is too large for Folio to open.')
  }
  const pixels = new Uint8ClampedArray(width * height * 4)
  await new Promise<void>((resolve, reject) => {
    image.display({ data: pixels, width, height }, (result) => {
      if (!result) reject(new Error('Folio could not draw this HEIC picture.'))
      else resolve()
    })
  })
  return encodePng(width, height, new Uint8Array(pixels.buffer))
}

interface Box {
  type: string
  start: number
  header: number
  end: number
}

function boxes(buf: Buffer, start: number, end: number): Box[] {
  const found: Box[] = []
  let offset = start
  while (offset + 8 <= end) {
    let size = buf.readUInt32BE(offset)
    const type = buf.toString('latin1', offset + 4, offset + 8)
    let header = 8
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(offset + 8))
      header = 16
    }
    if (size < header || offset + size > end) break
    found.push({ type, start: offset, header, end: offset + size })
    offset += size
  }
  return found
}

function nested(buf: Buffer, start: number, end: number, into: Box[]): void {
  for (const box of boxes(buf, start, end)) {
    into.push(box)
    if (['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf'].includes(box.type)) {
      nested(buf, box.start + box.header, box.end, into)
    } else if (box.type === 'stsd') {
      nested(buf, box.start + box.header + 8, box.end, into)
    } else if (box.type === 'hvc1' || box.type === 'hev1') {
      nested(buf, box.start + 86, box.end, into)
    }
  }
}

function u32(value: number): Buffer {
  const bytes = Buffer.alloc(4)
  bytes.writeUInt32BE(value >>> 0)
  return bytes
}

function u16(value: number): Buffer {
  const bytes = Buffer.alloc(2)
  bytes.writeUInt16BE(value)
  return bytes
}

function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts)
  return Buffer.concat([u32(body.length + 8), Buffer.from(type), body])
}

function full(type: string, version: number, ...parts: Buffer[]): Buffer {
  const flags = Buffer.alloc(4)
  flags[0] = version
  return box(type, flags, ...parts)
}

function wrapHevc(file: Buffer): Buffer {
  const found: Box[] = []
  nested(file, 0, file.length, found)
  const entry = found.find((item) => item.type === 'hvc1' || item.type === 'hev1')
  const config = found.find((item) => item.type === 'hvcC')
  const sizes = found.find((item) => item.type === 'stsz')
  const chunks = found.find((item) => item.type === 'stco' || item.type === 'co64')
  if (!entry || !config || !sizes || !chunks) {
    throw new Error('Folio could not prepare a HEIC file from this picture.')
  }
  const width = file.readUInt16BE(entry.start + 32)
  const height = file.readUInt16BE(entry.start + 34)
  const constant = file.readUInt32BE(sizes.start + 12)
  const sampleSize = constant || file.readUInt32BE(sizes.start + 20)
  const sampleOffset = chunks.type === 'co64'
    ? Number(file.readBigUInt64BE(chunks.start + 16))
    : file.readUInt32BE(chunks.start + 16)
  const sample = file.subarray(sampleOffset, sampleOffset + sampleSize)
  const hvcC = file.subarray(config.start, config.end)
  const ftyp = box('ftyp', Buffer.from('mif1'), u32(0), Buffer.from('mif1heic'))
  const hdlr = full('hdlr', 0, u32(0), Buffer.from('pict'), Buffer.alloc(12), Buffer.from([0]))
  const pitm = full('pitm', 0, u16(1))
  const ispe = full('ispe', 0, u32(width), u32(height))
  const infe = full('infe', 2, u16(1), u16(0), Buffer.from(entry.type), Buffer.from('HEVC Image\0'))
  const iinf = full('iinf', 0, u16(1), infe)
  const ipco = box('ipco', hvcC, ispe)
  const ipma = full('ipma', 0, u32(1), u16(1), Buffer.from([2, 0x81, 0x82]))
  const iprp = box('iprp', ipco, ipma)
  const location = Buffer.concat([
    Buffer.from([0x44, 0x00]),
    u16(1),
    u16(1),
    u16(0),
    u16(1),
    u32(0),
    u32(sample.length),
  ])
  const metaFor = () => full('meta', 0, hdlr, pitm, full('iloc', 0, location), iinf, iprp)
  const draft = metaFor()
  location.writeUInt32BE(ftyp.length + draft.length + 8, location.length - 8)
  return Buffer.concat([ftyp, metaFor(), box('mdat', sample)])
}

export async function encodeHeic(ffmpegPath: string, inputPath: string): Promise<Uint8Array> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-heic-'))
  const movie = path.join(dir, 'still.mp4')
  try {
    await runFfmpeg(ffmpegPath, [
      '-i', inputPath,
      '-vf', 'scale=trunc(max(64\\,iw)/2)*2:trunc(max(64\\,ih)/2)*2',
      '-frames:v', '1',
      '-c:v', 'libx265',
      '-tag:v', 'hvc1',
      '-pix_fmt', 'yuv420p',
      '-an',
      movie,
    ])
    const wrapped = wrapHevc(await fs.readFile(movie))
    return new Uint8Array(wrapped)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}
