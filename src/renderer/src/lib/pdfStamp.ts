export interface PdfMark {
  page: number
  bytes: Uint8Array
  x: number
  y: number
  w: number
  h: number
}

export async function stampPdf(data: Uint8Array, marks: PdfMark[]): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib')
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  const pdf = await PDFDocument.load(copy)
  for (const mark of marks) {
    const page = pdf.getPage(mark.page)
    const size = page.getSize()
    const image = await pdf.embedPng(mark.bytes)
    const width = mark.w * size.width
    const height = mark.h * size.height
    page.drawImage(image, {
      x: mark.x * size.width,
      y: size.height - (mark.y + mark.h) * size.height,
      width,
      height,
    })
  }
  return new Uint8Array(await pdf.save())
}
