import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

function copyBytes(data: Uint8Array): Uint8Array {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  return copy
}

export async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdf = await pdfjs.getDocument({ data: copyBytes(data) }).promise
  const pages: string[] = []
  try {
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number)
      const content = await page.getTextContent()
      let line = ''
      let lastY: number | null = null
      for (const item of content.items) {
        if (!('str' in item)) continue
        const y = item.transform[5]
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          line += `\n${item.str}`
        } else if (line && !line.endsWith('\n') && item.str) {
          line += `${item.hasEOL ? '' : ' '}${item.str}`
        } else {
          line += item.str
        }
        lastY = y
      }
      pages.push(line.trim())
    }
  } finally {
    await pdf.cleanup()
  }
  return pages.filter(Boolean).join('\n\n')
}

export { pdfjs }
