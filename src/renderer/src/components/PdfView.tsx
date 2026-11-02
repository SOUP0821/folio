import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { stampPdf } from '../lib/pdfStamp'
import { pdfjs } from '../lib/pdfText'
import { rasterize } from '../lib/raster'

interface Sticker {
  id: string
  page: number
  x: number
  y: number
  w: number
  h: number
  aspect: number
  url: string
  bytes: Uint8Array
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function PdfView({
  data,
  zoom,
  onPages,
  onApply,
}: {
  data: Uint8Array
  zoom: number
  onPages: (count: number) => void
  onApply: (bytes: Uint8Array) => void
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const onPagesRef = useRef(onPages)
  onPagesRef.current = onPages

  useEffect(() => {
    let cancelled = false
    const task = pdfjs.getDocument({ data: new Uint8Array(data) })
    task.promise.then((document) => {
      if (cancelled) {
        void document.cleanup()
        return
      }
      setPdf(document)
      setStickers([])
      onPagesRef.current(document.numPages)
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Folio could not read this PDF.')
    })
    return () => {
      cancelled = true
      void task.destroy()
      setPdf(null)
    }
  }, [data])

  const addFile = async (file: File, page: number) => {
    const raw = new Uint8Array(await file.arrayBuffer())
    const mime = file.type || 'image/png'
    const bytes = mime === 'image/png' ? raw : await rasterize(raw, mime, 'png')
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    const url = URL.createObjectURL(new Blob([copy.buffer], { type: 'image/png' }))
    const image = new Image()
    image.src = url
    await image.decode()
    const aspect = image.naturalWidth / Math.max(1, image.naturalHeight)
    setStickers((current) => [...current, {
      id: crypto.randomUUID(),
      page,
      x: 0.12,
      y: 0.12,
      w: 0.28,
      h: Math.min(0.45, 0.28 / Math.max(aspect, 0.2)),
      aspect,
      url,
      bytes,
    }])
  }

  const apply = async () => {
    if (stickers.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const next = await stampPdf(data, stickers.map((item) => ({
        page: item.page - 1,
        bytes: item.bytes,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      })))
      onApply(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Folio could not write the pictures into this PDF.')
    } finally {
      setBusy(false)
    }
  }

  if (error && !pdf) return <p className="stage-message">{error}</p>
  if (!pdf) return <p className="stage-message">Opening pages…</p>

  return (
    <div className="pdf-pages" ref={root}>
      <div className="viewer-tools">
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Add picture</button>
        <button type="button" className="btn primary" disabled={busy || stickers.length === 0} onClick={() => { void apply() }}>
          Apply
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void addFile(file, 1)
          }}
        />
      </div>
      {error ? <p className="stage-message">{error}</p> : null}
      {Array.from({ length: pdf.numPages }, (_, index) => (
        <PdfPage
          key={`${index}-${zoom}`}
          pdf={pdf}
          number={index + 1}
          zoom={zoom}
          stickers={stickers.filter((item) => item.page === index + 1)}
          onMove={(id, x, y) => setStickers((current) => current.map((item) => item.id === id ? { ...item, x, y } : item))}
          onResize={(id, w, h) => setStickers((current) => current.map((item) => item.id === id ? { ...item, w, h } : item))}
          onDropFile={(file) => { void addFile(file, index + 1) }}
        />
      ))}
    </div>
  )
}

function PdfPage({
  pdf,
  number,
  zoom,
  stickers,
  onMove,
  onResize,
  onDropFile,
}: {
  pdf: PDFDocumentProxy
  number: number
  zoom: number
  stickers: Sticker[]
  onMove: (id: string, x: number, y: number) => void
  onResize: (id: string, w: number, h: number) => void
  onDropFile: (file: File) => void
}) {
  const holder = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const host = holder.current
    const canvas = canvasRef.current
    if (!host || !canvas) return undefined
    let renderTask: RenderTask | null = null
    let cancelled = false
    let started = false
    const observer = new IntersectionObserver((entries) => {
      if (started || cancelled || !entries.some((entry) => entry.isIntersecting)) return
      started = true
      void (async () => {
        const page = await pdf.getPage(number)
        if (cancelled) return
        const viewport = page.getViewport({ scale: zoom })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        renderTask = page.render({ canvas, viewport })
        try {
          await renderTask.promise
        } catch {
          /* cancelled renders reject */
        }
      })()
    }, { rootMargin: '700px' })
    observer.observe(host)
    return () => {
      cancelled = true
      renderTask?.cancel()
      observer.disconnect()
    }
  }, [pdf, number, zoom])

  const drag = (event: ReactPointerEvent, sticker: Sticker, mode: 'move' | 'resize') => {
    event.preventDefault()
    event.stopPropagation()
    const sheet = holder.current?.getBoundingClientRect()
    if (!sheet || sheet.width < 1 || sheet.height < 1) return
    const startX = event.clientX
    const startY = event.clientY
    const origin = sticker
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / sheet.width
      const dy = (ev.clientY - startY) / sheet.height
      if (mode === 'move') {
        onMove(sticker.id, clamp(origin.x + dx, 0, 1 - origin.w), clamp(origin.y + dy, 0, 1 - origin.h))
        return
      }
      const w = clamp(origin.w + dx, 0.06, 1 - origin.x)
      const h = clamp(w * (sheet.width / sheet.height) / origin.aspect, 0.04, 1 - origin.y)
      onResize(sticker.id, w, h)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <figure className="pdf-page">
      <div
        className="pdf-sheet"
        ref={holder}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const file = event.dataTransfer.files[0]
          if (!file || !file.type.startsWith('image/')) return
          event.preventDefault()
          event.stopPropagation()
          onDropFile(file)
        }}
      >
        <canvas ref={canvasRef} />
        {stickers.map((sticker) => (
          <div
            key={sticker.id}
            className="pdf-sticker"
            style={{ left: `${sticker.x * 100}%`, top: `${sticker.y * 100}%`, width: `${sticker.w * 100}%`, height: `${sticker.h * 100}%` }}
            onPointerDown={(event) => drag(event, sticker, 'move')}
          >
            <img src={sticker.url} alt="" draggable={false} />
            <span className="picture-resize" onPointerDown={(event) => drag(event, sticker, 'resize')} />
          </div>
        ))}
      </div>
      <figcaption>Page {number}</figcaption>
    </figure>
  )
}
