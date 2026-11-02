import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})
turndown.use(gfm)

const CP1252: Record<number, string> = {
  0x80: '\u20ac',
  0x82: '\u201a',
  0x83: '\u0192',
  0x84: '\u201e',
  0x85: '\u2026',
  0x86: '\u2020',
  0x87: '\u2021',
  0x88: '\u02c6',
  0x89: '\u2030',
  0x8a: '\u0160',
  0x8b: '\u2039',
  0x8c: '\u0152',
  0x8e: '\u017d',
  0x91: '\u2018',
  0x92: '\u2019',
  0x93: '\u201c',
  0x94: '\u201d',
  0x95: '\u2022',
  0x96: '\u2013',
  0x97: '\u2014',
  0x98: '\u02dc',
  0x99: '\u2122',
  0x9a: '\u0161',
  0x9b: '\u203a',
  0x9c: '\u0153',
  0x9e: '\u017e',
  0x9f: '\u0178',
}

const SKIP_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'datastore',
  'themedata', 'xmlnstbl', 'listtable', 'listoverridetable', 'revtbl', 'rsidtbl',
  'generator', 'header', 'footer', 'headerl', 'headerr', 'headerf', 'footerl',
  'footerr', 'footerf', 'footnote', 'fldinst', 'xe', 'tc', 'pgdsctbl',
  'colorschememapping', 'latentstyles', 'wgrffmtfilter', 'factoidname',
])

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
}

export function sanitizeHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\s(on\w+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
}

export function textToHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized.trim()) return '<p></p>'
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|blockquote|pre)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
  return decodeEntities(stripped).replace(/\n{3,}/g, '\n\n').trim()
}

export function markdownToHtml(source: string): string {
  return sanitizeHtml(markdown.render(source))
}

export function htmlToMarkdown(html: string): string {
  const clean = sanitizeHtml(html).trim()
  if (!clean) return ''
  return turndown.turndown(clean).trim()
}

export function countWords(text: string): number {
  const words = text.trim().match(/\S+/g)
  return words ? words.length : 0
}

function decodeByte(hex: string): string {
  const value = parseInt(hex, 16)
  if (Number.isNaN(value)) return ''
  return CP1252[value] ?? String.fromCharCode(value)
}

function isIgnorableDestination(source: string, index: number): boolean {
  let cursor = index
  while (source[cursor] === '\n' || source[cursor] === '\r' || source[cursor] === ' ') cursor += 1
  if (source[cursor] === '\\' && source[cursor + 1] === '*') return true
  const match = /^\\([a-zA-Z]+)/.exec(source.slice(cursor))
  return match ? SKIP_DESTINATIONS.has(match[1].toLowerCase()) : false
}

function skipUnicodeFallback(source: string, index: number, count: number): number {
  let cursor = index
  let left = count
  while (left > 0 && cursor < source.length) {
    if (source[cursor] === '\\' && source[cursor + 1] === "'") {
      cursor += 4
    } else if (source[cursor] === '{' || source[cursor] === '}') {
      break
    } else {
      cursor += 1
    }
    left -= 1
  }
  return cursor - 1
}

export function rtfToHtml(input: string): string {
  const rtf = input.replace(/^\uFEFF/, '')
  if (!/\\rtf1?\b/.test(rtf)) return textToHtml(rtf)

  let html = ''
  let paragraph = ''
  let bold = false
  let italic = false
  let underline = false
  let ignoreDepth = 0
  let unicodeFallback = 1
  let buffer = ''

  const flushBuffer = () => {
    if (!buffer) return
    let chunk = escapeHtml(buffer).replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;').replace(/\n/g, '<br>')
    if (underline) chunk = `<u>${chunk}</u>`
    if (italic) chunk = `<em>${chunk}</em>`
    if (bold) chunk = `<strong>${chunk}</strong>`
    paragraph += chunk
    buffer = ''
  }

  const pushText = (text: string) => {
    if (!text || ignoreDepth > 0) return
    buffer += text
  }

  const setBold = (value: boolean) => {
    if (bold === value) return
    flushBuffer()
    bold = value
  }

  const setItalic = (value: boolean) => {
    if (italic === value) return
    flushBuffer()
    italic = value
  }

  const setUnderline = (value: boolean) => {
    if (underline === value) return
    flushBuffer()
    underline = value
  }

  const flush = (force: boolean) => {
    flushBuffer()
    if (!paragraph && !force) return
    html += `<p>${paragraph || '<br>'}</p>`
    paragraph = ''
  }

  for (let index = 0; index < rtf.length; index += 1) {
    const char = rtf[index]
    if (char === '{') {
      ignoreDepth = ignoreDepth > 0 || isIgnorableDestination(rtf, index + 1) ? ignoreDepth + 1 : 0
      continue
    }
    if (char === '}') {
      if (ignoreDepth > 0) ignoreDepth -= 1
      continue
    }
    if (ignoreDepth > 0) continue
    if (char === '\\') {
      const next = rtf[index + 1]
      if (next === '\\' || next === '{' || next === '}') {
        pushText(next)
        index += 1
        continue
      }
      if (next === "'") {
        pushText(decodeByte(rtf.slice(index + 2, index + 4)))
        index += 3
        continue
      }
      if (next === '~') {
        pushText('\u00a0')
        index += 1
        continue
      }
      const match = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(index))
      if (!match) continue
      const word = match[1].toLowerCase()
      const arg = match[2]
      index += match[0].length - 1
      if (word === 'par') flush(true)
      else if (word === 'line') pushText('\n')
      else if (word === 'tab') pushText('\t')
      else if (word === 'b') setBold(arg !== '0')
      else if (word === 'i') setItalic(arg !== '0')
      else if (word === 'ul' || word === 'uld' || word === 'ulw') setUnderline(arg !== '0')
      else if (word === 'ulnone') setUnderline(false)
      else if (word === 'uc' && arg) unicodeFallback = Math.max(0, parseInt(arg, 10))
      else if (word === 'u' && arg) {
        let code = parseInt(arg, 10)
        if (code < 0) code += 65536
        pushText(String.fromCharCode(code))
        index = skipUnicodeFallback(rtf, index + 1, unicodeFallback)
      }
      continue
    }
    if (char === '\n' || char === '\r') continue
    pushText(char)
  }

  flush(false)
  return html || '<p></p>'
}

function escapeRtf(text: string): string {
  let out = ''
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (char === '\\') out += '\\\\'
    else if (char === '{') out += '\\{'
    else if (char === '}') out += '\\}'
    else if (code === 10) out += '\\par '
    else if (code < 128) out += char
    else out += `\\u${code}?`
  }
  return out
}

export function htmlToRtf(html: string): string {
  const marked = sanitizeHtml(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|h4|li|blockquote|tr|pre)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<(strong|b)(\s[^>]*)?>/gi, '\u0001b')
    .replace(/<\/(strong|b)>/gi, '\u0002b')
    .replace(/<(em|i)(\s[^>]*)?>/gi, '\u0001i')
    .replace(/<\/(em|i)>/gi, '\u0002i')
    .replace(/<u(\s[^>]*)?>/gi, '\u0001u')
    .replace(/<\/u>/gi, '\u0002u')
    .replace(/<[^>]+>/g, '')
  const decoded = decodeEntities(marked).replace(/\n{3,}/g, '\n\n')
  const body = escapeRtf(decoded)
    .replace(/\u0001b/g, '\\b ')
    .replace(/\u0002b/g, '\\b0 ')
    .replace(/\u0001i/g, '\\i ')
    .replace(/\u0002i/g, '\\i0 ')
    .replace(/\u0001u/g, '\\ul ')
    .replace(/\u0002u/g, '\\ulnone ')
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Calibri;}}\\f0\\fs24 ${body.trim()}}`
}

export function textToRtf(text: string): string {
  return htmlToRtf(textToHtml(text))
}

export function rowsToHtml(rows: string[][]): string {
  if (rows.length === 0) return '<p></p>'
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')
  return `<table>${body}</table>`
}

function scrollCss(night: boolean): string {
  const thumb = night ? 'rgba(244, 243, 239, 0.28)' : 'rgba(36, 36, 34, 0.28)'
  return `html { color-scheme: ${night ? 'dark' : 'light'}; }
  * { scrollbar-width: thin; scrollbar-color: transparent transparent; }
  *::-webkit-scrollbar { width: 8px; height: 8px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb { background: transparent; border-radius: 99px; }
  *:hover, .is-scrolling { scrollbar-color: ${thumb} transparent; }
  *:hover::-webkit-scrollbar-thumb, .is-scrolling::-webkit-scrollbar-thumb { background: ${thumb}; }`
}

function withScroll(html: string, night: boolean): string {
  if (html.includes('id="folio-scroll"')) return html
  const style = `<style id="folio-scroll">${scrollCss(night)}</style>`
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (head) => `${head}${style}`)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${style}</head>`)
  return html
}

export function wrapDocument(bodyOrDocument: string, title: string, appearance: 'paper' | 'night' = 'paper'): string {
  const night = appearance === 'night'
  if (/<html[\s>]/i.test(bodyOrDocument)) return withScroll(bodyOrDocument, night)
  const safeTitle = escapeHtml(title)
  const ink = night ? '#f4f3ef' : '#1c1c1a'
  const line = night ? 'rgba(244, 243, 239, 0.16)' : '#e6e2da'
  const code = night ? 'rgba(244, 243, 239, 0.08)' : '#f4f3ef'
  const quote = night ? '#c8c4ba' : '#6f6e68'
  const link = night ? '#e7c2b0' : '#8a3a32'
  const page = night ? '#2e2e2b' : '#fffcf8'
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>
  ${scrollCss(night)}
  html, body { background: ${page}; color: ${ink}; }
  body { margin: 36px 40px; font-family: "Palatino Linotype", Palatino, Georgia, serif; font-size: 12pt; line-height: 1.55; }
  h1, h2, h3 { font-family: Calibri, "Segoe UI", sans-serif; line-height: 1.25; }
  img { max-width: 100%; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid ${line}; padding: 6px 8px; vertical-align: top; }
  pre, code { font-family: Consolas, "Courier New", monospace; }
  pre { white-space: pre-wrap; background: ${code}; padding: 12px; }
  blockquote { margin-left: 0; padding-left: 12px; border-left: 3px solid #d2653a; color: ${quote}; }
  a { color: ${link}; }
</style>
</head>
<body>
${bodyOrDocument}
</body>
</html>`
}
