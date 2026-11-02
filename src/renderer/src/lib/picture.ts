export type PictureOp = 'upscale' | 'sharpen' | 'gray' | 'compress' | 'cutout'

export interface PictureResult {
  bytes: Uint8Array
  mime: string
  width: number
  height: number
  note: string | null
}

export const PICTURE_TOOLS: { id: PictureOp; label: string }[] = [
  { id: 'upscale', label: 'Upscale' },
  { id: 'sharpen', label: 'Sharpen' },
  { id: 'gray', label: 'Grayscale' },
  { id: 'compress', label: 'Compress' },
  { id: 'cutout', label: 'Remove background' },
]

const SHARPEN = [0, -0.45, 0, -0.45, 2.8, -0.45, 0, -0.45, 0]

function draw(bitmap: ImageBitmap, width = bitmap.width, height = bitmap.height): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Folio could not draw this picture.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return { canvas, context }
}

async function encode(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value)
      else reject(new Error('Folio could not encode this picture.'))
    }, mime, quality)
  })
  return new Uint8Array(await blob.arrayBuffer())
}

function sharpen(image: ImageData): ImageData {
  const { width, height, data } = image
  const out = new Uint8ClampedArray(data)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      for (let ky = 0; ky < 3; ky += 1) {
        for (let kx = 0; kx < 3; kx += 1) {
          const ix = Math.min(width - 1, Math.max(0, x + kx - 1))
          const iy = Math.min(height - 1, Math.max(0, y + ky - 1))
          const weight = SHARPEN[ky * 3 + kx]
          const index = (iy * width + ix) * 4
          r += data[index] * weight
          g += data[index + 1] * weight
          b += data[index + 2] * weight
        }
      }
      const index = (y * width + x) * 4
      out[index] = r
      out[index + 1] = g
      out[index + 2] = b
      out[index + 3] = data[index + 3]
    }
  }
  return new ImageData(out, width, height)
}

function grayscale(image: ImageData): void {
  const { data } = image
  for (let index = 0; index < data.length; index += 4) {
    const tone = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722
    data[index] = tone
    data[index + 1] = tone
    data[index + 2] = tone
  }
}

function cutout(image: ImageData): number {
  const { data, width, height } = image
  const colors: number[] = []
  const stepX = Math.max(1, Math.floor(width / 48))
  const stepY = Math.max(1, Math.floor(height / 48))
  const push = (x: number, y: number) => {
    const index = (y * width + x) * 4
    colors.push(data[index] + data[index + 1] + data[index + 2])
  }
  for (let x = 0; x < width; x += stepX) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y += stepY) {
    push(0, y)
    push(width - 1, y)
  }
  colors.sort((left, right) => left - right)
  const mid = colors[Math.floor(colors.length / 2)] ?? 0
  const samples: number[][] = []
  const take = (x: number, y: number) => {
    const index = (y * width + x) * 4
    if (Math.abs(data[index] + data[index + 1] + data[index + 2] - mid) < 36) {
      samples.push([data[index], data[index + 1], data[index + 2]])
    }
  }
  for (let x = 0; x < width; x += stepX) {
    take(x, 0)
    take(x, height - 1)
  }
  for (let y = 0; y < height; y += stepY) {
    take(0, y)
    take(width - 1, y)
  }
  const bg = samples.length > 0
    ? [0, 1, 2].map((channel) => samples.reduce((sum, color) => sum + color[channel], 0) / samples.length)
    : [mid / 3, mid / 3, mid / 3]
  const distance = (index: number) => {
    const dr = data[index] - bg[0]
    const dg = data[index + 1] - bg[1]
    const db = data[index + 2] - bg[2]
    return Math.sqrt(dr * dr + dg * dg + db * db)
  }
  const seen = new Uint8Array(width * height)
  const stack: number[] = []
  const visit = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const pixel = y * width + x
    if (seen[pixel]) return
    if (distance(pixel * 4) > 42) return
    seen[pixel] = 1
    stack.push(pixel)
  }
  for (let x = 0; x < width; x += 1) {
    visit(x, 0)
    visit(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    visit(0, y)
    visit(width - 1, y)
  }
  let removed = 0
  while (stack.length > 0) {
    const pixel = stack.pop() as number
    data[pixel * 4 + 3] = 0
    removed += 1
    const x = pixel % width
    const y = (pixel - x) / width
    visit(x + 1, y)
    visit(x - 1, y)
    visit(x, y + 1)
    visit(x, y - 1)
  }
  return removed
}

function opaque(image: ImageData): boolean {
  const { data } = image
  for (let index = 3; index < data.length; index += 16) {
    if (data[index] < 250) return false
  }
  return true
}

export async function editPicture(bytes: Uint8Array, mime: string, op: PictureOp): Promise<PictureResult> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const bitmap = await createImageBitmap(new Blob([copy.buffer], { type: mime || 'image/png' }))
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error('This picture is too large to edit in Folio.')
    if (op === 'upscale') {
      const longest = Math.max(bitmap.width, bitmap.height)
      const factor = Math.min(2, 8192 / longest)
      const { canvas, context } = draw(bitmap, bitmap.width * factor, bitmap.height * factor)
      const image = sharpen(context.getImageData(0, 0, canvas.width, canvas.height))
      context.putImageData(image, 0, 0)
      const next = factor < 1.2 ? 'image/png' : (mime === 'image/jpeg' ? 'image/jpeg' : 'image/png')
      return {
        bytes: await encode(canvas, next, next === 'image/jpeg' ? 0.92 : undefined),
        mime: next,
        width: canvas.width,
        height: canvas.height,
        note: factor < 1.2 ? 'Sharpened. The picture is already near the size limit.' : `Upscaled to ${canvas.width} × ${canvas.height}.`,
      }
    }
    const { canvas, context } = draw(bitmap)
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    if (op === 'sharpen') {
      context.putImageData(sharpen(image), 0, 0)
      const next = mime === 'image/jpeg' || mime === 'image/webp' ? mime : 'image/png'
      return { bytes: await encode(canvas, next, next === 'image/png' ? undefined : 0.92), mime: next, width: canvas.width, height: canvas.height, note: null }
    }
    if (op === 'gray') {
      grayscale(image)
      context.putImageData(image, 0, 0)
      const next = mime === 'image/jpeg' || mime === 'image/webp' ? mime : 'image/png'
      return { bytes: await encode(canvas, next, next === 'image/png' ? undefined : 0.92), mime: next, width: canvas.width, height: canvas.height, note: null }
    }
    if (op === 'compress') {
      const keep = opaque(image) ? 'image/jpeg' : 'image/webp'
      return {
        bytes: await encode(canvas, keep, 0.62),
        mime: keep,
        width: canvas.width,
        height: canvas.height,
        note: 'Compressed.',
      }
    }
    const removed = cutout(image)
    context.putImageData(image, 0, 0)
    return {
      bytes: await encode(canvas, 'image/png'),
      mime: 'image/png',
      width: canvas.width,
      height: canvas.height,
      note: removed < 80
        ? 'The edges were not one flat color, so the background stayed.'
        : 'Removed the background. Export PNG to keep the transparency.',
    }
  } finally {
    bitmap.close()
  }
}
