import { useEffect, useRef, useState } from 'react'
import { readDocx } from '../lib/docxParts'
import { OUTLINE_EVENT, type OutlineItem } from '../lib/outline'

function revealPictures(root: HTMLElement) {
  root.querySelectorAll('img').forEach((node) => {
    const image = node as HTMLImageElement
    let box = image.parentElement
    while (box && box !== root) {
      if (box.style.width === '0px' || box.style.height === '0px') {
        box.style.width = image.style.width || (image.naturalWidth ? `${image.naturalWidth}px` : '480px')
        box.style.height = image.style.height || (image.naturalHeight ? `${image.naturalHeight}px` : 'auto')
        box.style.overflow = 'visible'
      }
      box = box.parentElement
    }
  })
}

export function DocxView({ data }: { data: Uint8Array }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const node = host.current
    if (!node) return undefined
    let cancelled = false
    node.replaceChildren()
    void (async () => {
      try {
        const [{ renderAsync }, extras] = await Promise.all([
          import('docx-preview'),
          readDocx(data),
        ])
        if (cancelled || !host.current) return
        await renderAsync(new Uint8Array(data), host.current, undefined, {
          className: 'docx',
          inWrapper: true,
          breakPages: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          experimental: true,
        })
        if (cancelled || !host.current) return
        const empties = [...host.current.querySelectorAll('div')].filter((box) => {
          const style = box.getAttribute('style') ?? ''
          return style.includes('width') && !box.querySelector('img, svg') && box.childElementCount === 0
        })
        extras.charts.forEach((src, index) => {
          const box = empties[index]
          if (!box) return
          const image = document.createElement('img')
          image.src = src
          image.alt = ''
          box.appendChild(image)
        })
        revealPictures(host.current)
        host.current.querySelectorAll('img').forEach((image) => {
          image.draggable = false
          image.addEventListener('load', () => {
            if (host.current) revealPictures(host.current)
          }, { once: true })
        })
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Folio could not show this Word file.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [data])

  useEffect(() => {
    const onJump = (event: Event) => {
      const detail = (event as CustomEvent<OutlineItem>).detail
      const root = host.current
      if (!root) return
      const match = [...root.querySelectorAll('p, h1, h2, h3, h4, h5, h6')].find((node) => (
        (node.textContent || '').replace(/\s+/g, ' ').trim() === detail.text
      ))
      match?.scrollIntoView({ block: 'start' })
    }
    window.addEventListener(OUTLINE_EVENT, onJump)
    return () => window.removeEventListener(OUTLINE_EVENT, onJump)
  }, [])

  return (
    <div className="docx-host">
      {error ? <p className="stage-message">{error}</p> : null}
      <div ref={host} />
    </div>
  )
}
