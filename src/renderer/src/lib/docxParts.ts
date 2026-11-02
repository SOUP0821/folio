import JSZip from 'jszip'
import { decodeXml } from '@shared/odt'
import { escapeHtml } from '@shared/text'
import type { OutlineItem } from './outline'

function relsPath(part: string): string {
  const slash = part.lastIndexOf('/')
  return `${part.slice(0, slash)}/_rels/${part.slice(slash + 1)}.rels`
}

function joinZip(fromPart: string, target: string): string {
  const stack = fromPart.split('/').slice(0, -1)
  for (const piece of target.split('/')) {
    if (piece === '..') stack.pop()
    else if (piece && piece !== '.') stack.push(piece)
  }
  return stack.join('/')
}

function mimeOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'svg') return 'image/svg+xml'
  return 'image/png'
}

function relationships(xml: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const tag of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(tag[0])?.[1]
    const target = /Target="([^"]+)"/.exec(tag[0])?.[1]
    if (id && target) map.set(id, target)
  }
  return map
}

function paragraphChunks(xml: string): string[] {
  return xml.split(/<w:p[\s>]/).slice(1).map((chunk) => {
    const end = chunk.indexOf('</w:p>')
    return end >= 0 ? chunk.slice(0, end) : chunk
  })
}

function paragraphText(chunk: string): string {
  return [...chunk.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((match) => decodeXml(match[1])).join('')
}

function headingLevel(chunk: string): number | null {
  const style = /<w:pStyle\b[^>]*w:val="([^"]+)"/.exec(chunk)?.[1] ?? ''
  const named = /heading\s*([1-6])/i.exec(style.replace(/([a-z])([0-9])/i, '$1 $2'))
  if (named) return Number(named[1])
  const outline = /<w:outlineLvl\b[^>]*w:val="(\d)"/.exec(chunk)
  if (outline) return Math.min(6, Number(outline[1]) + 1)
  return null
}

async function imageSrc(zip: JSZip, fromPart: string, id: string, rels: Map<string, string>): Promise<string | null> {
  const target = rels.get(id)
  if (!target || !/\.(png|jpe?g|gif|webp|svg)$/i.test(target)) return null
  const file = zip.file(joinZip(fromPart, decodeURIComponent(target)))
  if (!file) return null
  const base64 = await file.async('base64')
  return `data:${mimeOf(target)};base64,${base64}`
}

async function partHtml(zip: JSZip, part: string, kind: 'header' | 'footer'): Promise<string> {
  const xml = await zip.file(part)?.async('string')
  if (!xml) return ''
  const relsXml = await zip.file(relsPath(part))?.async('string')
  const rels = relsXml ? relationships(relsXml) : new Map<string, string>()
  const blocks: string[] = []
  for (const chunk of paragraphChunks(xml)) {
    const text = paragraphText(chunk).trim()
    const images: string[] = []
    for (const embed of chunk.matchAll(/\br:embed="([^"]+)"/g)) {
      const src = await imageSrc(zip, part, embed[1], rels)
      if (src) images.push(`<img src="${src}" alt="">`)
    }
    if (!text && images.length === 0) continue
    blocks.push(`<p>${text ? escapeHtml(text) : ''}${images.join('')}</p>`)
  }
  if (blocks.length === 0) return ''
  return `<section data-region="${kind}">${blocks.join('')}</section>`
}

export async function readDocx(data: Uint8Array): Promise<{
  headerHtml: string
  footerHtml: string
  headings: OutlineItem[]
  charts: string[]
}> {
  const zip = await JSZip.loadAsync(data)
  const documentXml = await zip.file('word/document.xml')?.async('string')
  const headings: OutlineItem[] = []
  if (documentXml) {
    for (const chunk of paragraphChunks(documentXml)) {
      const level = headingLevel(chunk)
      const text = paragraphText(chunk).replace(/\s+/g, ' ').trim()
      if (!level || !text) continue
      headings.push({ index: headings.length, level, text })
    }
  }
  const headerName = Object.keys(zip.files).find((name) => /^word\/header\d+\.xml$/i.test(name))
  const footerName = Object.keys(zip.files).find((name) => /^word\/footer\d+\.xml$/i.test(name))
  const charts: string[] = []
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/charts\/_rels\/chart\d+\.xml\.rels$/i.test(name)) continue
    const rels = relationships(await zip.file(name)?.async('string') ?? '')
    const chartPart = name.replace('/_rels/', '/').replace(/\.rels$/, '')
    for (const id of rels.keys()) {
      const src = await imageSrc(zip, chartPart, id, rels)
      if (src) charts.push(src)
    }
  }
  return {
    headerHtml: headerName ? await partHtml(zip, headerName, 'header') : '',
    footerHtml: footerName ? await partHtml(zip, footerName, 'footer') : '',
    headings,
    charts,
  }
}
