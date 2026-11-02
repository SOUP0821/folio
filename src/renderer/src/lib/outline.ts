export interface OutlineItem {
  index: number
  level: number
  text: string
  line?: number
}

export function headingsFromHtml(html: string): OutlineItem[] {
  if (!html || typeof DOMParser === 'undefined') return []
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return [...parsed.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((node, index) => ({
    index,
    level: Number(node.tagName.slice(1)),
    text: (node.textContent || '').replace(/\s+/g, ' ').trim() || 'Untitled',
  }))
}

export function headingsFromMarkdown(text: string): OutlineItem[] {
  const items: OutlineItem[] = []
  text.split(/\n/).forEach((line, lineIndex) => {
    const match = /^(#{1,6})\s+(\S.*?)\s*#*\s*$/.exec(line)
    if (!match) return
    items.push({
      index: items.length,
      level: match[1].length,
      text: match[2].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'),
      line: lineIndex + 1,
    })
  })
  return items
}

export const OUTLINE_EVENT = 'folio-outline'
