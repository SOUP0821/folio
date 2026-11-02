import { useEffect, useRef } from 'react'

type Glyph = 'block' | 'arrow' | 'ring'

interface Mote {
  x: number
  y: number
  speed: number
  bob: number
  phase: number
  glyphs: Glyph[]
}

const GLYPHS: Glyph[] = ['block', 'arrow', 'ring']

function colorOf(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function paint(context: CanvasRenderingContext2D, x: number, y: number, column: number, row: number, width: number, height: number, fill: string): void {
  context.fillStyle = fill
  context.fillRect(x + column * 4, y + row * 4, width * 4, height * 4)
}

function drawGlyph(context: CanvasRenderingContext2D, x: number, y: number, glyph: Glyph, ink: string, accent: string): void {
  if (glyph === 'block') {
    paint(context, x, y, 0, 0, 3, 3, ink)
    return
  }
  if (glyph === 'arrow') {
    paint(context, x, y, 0, 0, 1, 1, accent)
    paint(context, x, y, 0, 1, 3, 1, accent)
    paint(context, x, y, 0, 2, 1, 1, accent)
    return
  }
  paint(context, x, y, 0, 0, 3, 1, ink)
  paint(context, x, y, 0, 1, 1, 1, ink)
  paint(context, x, y, 2, 1, 1, 1, ink)
  paint(context, x, y, 0, 2, 3, 1, ink)
}

function drawMote(context: CanvasRenderingContext2D, mote: Mote, ink: string, accent: string): void {
  const y = mote.y + Math.sin(mote.phase) * mote.bob
  mote.glyphs.forEach((glyph, index) => {
    drawGlyph(context, mote.x + index * 16, y, glyph, ink, accent)
  })
}

function pickGlyphs(): Glyph[] {
  const pool = [...GLYPHS]
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    const current = pool[index]
    pool[index] = pool[swap]
    pool[swap] = current
  }
  return pool.slice(0, 1 + Math.floor(Math.random() * 3))
}

function seed(width: number, height: number): Mote[] {
  const count = Math.max(64, Math.round((width * height) / 8000))
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    speed: 8 + Math.random() * 14,
    bob: 6 + Math.random() * 14,
    phase: Math.random() * Math.PI * 2,
    glyphs: pickGlyphs(),
  }))
}

export function PixelField() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return undefined
    const context = canvas.getContext('2d')
    if (!context) return undefined
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let motes: Mote[] = []
    let frame = 0
    let last = 0
    let alive = true

    const fit = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const width = window.innerWidth
      const height = window.innerHeight
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      motes = seed(width, height)
    }

    const paintFrame = (time: number) => {
      const width = window.innerWidth
      const height = window.innerHeight
      const ink = colorOf('--mote', 'rgba(36, 36, 34, 0.38)')
      const accent = colorOf('--mote-accent', 'rgba(210, 101, 58, 0.85)')
      context.clearRect(0, 0, width, height)
      for (const mote of motes) {
        mote.phase = time * 0.7 + mote.x * 0.01
        drawMote(context, mote, ink, accent)
      }
    }

    const tick = (now: number) => {
      if (!alive) return
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016)
      last = now
      const width = window.innerWidth
      const height = window.innerHeight
      for (const mote of motes) {
        mote.x += mote.speed * dt
        if (mote.x > width + 8) mote.x = -56
        if (mote.y > height) mote.y = 0
      }
      paintFrame(now / 1000)
      frame = window.requestAnimationFrame(tick)
    }

    const redraw = () => {
      if (reduce) paintFrame(0)
    }

    fit()
    if (reduce) paintFrame(0)
    else frame = window.requestAnimationFrame(tick)
    window.addEventListener('resize', fit)
    window.addEventListener('folio-theme', redraw)
    return () => {
      alive = false
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', fit)
      window.removeEventListener('folio-theme', redraw)
    }
  }, [])

  return <canvas ref={ref} className="pixel-field" aria-hidden="true" />
}
