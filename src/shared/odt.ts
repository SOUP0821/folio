import { escapeHtml } from './text'

export function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
}

function inlineToHtml(inner: string): string {
  const withBreaks = inner
    .replace(/<text:line-break\b[^>]*\/>/g, '\n')
    .replace(/<text:tab\b[^>]*\/>/g, '\t')
    .replace(/<text:s\b[^>]*\/>/g, ' ')
  const text = decodeXml(withBreaks.replace(/<[^>]+>/g, ''))
  return escapeHtml(text).replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;').replace(/\n/g, '<br>')
}

export function odtXmlToHtml(xml: string): string {
  const blocks = [...xml.matchAll(/<text:(p|h)\b([^>]*)>([\s\S]*?)<\/text:\1>/g)]
  if (blocks.length === 0) {
    const text = decodeXml(xml.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    return text ? `<p>${escapeHtml(text)}</p>` : '<p></p>'
  }
  return blocks.map((match) => {
    const kind = match[1]
    const attrs = match[2]
    const inner = inlineToHtml(match[3])
    if (!inner.trim()) return '<p><br></p>'
    if (kind === 'h') {
      const level = Number(/text:outline-level="(\d)"/.exec(attrs)?.[1] ?? '1')
      const tag = `h${Math.min(3, Math.max(1, level))}`
      return `<${tag}>${inner}</${tag}>`
    }
    return `<p>${inner}</p>`
  }).join('')
}
