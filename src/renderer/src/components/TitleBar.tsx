import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ViewMode } from '@shared/formats'
import type { RecentItem } from '../types'
import { Mark } from './Mark'

interface Item {
  label: string
  hint?: string
  disabled?: boolean
  onClick: () => void
}

export function TitleBar({
  name,
  dirty,
  desktop,
  maximized,
  recent,
  modes,
  mode,
  showZoom,
  zoom,
  exports,
  onOpen,
  onSave,
  onOpenPath,
  onReveal,
  onMode,
  onZoom,
  onUndo,
  onRedo,
  onSelectAll,
  onFormatJson,
  showFormatJson,
  onMinimize,
  onMaximize,
  onClose,
  theme,
  onHome,
  onTheme,
  sides,
  onHistory,
  onConvert,
  canBack,
  onBack,
}: {
  name: string
  dirty: boolean
  desktop: boolean
  maximized: boolean
  recent: RecentItem[]
  modes: { id: ViewMode; label: string }[]
  mode: ViewMode | null
  showZoom: boolean
  zoom: number
  exports: Item[]
  onOpen: () => void
  onSave: () => void
  onOpenPath: (path: string) => void
  onReveal: (path: string) => void
  onMode: (mode: ViewMode) => void
  onZoom: (direction: -1 | 1 | 0) => void
  onUndo: () => void
  onRedo: () => void
  onSelectAll: () => void
  onFormatJson: () => void
  showFormatJson: boolean
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
  theme: 'light' | 'dark'
  onHome: () => void
  onTheme: () => void
  sides: { history: boolean; convert: boolean }
  onHistory: (open: boolean) => void
  onConvert: (open: boolean) => void
  canBack: boolean
  onBack: () => void
}) {
  const [open, setOpen] = useState<'file' | 'edit' | 'view' | 'settings' | null>(null)
  const bar = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (event: PointerEvent) => {
      if (!bar.current?.contains(event.target as Node)) setOpen(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (action: () => void) => {
    setOpen(null)
    action()
  }

  return (
    <header
      className="topbar"
      ref={bar}
      onDoubleClick={() => {
        if (desktop) onMaximize()
      }}
    >
      <div className="topbar-start">
      <div className="brand">
        <button
          type="button"
          className="brand-home"
          aria-label="Home"
          onClick={(event) => { event.stopPropagation(); onHome() }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <Mark />
        </button>
      </div>
      <button
        type="button"
        className="menu-trigger"
        disabled={!canBack}
        onClick={(event) => { event.stopPropagation(); onBack() }}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        Back
      </button>
      <nav className="menus" aria-label="Menu" onDoubleClick={(event) => event.stopPropagation()}>
        <MenuButton label="File" expanded={open === 'file'} onToggle={() => setOpen(open === 'file' ? null : 'file')}>
          <button type="button" role="menuitem" onClick={() => pick(onOpen)}>Open<span>Ctrl+O</span></button>
          <button type="button" role="menuitem" onClick={() => pick(onSave)}>Save<span>Ctrl+S</span></button>
          {exports.length > 0 ? <p className="menu-label">Export</p> : null}
          {exports.map((item) => (
            <button key={item.label} type="button" role="menuitem" disabled={item.disabled} title={item.hint} onClick={() => pick(item.onClick)}>
              {item.label}
            </button>
          ))}
          <p className="menu-label">Recent</p>
          {recent.length === 0 ? <p className="menu-empty">Nothing opened yet</p> : recent.slice(0, 10).map((item) => (
            <button
              key={item.path}
              type="button"
              role="menuitem"
              title="Right click to show in Explorer"
              onClick={() => pick(() => onOpenPath(item.path))}
              onContextMenu={(event) => {
                event.preventDefault()
                pick(() => onReveal(item.path))
              }}
            >
              {item.name}
            </button>
          ))}
        </MenuButton>
        <MenuButton label="Edit" expanded={open === 'edit'} onToggle={() => setOpen(open === 'edit' ? null : 'edit')}>
          <button type="button" role="menuitem" onClick={() => pick(onUndo)}>Undo<span>Ctrl+Z</span></button>
          <button type="button" role="menuitem" onClick={() => pick(onRedo)}>Redo<span>Ctrl+Y</span></button>
          <button type="button" role="menuitem" onClick={() => pick(onSelectAll)}>Select all<span>Ctrl+A</span></button>
          {showFormatJson ? <button type="button" role="menuitem" onClick={() => pick(onFormatJson)}>Format JSON</button> : null}
        </MenuButton>
        <MenuButton label="View" expanded={open === 'view'} onToggle={() => setOpen(open === 'view' ? null : 'view')}>
          {modes.length === 0 ? <p className="menu-empty">Open a file to change the view</p> : modes.map((item) => (
            <button key={item.id} type="button" role="menuitem" aria-checked={mode === item.id} onClick={() => pick(() => onMode(item.id))}>
              {item.label}
              {mode === item.id ? <span>On</span> : null}
            </button>
          ))}
          {showZoom ? (
            <>
              <p className="menu-label">Zoom {Math.round(zoom * 100)}%</p>
              <button type="button" role="menuitem" onClick={() => pick(() => onZoom(1))}>Larger<span>Ctrl++</span></button>
              <button type="button" role="menuitem" onClick={() => pick(() => onZoom(-1))}>Smaller<span>Ctrl+-</span></button>
              <button type="button" role="menuitem" onClick={() => pick(() => onZoom(0))}>Actual size<span>Ctrl+0</span></button>
            </>
          ) : null}
        </MenuButton>
      </nav>
      </div>
      <div className={name ? 'doc-name' : 'doc-name is-home'} title={name || 'Folio'}>
        {name || 'Folio'}
        {dirty ? <span className="dirty">Edited</span> : null}
      </div>
      <div className="topbar-end" onDoubleClick={(event) => event.stopPropagation()}>
      <div className="chrome-tools">
        <MenuButton label="Settings" icon={<GearIcon />} expanded={open === 'settings'} onToggle={() => setOpen(open === 'settings' ? null : 'settings')}>
          <p className="menu-label">Sides</p>
          <button type="button" role="menuitemcheckbox" aria-checked={sides.history} onClick={() => onHistory(!sides.history)}>
            History
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={sides.convert} onClick={() => onConvert(!sides.convert)}>
            Convert
          </button>
        </MenuButton>
        <button
          type="button"
          className="icon-button"
          aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          onClick={(event) => { event.stopPropagation(); onTheme() }}
        >
          {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
        </button>
      </div>
      {desktop ? (
        <div className="win-controls">
          <button type="button" aria-label="Minimize" onClick={(event) => { event.stopPropagation(); onMinimize() }}>
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5.5h8" /></svg>
          </button>
          <button type="button" aria-label={maximized ? 'Restore' : 'Maximize'} onClick={(event) => { event.stopPropagation(); onMaximize() }}>
            {maximized ? (
              <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 2.5h4.5V7M2.5 4H7v4.5H2.5z" /></svg>
            ) : (
              <svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" /></svg>
            )}
          </button>
          <button type="button" className="close" aria-label="Close" onClick={(event) => { event.stopPropagation(); onClose() }}>
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2L2 8" /></svg>
          </button>
        </div>
      ) : null}
      </div>
    </header>
  )
}

function MenuButton({
  label,
  icon,
  expanded,
  onToggle,
  children,
}: {
  label: string
  icon?: ReactNode
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="menu-anchor">
      <button
        type="button"
        className={icon ? 'menu-trigger icon-button' : 'menu-trigger'}
        aria-label={icon ? label : undefined}
        aria-expanded={expanded}
        aria-haspopup="menu"
        onClick={(event) => { event.stopPropagation(); onToggle() }}
      >
        {icon ?? label}
      </button>
      {expanded ? (
        <div className={icon ? 'menu menu-end' : 'menu'} role="menu" onDoubleClick={(event) => event.stopPropagation()}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.2 4.5h11.6M2.2 8h11.6M2.2 11.5h11.6" />
      <circle cx="6" cy="4.5" r="1.45" />
      <circle cx="10.4" cy="8" r="1.45" />
      <circle cx="6.8" cy="11.5" r="1.45" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.7v1.7M8 12.6v1.7M1.7 8h1.7M12.6 8h1.7M3.4 3.4l1.2 1.2M11.4 11.4l1.2 1.2M12.6 3.4l-1.2 1.2M4.6 11.4l-1.2 1.2" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M9.4 2.3a4.7 4.7 0 1 0 4.3 6.4A3.9 3.9 0 0 1 9.4 2.3z" />
    </svg>
  )
}
