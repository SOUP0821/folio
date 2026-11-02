import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { moveDock, panelsOn, type DockEdge, type DockId, type DocksState } from '../lib/docks'

const LABELS: Record<DockId, string> = { history: 'History', convert: 'Convert' }

export function Docks({
  docks,
  onChange,
  history,
  convert,
  children,
}: {
  docks: DocksState
  onChange: (next: DocksState) => void
  history: (grip: (event: ReactPointerEvent) => void, collapse: () => void) => ReactNode
  convert: (grip: (event: ReactPointerEvent) => void, collapse: () => void) => ReactNode
  children: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState<DockEdge | null>(null)
  const docksRef = useRef(docks)
  docksRef.current = docks

  const edgeAt = (x: number, y: number): { edge: DockEdge; before: boolean } | null => {
    const rect = host.current?.getBoundingClientRect()
    if (!rect) return null
    const left = x - rect.left
    const right = rect.right - x
    const top = y - rect.top
    const bottom = rect.bottom - y
    const nearest = Math.min(left, right, top, bottom)
    const edge: DockEdge = nearest === left ? 'left' : nearest === right ? 'right' : nearest === top ? 'top' : 'bottom'
    const before = edge === 'left' || edge === 'right' ? y < rect.top + rect.height / 2 : x < rect.left + rect.width / 2
    return { edge, before }
  }

  const startMove = (id: DockId) => (event: ReactPointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    const move = (ev: PointerEvent) => {
      setTarget(edgeAt(ev.clientX, ev.clientY)?.edge ?? null)
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const spot = edgeAt(ev.clientX, ev.clientY)
      setTarget(null)
      if (spot) onChange(moveDock(docksRef.current, id, spot.edge, spot.before))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startPull = (id: DockId, edge: DockEdge) => (event: ReactPointerEvent) => {
    if (event.button !== 0) return
    const startX = event.clientX
    const startY = event.clientY
    let pulled = false
    const move = (ev: PointerEvent) => {
      const outward = edge === 'left' ? ev.clientX - startX : edge === 'right' ? startX - ev.clientX : edge === 'top' ? ev.clientY - startY : startY - ev.clientY
      if (outward > 28) pulled = true
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const travel = Math.hypot(ev.clientX - startX, ev.clientY - startY)
      const current = docksRef.current[id]
      if (pulled) onChange({ ...docksRef.current, [id]: { ...current, open: true } })
      else if (travel < 6) onChange({ ...docksRef.current, [id]: { ...current, open: !current.open } })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const collapse = (id: DockId) => () => {
    onChange({ ...docksRef.current, [id]: { ...docksRef.current[id], open: false } })
  }

  const panel = (id: DockId) => id === 'history' ? history(startMove(id), collapse(id)) : convert(startMove(id), collapse(id))

  const edge = (name: DockEdge) => {
    const ids = panelsOn(docks, name)
    const open = ids.filter((id) => docks[id].open)
    const closed = ids.filter((id) => !docks[id].open)
    if (open.length === 0 && closed.length === 0 && target !== name) return null
    const handles = closed.map((id) => (
      <button
        key={id}
        type="button"
        className="dock-handle"
        aria-label={`Show ${LABELS[id]}`}
        onPointerDown={startPull(id, name)}
      >
        {LABELS[id]}
      </button>
    ))
    const stack = open.length > 0 ? <div className="dock-stack">{open.map((id) => <div key={id} className="dock-slot">{panel(id)}</div>)}</div> : null
    const outerFirst = name === 'left' || name === 'top'
    return (
      <div key={name} className={target === name ? `dock dock-${name} is-target` : `dock dock-${name}`}>
        {outerFirst ? handles : null}
        {stack}
        {outerFirst ? null : handles}
      </div>
    )
  }

  return (
    <div className="workspace" ref={host}>
      {edge('top')}
      <div className="workspace-row">
        {edge('left')}
        <div className="workspace-stage">{children}</div>
        {edge('right')}
      </div>
      {edge('bottom')}
      {target ? <div className={`dock-target dock-target-${target}`} /> : null}
    </div>
  )
}
