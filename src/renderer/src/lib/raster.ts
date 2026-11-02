export async function rasterize(data: Uint8Array, mime: string, target: 'png' | 'jpg' | 'webp'): Promise<Uint8Array> {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  const bitmap = await createImageBitmap(new Blob([copy.buffer], { type: mime }))
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Folio could not draw this picture.')
  if (target === 'jpg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const outMime = target === 'jpg' ? 'image/jpeg' : target === 'webp' ? 'image/webp' : 'image/png'
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value)
      else reject(new Error('Folio could not encode this picture.'))
    }, outMime, 0.92)
  })
  return new Uint8Array(await blob.arrayBuffer())
}
