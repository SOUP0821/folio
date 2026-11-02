import { deflateSync } from 'node:zlib'

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index]
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const name = Buffer.from(type)
  const body = Buffer.concat([name, Buffer.from(data)])
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), 8 + data.length)
  return out
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (width < 1 || height < 1 || rgba.length < width * height * 4) {
    throw new Error('Folio could not build a preview of this picture.')
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1)
    raw[row] = 0
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), row + 1)
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return new Uint8Array(Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]))
}

export function pngSize(png: Uint8Array): { width: number; height: number } {
  if (png.length < 24 || png[0] !== 137 || png[1] !== 80) {
    throw new Error('Folio could not read the preview size.')
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
