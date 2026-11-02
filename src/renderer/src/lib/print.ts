import { wrapDocument } from '@shared/text'

export function printHtml(html: string, title: string): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('title', 'Print')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const printed = frame.contentDocument
  if (!printed) {
    frame.remove()
    throw new Error('The browser blocked the print preview.')
  }
  printed.open()
  printed.write(wrapDocument(html, title))
  printed.close()
  frame.contentWindow?.focus()
  frame.contentWindow?.print()
  window.setTimeout(() => frame.remove(), 1500)
}
