import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

const LEVELS = [
  { id: 'p', label: 'Text' },
  { id: '1', label: 'Title' },
  { id: '2', label: 'Heading' },
  { id: '3', label: 'Subheading' },
  { id: '4', label: 'Heading 4' },
  { id: '5', label: 'Heading 5' },
  { id: '6', label: 'Heading 6' },
] as const

const SIZES = ['12px', '14px', '16px', '18px', '20px', '22px', '24px', '28px', '32px', '36px', '48px']

const FALLBACK_FONTS = [
  'Literata', 'Outfit', 'IBM Plex Mono', 'Segoe UI', 'Calibri', 'Cambria', 'Georgia', 'Garamond',
  'Palatino Linotype', 'Times New Roman', 'Arial', 'Verdana', 'Tahoma', 'Trebuchet MS',
  'Consolas', 'Cascadia Mono', 'Courier New', 'Candara', 'Constantia', 'Corbel', 'Bahnschrift',
]

function blockValue(editor: Editor): string {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    if (editor.isActive('heading', { level })) return String(level)
  }
  return 'p'
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

function Tool({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="tool-icon"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function FormatBar({
  editor,
  fonts,
  onPicture,
}: {
  editor: Editor
  fonts: string[]
  onPicture: () => void
}) {
  const bar = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<'style' | 'font' | 'size' | null>(null)
  const kept = useRef<{ from: number; to: number } | null>(null)
  const [query, setQuery] = useState('')
  const [place, setPlace] = useState<{ top: number; left: number; above: boolean } | null>(null)
  const menuRef = useRef(menu)
  menuRef.current = menu

  useEffect(() => {
    let hide = 0
    const update = () => {
      let focused = menuRef.current !== null || Boolean(bar.current?.contains(document.activeElement))
      try {
        focused = editor.view.hasFocus() || focused
      } catch {
        return
      }
      if (!focused) {
        setPlace(null)
        return
      }
      const { from, to } = editor.state.selection
      let start: { top: number; bottom: number; left: number }
      let end: { top: number; bottom: number; left: number }
      try {
        start = editor.view.coordsAtPos(from)
        end = editor.view.coordsAtPos(Math.max(from, to))
      } catch {
        return
      }
      const top = Math.min(start.top, end.top)
      const bottom = Math.max(start.bottom, end.bottom)
      const left = Math.min(window.innerWidth - 560, Math.max(8, Math.min(start.left, end.left)))
      const above = top > 72
      setPlace({ top: above ? top - 8 : bottom + 8, left, above })
    }
    const onBlur = () => {
      window.clearTimeout(hide)
      hide = window.setTimeout(() => {
        if (menuRef.current || editor.view.hasFocus() || bar.current?.contains(document.activeElement)) return
        setPlace(null)
      }, 120)
    }
    editor.on('selectionUpdate', update)
    editor.on('focus', update)
    editor.on('transaction', update)
    editor.on('blur', onBlur)
    document.addEventListener('selectionchange', update)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    update()
    return () => {
      window.clearTimeout(hide)
      editor.off('selectionUpdate', update)
      editor.off('focus', update)
      editor.off('transaction', update)
      editor.off('blur', onBlur)
      document.removeEventListener('selectionchange', update)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [editor])

  if (!place) return null
  const style = blockValue(editor)
  const marks = editor.getAttributes('textStyle')
  const font = typeof marks.fontFamily === 'string' ? marks.fontFamily.replace(/['"]/g, '') : ''
  const size = typeof marks.fontSize === 'string' ? marks.fontSize : ''
  const color = typeof marks.color === 'string' && /^#[0-9a-f]{6}$/i.test(marks.color) ? marks.color : '#1c1c1a'
  const align = typeof editor.getAttributes('image').align === 'string' ? editor.getAttributes('image').align : 'center'
  const choices = (fonts.length > 0 ? fonts : FALLBACK_FONTS).filter((name, index, all) => all.indexOf(name) === index)
  const shown = choices.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 60)
  const styleLabel = LEVELS.find((item) => item.id === style)?.label ?? 'Text'

  const run = (action: () => void) => {
    const { from, to } = editor.state.selection
    action()
    if (editor.state.selection.from !== from || editor.state.selection.to !== to) {
      editor.commands.setTextSelection({ from, to })
    }
  }

  return (
    <div
      ref={bar}
      className="format-bar"
      role="toolbar"
      aria-label="Formatting"
      style={{ top: place.top, left: place.left, transform: place.above ? 'translateY(-100%)' : undefined }}
      onMouseDown={(event) => {
        if (event.target instanceof HTMLInputElement) return
        event.preventDefault()
      }}
    >
      <div className="format-menu">
        <button type="button" aria-expanded={menu === 'style'} onMouseDown={(event) => event.preventDefault()} onClick={() => setMenu(menu === 'style' ? null : 'style')}>
          {styleLabel}
        </button>
        {menu === 'style' ? (
          <div className="menu format-pop" role="listbox">
            {LEVELS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={style === item.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setMenu(null)
                  const chain = editor.chain().focus()
                  if (item.id === 'p') chain.setParagraph().run()
                  else chain.setHeading({ level: Number(item.id) as 1 | 2 | 3 | 4 | 5 | 6 }).run()
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="format-menu">
        <button type="button" aria-expanded={menu === 'font'} onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(''); setMenu(menu === 'font' ? null : 'font') }}>
          {font || 'Font'}
        </button>
        {menu === 'font' ? (
          <div className="menu format-pop" role="listbox">
            <input
              aria-label="Find a font"
              placeholder="Find a font"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => { setMenu(null); editor.chain().focus().unsetFontFamily().run() }}>
              Default
            </button>
            {shown.map((name) => (
              <button key={name} type="button" role="option" aria-selected={font === name} style={{ fontFamily: name }} onMouseDown={(event) => event.preventDefault()} onClick={() => { setMenu(null); editor.chain().focus().setFontFamily(name).run() }}>
                {name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="format-menu">
        <button type="button" aria-expanded={menu === 'size'} onMouseDown={(event) => event.preventDefault()} onClick={() => setMenu(menu === 'size' ? null : 'size')}>
          {size ? size.replace('px', '') : 'Size'}
        </button>
        {menu === 'size' ? (
          <div className="menu format-pop" role="listbox">
            {SIZES.map((item) => (
              <button key={item} type="button" role="option" aria-selected={size === item} onMouseDown={(event) => event.preventDefault()} onClick={() => { setMenu(null); editor.chain().focus().setFontSize(item).run() }}>
                {item.replace('px', '')}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <label className="color-field" title="Color">
        <input
          type="color"
          aria-label="Font color"
          value={color}
          onPointerDown={() => {
            kept.current = { from: editor.state.selection.from, to: editor.state.selection.to }
          }}
          onChange={(event) => {
            const range = kept.current ?? { from: editor.state.selection.from, to: editor.state.selection.to }
            editor.chain().focus().setTextSelection(range).setColor(event.target.value).run()
          }}
        />
      </label>
      <Tool label="Bold" pressed={editor.isActive('bold')} onClick={() => run(() => editor.chain().focus().toggleBold().run())}><b>B</b></Tool>
      <Tool label="Italic" pressed={editor.isActive('italic')} onClick={() => run(() => editor.chain().focus().toggleItalic().run())}><i>I</i></Tool>
      <Tool label="Underline" pressed={editor.isActive('underline')} onClick={() => run(() => editor.chain().focus().toggleUnderline().run())}><span className="tool-under">U</span></Tool>
      <Tool label="Strikethrough" pressed={editor.isActive('strike')} onClick={() => run(() => editor.chain().focus().toggleStrike().run())}><s>S</s></Tool>
      <Tool label="Subscript" pressed={editor.isActive('subscript')} onClick={() => run(() => editor.chain().focus().toggleSubscript().run())}>x₂</Tool>
      <Tool label="Superscript" pressed={editor.isActive('superscript')} onClick={() => run(() => editor.chain().focus().toggleSuperscript().run())}>x²</Tool>
      <Tool label="Bulleted list" pressed={editor.isActive('bulletList')} onClick={() => run(() => editor.chain().focus().toggleBulletList().run())}>
        <Icon d="M2.5 4h.01M6 4h7.5M2.5 8h.01M6 8h7.5M2.5 12h.01M6 12h7.5" />
      </Tool>
      <Tool label="Numbered list" pressed={editor.isActive('orderedList')} onClick={() => run(() => editor.chain().focus().toggleOrderedList().run())}>
        <Icon d="M3 3.5h.01M6 4h7.5M3 8h.01M6 8h7.5M3 12.5h.01M6 12h7.5" />
      </Tool>
      <Tool label="Quote" pressed={editor.isActive('blockquote')} onClick={() => run(() => editor.chain().focus().toggleBlockquote().run())}>
        <Icon d="M3 5.5c2 0 2.5 1.5 2.5 2.5S5 11 3 11M10 5.5c2 0 2.5 1.5 2.5 2.5S12 11 10 11" />
      </Tool>
      <Tool label="Picture" onClick={onPicture}>
        <Icon d="M2.5 3.5h11v9h-11zM2.5 10l3-2.5 2.2 1.8 2.3-2.3 3.5 3" />
      </Tool>
      <Tool label="Align left" pressed={editor.isActive({ textAlign: 'left' }) || (editor.isActive('image') && align === 'left')} onClick={() => alignTo(editor, 'left')}>
        <Icon d="M2.5 4h11M2.5 8h7M2.5 12h9" />
      </Tool>
      <Tool label="Align center" pressed={editor.isActive({ textAlign: 'center' }) || (editor.isActive('image') && align === 'center')} onClick={() => alignTo(editor, 'center')}>
        <Icon d="M2.5 4h11M4.5 8h7M3.5 12h9" />
      </Tool>
      <Tool label="Align right" pressed={editor.isActive({ textAlign: 'right' }) || (editor.isActive('image') && align === 'right')} onClick={() => alignTo(editor, 'right')}>
        <Icon d="M2.5 4h11M6.5 8h7M4.5 12h9" />
      </Tool>
      <Tool label="Header" onClick={() => ensureRegion(editor, 'header')}>
        <Icon d="M2.5 2.5h11v11h-11zM2.5 5.5h11" />
      </Tool>
      <Tool label="Footer" onClick={() => ensureRegion(editor, 'footer')}>
        <Icon d="M2.5 2.5h11v11h-11zM2.5 10.5h11" />
      </Tool>
      <Tool label="Clear formatting" onClick={() => editor.chain().focus().unsetColor().unsetFontFamily().unsetFontSize().run()}>
        <Icon d="M3 13l8-8M6 4l6 6M4 12.5h3" />
      </Tool>
    </div>
  )
}

function alignTo(editor: Editor, align: 'left' | 'center' | 'right') {
  if (editor.isActive('image')) editor.chain().focus().updateAttributes('image', { align }).run()
  else editor.chain().focus().setTextAlign(align).run()
}

function ensureRegion(editor: Editor, kind: 'header' | 'footer') {
  let found = false
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'docRegion' && node.attrs.kind === kind) found = true
  })
  if (found) return
  const region = { type: 'docRegion', attrs: { kind }, content: [{ type: 'paragraph' }] }
  const at = kind === 'header' ? 0 : editor.state.doc.content.size
  editor.chain().focus().insertContentAt(at, region).run()
}
