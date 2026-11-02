import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type FileChild,
} from 'docx'

interface Marks {
  bold: boolean
  italics: boolean
  underline: boolean
  strike: boolean
  script?: 'sub' | 'super'
  font?: string
  size?: number
  color?: string
}

const PLAIN: Marks = { bold: false, italics: false, underline: false, strike: false }

function colorHex(color: string): string | undefined {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (hex) return hex[1]
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color)
  if (!rgb) return undefined
  return [rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')
}

function readMarks(element: HTMLElement, marks: Marks): Marks {
  const next: Marks = { ...marks }
  const tag = element.tagName.toLowerCase()
  if (tag === 'strong' || tag === 'b') next.bold = true
  if (tag === 'em' || tag === 'i') next.italics = true
  if (tag === 'u') next.underline = true
  if (tag === 's' || tag === 'strike' || tag === 'del') next.strike = true
  if (tag === 'sub') next.script = 'sub'
  if (tag === 'sup') next.script = 'super'
  if (tag === 'code') next.font = 'IBM Plex Mono'
  const color = colorHex(element.style.color)
  if (color) next.color = color
  if (element.style.fontSize.endsWith('px')) next.size = Math.max(8, Math.round(parseFloat(element.style.fontSize) * 1.5))
  if (element.style.fontFamily) next.font = element.style.fontFamily.split(',')[0].replace(/['"]/g, '').trim()
  return next
}

const HEADINGS: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  h1: HeadingLevel.HEADING_1,
  h2: HeadingLevel.HEADING_2,
  h3: HeadingLevel.HEADING_3,
  h4: HeadingLevel.HEADING_4,
  h5: HeadingLevel.HEADING_5,
  h6: HeadingLevel.HEADING_6,
}

function textRun(text: string, marks: Marks): TextRun {
  return new TextRun({
    text,
    bold: marks.bold,
    italics: marks.italics,
    underline: marks.underline ? {} : undefined,
    strike: marks.strike || undefined,
    subScript: marks.script === 'sub' || undefined,
    superScript: marks.script === 'super' || undefined,
    font: marks.font,
    size: marks.size,
    color: marks.color,
  })
}

function runsFrom(node: Node, marks: Marks): TextRun[] {
  const runs: TextRun[] = []
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? ''
      if (text) {
        runs.push(textRun(text, marks))
      }
      continue
    }
    if (!(child instanceof HTMLElement)) continue
    const tag = child.tagName.toLowerCase()
    if (tag === 'br') {
      runs.push(new TextRun({ break: 1 }))
      continue
    }
    if (tag === 'img') continue
    runs.push(...runsFrom(child, readMarks(child, marks)))
  }
  return runs
}

function imageParagraph(element: HTMLElement): Paragraph | null {
  const match = /^data:image\/(png|jpeg|jpg|gif|bmp);base64,([a-z0-9+/=\s]+)$/i.exec(element.getAttribute('src') ?? '')
  if (!match) return null
  const kind = match[1].toLowerCase()
  const type = kind === 'jpeg' || kind === 'jpg' ? 'jpg' : kind as 'png' | 'gif' | 'bmp'
  const binary = atob(match[2].replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  let width = 480
  let height = 320
  if (type === 'png' && bytes.length > 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    width = view.getUint32(16)
    height = view.getUint32(20)
  }
  const askedW = Number.parseFloat(element.getAttribute('width') || '')
  const askedH = Number.parseFloat(element.getAttribute('height') || '')
  if (askedW > 0 && askedH > 0) {
    width = askedW
    height = askedH
  } else if (askedW > 0 && width > 0) {
    height = Math.max(1, Math.round(height * (askedW / width)))
    width = askedW
  } else if (width > 620) {
    const scale = 620 / width
    width = 620
    height = Math.round(height * scale)
  }
  const align = element.getAttribute('data-align')
  const alignment = align === 'left'
    ? AlignmentType.LEFT
    : align === 'right'
      ? AlignmentType.RIGHT
      : align === 'center'
        ? AlignmentType.CENTER
        : undefined
  return new Paragraph({
    alignment,
    children: [new ImageRun({
      type,
      data: bytes,
      transformation: {
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
      },
    })],
  })
}

function alignmentOf(element: HTMLElement): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  const value = (element.style.textAlign || element.getAttribute('align') || '').toLowerCase()
  if (value === 'center') return AlignmentType.CENTER
  if (value === 'right' || value === 'end') return AlignmentType.RIGHT
  if (value === 'justify') return AlignmentType.BOTH
  if (value === 'left' || value === 'start') return AlignmentType.LEFT
  return undefined
}

function paragraphFrom(element: HTMLElement, marks: Marks, heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  const children = runsFrom(element, marks)
  return new Paragraph({
    heading,
    alignment: alignmentOf(element),
    children: children.length > 0 ? children : [new TextRun('')],
  })
}

function tableFrom(table: HTMLElement): Table {
  const rows = [...table.querySelectorAll('tr')].map((row) => new TableRow({
    children: [...row.querySelectorAll(':scope > td, :scope > th')].map((cell) => new TableCell({
      width: { size: 100, type: WidthType.AUTO },
      children: [paragraphFrom(cell as HTMLElement, {
        ...PLAIN,
        bold: cell.tagName === 'TH',
      })],
    })),
  }))
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.length > 0 ? rows : [new TableRow({ children: [new TableCell({ children: [new Paragraph('')] })] })],
  })
}

function blocksFrom(node: Node, marks: Marks): FileChild[] {
  const blocks: FileChild[] = []
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? ''
      if (text.trim()) blocks.push(new Paragraph({ children: [textRun(text, marks)] }))
      continue
    }
    if (!(child instanceof HTMLElement)) continue
    const tag = child.tagName.toLowerCase()
    if (tag === 'table') {
      blocks.push(tableFrom(child))
      continue
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = [...child.querySelectorAll(':scope > li')]
      items.forEach((item, index) => {
        const prefix = tag === 'ol' ? `${index + 1}. ` : ''
        const children = runsFrom(item, marks)
        if (prefix) children.unshift(new TextRun(prefix))
        blocks.push(new Paragraph({
          bullet: tag === 'ul' ? { level: 0 } : undefined,
          children: children.length > 0 ? children : [new TextRun('')],
        }))
      })
      continue
    }
    if (tag in HEADINGS) {
      const size = tag === 'h1' ? 36 : tag === 'h2' ? 28 : tag === 'h3' ? 24 : tag === 'h4' ? 22 : tag === 'h5' ? 20 : 18
      blocks.push(paragraphFrom(child, { ...marks, size }, HEADINGS[tag]))
      continue
    }
    if (tag === 'pre') {
      const lines = (child.textContent ?? '').split(/\n/)
      for (const line of lines) {
        blocks.push(new Paragraph({ children: [new TextRun({ text: line, font: 'Consolas', size: 20 })] }))
      }
      continue
    }
    if (tag === 'blockquote') {
      blocks.push(paragraphFrom(child, { ...marks, italics: true }))
      continue
    }
    if (tag === 'img') {
      const picture = imageParagraph(child)
      if (picture) blocks.push(picture)
      continue
    }
    if (tag === 'p' || tag === 'li') {
      for (const image of child.querySelectorAll('img')) {
        const picture = imageParagraph(image)
        if (picture) blocks.push(picture)
      }
      if ((child.textContent ?? '').trim()) blocks.push(paragraphFrom(child, marks))
      continue
    }
    if (['div', 'section', 'article', 'body', 'main'].includes(tag)) {
      const hasBlock = [...child.children].some((element) => {
        const name = element.tagName.toLowerCase()
        return ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'blockquote', 'pre', 'section', 'article'].includes(name)
      })
      if (hasBlock) blocks.push(...blocksFrom(child, marks))
      else blocks.push(paragraphFrom(child, marks))
      continue
    }
    blocks.push(...blocksFrom(child, marks))
  }
  return blocks
}

function regionBlocks(node: HTMLElement): (Paragraph | Table)[] {
  return blocksFrom(node, PLAIN).filter((block): block is Paragraph | Table => block instanceof Paragraph || block instanceof Table)
}

export async function htmlToDocxBytes(html: string, title: string): Promise<Uint8Array> {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const header = parsed.querySelector('section[data-region="header"]') as HTMLElement | null
  const footer = parsed.querySelector('section[data-region="footer"]') as HTMLElement | null
  header?.remove()
  footer?.remove()
  const children = blocksFrom(parsed.body, PLAIN)
  const headerBlocks = header ? regionBlocks(header) : []
  const footerBlocks = footer ? regionBlocks(footer) : []
  const doc = new Document({
    creator: 'Folio',
    title,
    sections: [{
      headers: headerBlocks.length > 0 ? { default: new Header({ children: headerBlocks }) } : undefined,
      footers: footerBlocks.length > 0 ? { default: new Footer({ children: footerBlocks }) } : undefined,
      children: children.length > 0 ? children : [new Paragraph('')],
    }],
  })
  const blob = await Packer.toBlob(doc)
  return new Uint8Array(await blob.arrayBuffer())
}
