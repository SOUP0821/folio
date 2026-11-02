import { useEffect, useRef, useState } from 'react'
import { sanitizeHtml, wrapDocument } from '@shared/text'
import { OUTLINE_EVENT, type OutlineItem } from '../lib/outline'
import type { PageLook } from '../types'

function appearanceNow(): 'paper' | 'night' {
  return document.documentElement.dataset.theme === 'light' ? 'paper' : 'night'
}

export function HtmlFrame({ html, title, pageLook }: { html: string; title: string; pageLook: PageLook }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [themeLook, setThemeLook] = useState<'paper' | 'night'>(appearanceNow)
  useEffect(() => {
    const sync = () => setThemeLook(appearanceNow())
    window.addEventListener('folio-theme', sync)
    return () => window.removeEventListener('folio-theme', sync)
  }, [])
  const appearance = pageLook === 'match' ? themeLook : pageLook
  useEffect(() => {
    const onJump = (event: Event) => {
      const detail = (event as CustomEvent<OutlineItem>).detail
      const heading = frame.current?.contentDocument?.querySelectorAll('h1, h2, h3, h4, h5, h6')[detail.index]
      heading?.scrollIntoView({ block: 'start' })
    }
    window.addEventListener(OUTLINE_EVENT, onJump)
    return () => window.removeEventListener(OUTLINE_EVENT, onJump)
  }, [html, appearance, pageLook])
  const srcDoc = wrapDocument(sanitizeHtml(html), title, appearance)
  return <iframe ref={frame} className="html-frame" title={title} sandbox="allow-same-origin" srcDoc={srcDoc} />
}
