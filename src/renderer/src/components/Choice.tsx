import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export function Choice({
  axis,
  label,
  children,
}: {
  axis: 'row' | 'column'
  label: string
  children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [motion, setMotion] = useState(false)

  useLayoutEffect(() => {
    const host = root.current
    if (!host) return undefined
    const measure = () => {
      const picked = [...host.querySelectorAll<HTMLElement>('[aria-pressed="true"], [aria-checked="true"]')]
      if (picked.length === 0) {
        setBox(null)
        return
      }
      let left = Infinity
      let top = Infinity
      let right = -Infinity
      let bottom = -Infinity
      for (const item of picked) {
        const x = item.offsetLeft
        const y = item.offsetTop
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x + item.offsetWidth)
        bottom = Math.max(bottom, y + item.offsetHeight)
      }
      setBox({ x: left, y: top, w: right - left, h: bottom - top })
    }
    measure()
    const frame = requestAnimationFrame(() => setMotion(true))
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    const changes = new MutationObserver(measure)
    changes.observe(host, { attributes: true, subtree: true, attributeFilter: ['aria-pressed', 'aria-checked'] })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      changes.disconnect()
    }
  }, [children])

  return (
    <div ref={root} className={axis === 'row' ? 'choice choice-row' : 'choice choice-col'} role="group" aria-label={label}>
      <span
        className={motion ? 'choice-pill' : 'choice-pill is-instant'}
        aria-hidden="true"
        style={box ? { width: box.w, height: box.h, transform: `translate3d(${box.x}px, ${box.y}px, 0)` } : { opacity: 0 }}
      />
      {children}
    </div>
  )
}
