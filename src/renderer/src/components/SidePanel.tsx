import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { ViewMode } from '@shared/formats'
import type { OutlineItem } from '../lib/outline'
import type { PictureOp } from '../lib/picture'
import type { PageLook, RecentItem } from '../types'
import { Choice } from './Choice'
import { PictureTools } from './PictureTools'

interface ExportItem {
  label: string
  hint?: string
  disabled?: boolean
  onClick: () => void
}

export function SidePanel({
  kind,
  modes,
  mode,
  showZoom,
  zoom,
  exports,
  recent,
  outline,
  showOutline,
  onOutline,
  onMode,
  onZoom,
  onOpenPath,
  pageLook,
  onPage,
  showPicture,
  pictureBusy,
  onPicture,
  showPdf,
  onGrip,
  onCollapse,
  onReveal,
}: {
  kind: 'work' | 'history'
  modes: { id: ViewMode; label: string }[]
  mode: ViewMode | null
  showZoom: boolean
  zoom: number
  exports: ExportItem[]
  recent: RecentItem[]
  outline: OutlineItem[]
  showOutline: boolean
  onOutline: (item: OutlineItem) => void
  onMode: (mode: ViewMode) => void
  onZoom: (direction: -1 | 1 | 0) => void
  onOpenPath: (path: string) => void
  pageLook: PageLook
  onPage: (look: PageLook) => void
  showPicture: boolean
  pictureBusy: boolean
  onPicture: (op: PictureOp) => void
  showPdf: boolean
  onGrip: (event: ReactPointerEvent) => void
  onCollapse: () => void
  onReveal: (path: string) => void
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  useEffect(() => {
    if (!menu) return undefined
    const close = () => setMenu(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
    }
  }, [menu])

  const grip = (label: string, hide: string) => (
    <div className="rail-grip" onPointerDown={onGrip} title="Drag to another side">
      <h2>{label}</h2>
      <button type="button" aria-label={hide} onPointerDown={(event) => event.stopPropagation()} onClick={onCollapse}>
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5h6M3 6.5h4" /></svg>
      </button>
    </div>
  )

  if (kind === 'history') {
    return (
      <aside className="rail" aria-label="History">
        {grip('History', 'Hide history')}
        {recent.length === 0 ? <p className="rail-note">Nothing opened yet.</p> : (
          <div className="recent">
            {recent.slice(0, 10).map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => onOpenPath(item.path)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setMenu({ x: event.clientX, y: event.clientY, path: item.path })
                }}
              >
                <span className="ext">{item.ext}</span>
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        )}
        {menu ? (
          <div className="menu menu-fixed" style={{ top: menu.y, left: menu.x }} role="menu" onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" role="menuitem" onClick={() => { onOpenPath(menu.path); setMenu(null) }}>Open</button>
            <button type="button" role="menuitem" onClick={() => { onReveal(menu.path); setMenu(null) }}>Show in Explorer</button>
          </div>
        ) : null}
      </aside>
    )
  }

  return (
    <aside className="rail" aria-label="Convert">
      {grip('Convert', 'Hide convert')}
      <h2>Page</h2>
      <Choice axis="row" label="Page">
        {(['match', 'paper', 'night'] as const).map((look) => (
          <button key={look} type="button" aria-pressed={pageLook === look} onClick={() => onPage(look)}>
            {look === 'match' ? 'Match' : look === 'paper' ? 'Paper' : 'Night'}
          </button>
        ))}
      </Choice>
      {showPicture ? (
        <>
          <h2>Picture</h2>
          <PictureTools disabled={pictureBusy} onPicture={onPicture} />
        </>
      ) : null}
      {showPdf ? <p className="rail-note">Drop a picture on a page, drag it, then Apply.</p> : null}
      {showOutline ? (
        <>
          <h2>Contents</h2>
          {outline.length === 0 ? <p className="rail-note">No headings in this file.</p> : (
            <div className="outline">
              {outline.map((item) => (
                <button
                  key={`${item.level}-${item.index}`}
                  type="button"
                  style={{ '--level': item.level } as CSSProperties}
                  onClick={() => onOutline(item)}
                >
                  {item.text}
                </button>
              ))}
            </div>
          )}
        </>
      ) : null}
      <h2>View</h2>
      {modes.length === 0 ? <p className="rail-note">Open a file to change the view.</p> : (
        <Choice axis="row" label="View">
          {modes.map((item) => (
            <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => onMode(item.id)}>
              {item.label}
            </button>
          ))}
        </Choice>
      )}
      {showZoom ? (
        <>
          <h2>Zoom {Math.round(zoom * 100)}%</h2>
          <div className="segment" role="group" aria-label="Zoom">
            <button type="button" onClick={() => onZoom(-1)}>Smaller</button>
            <button type="button" onClick={() => onZoom(0)}>Actual</button>
            <button type="button" onClick={() => onZoom(1)}>Larger</button>
          </div>
        </>
      ) : null}
      <h2>Convert</h2>
      {exports.length === 0 ? <p className="rail-note">Open a file to convert it.</p> : (
        <div className="rail-exports">
          {exports.map((item) => (
            <button key={item.label} type="button" className="btn" disabled={item.disabled} title={item.hint} onClick={item.onClick}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </aside>
  )
}
