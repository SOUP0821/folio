import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { htmlToMarkdown, htmlToText, markdownToHtml, rtfToHtml, textToRtf } from '../src/shared/text.ts'
import { odtXmlToHtml } from '../src/shared/odt.ts'
import { looksBinary } from '../src/shared/formats.ts'

describe('markdown', () => {
  it('renders a heading and a paragraph', () => {
    const html = markdownToHtml('# Title\n\nHello')
    assert.match(html, /<h1>Title<\/h1>/)
    assert.match(html, /<p>Hello<\/p>/)
  })

  it('turns html back into markdown', () => {
    const markdown = htmlToMarkdown('<h1>Title</h1><p>Hello <strong>there</strong></p>')
    assert.match(markdown, /^# Title/)
    assert.match(markdown, /Hello \*\*there\*\*/)
  })
})

describe('rtf', () => {
  it('keeps bold text and paragraphs', () => {
    const html = rtfToHtml('{\\rtf1\\ansi{\\fonttbl{\\f0 Calibri;}}\\b Hello\\b0  world\\par Second}')
    assert.match(html, /<strong>Hello<\/strong>/)
    assert.match(html, /world/)
    assert.match(html, /<p>Second<\/p>/)
  })

  it('writes unicode text into an rtf document', () => {
    const rtf = textToRtf('Café')
    assert.match(rtf, /\\rtf1/)
    assert.match(rtf, /\\u233/)
  })
})

describe('text', () => {
  it('strips tags', () => {
    assert.equal(htmlToText('<p>Hello</p><p>there</p>'), 'Hello\nthere')
  })
})

describe('odt', () => {
  it('reads headings and paragraphs', () => {
    const html = odtXmlToHtml('<office:body><text:h text:outline-level="1">Title</text:h><text:p>Hello</text:p></office:body>')
    assert.equal(html, '<h1>Title</h1><p>Hello</p>')
  })
})

describe('binary sniff', () => {
  it('rejects null bytes and accepts plain text', () => {
    assert.equal(looksBinary(new Uint8Array([0x48, 0x69, 0x00])), true)
    assert.equal(looksBinary(new TextEncoder().encode('Hello, Folio.')), false)
  })
})
