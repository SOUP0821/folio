import { mergeAttributes, Node } from '@tiptap/core'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type Editor, type NodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef, useState } from 'react'
import { OUTLINE_EVENT, type OutlineItem } from '../lib/outline'
import { FontSize } from '../lib/richMarks'
import { FormatBar } from './FormatBar'

const DocRegion = Node.create({
  name: 'docRegion',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      kind: {
        default: 'header',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-region') || 'header',
        renderHTML: (attributes: { kind?: string }) => ({ 'data-region': attributes.kind }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'section[data-region]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes, { class: 'doc-region' }), 0]
  },
})

function PictureView({ node, updateAttributes, selected }: NodeViewProps) {
  const img = useRef<HTMLImageElement>(null)
  const width = node.attrs.width as string | number | null
  return (
    <NodeViewWrapper
      as="span"
      className={`folio-picture align-${(node.attrs.align as string) || 'center'}${selected ? ' is-selected' : ''}`}
      data-align={(node.attrs.align as string) || 'center'}
    >
      <img
        ref={img}
        src={node.attrs.src as string}
        alt=""
        draggable={false}
        data-drag-handle=""
        style={width ? { width: typeof width === 'number' ? `${width}px` : width } : undefined}
      />
      <span
        className="picture-resize"
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const image = img.current
          if (!image) return
          const originX = event.clientX
          const originW = image.getBoundingClientRect().width
          const ratio = image.naturalWidth ? image.naturalHeight / image.naturalWidth : 1
          const move = (ev: MouseEvent) => {
            image.style.width = `${Math.max(48, Math.round(originW + ev.clientX - originX))}px`
          }
          const up = (ev: MouseEvent) => {
            window.removeEventListener('mousemove', move)
            window.removeEventListener('mouseup', up)
            const next = Math.max(48, Math.round(originW + ev.clientX - originX))
            updateAttributes({ width: next, height: Math.round(next * ratio) })
          }
          window.addEventListener('mousemove', move)
          window.addEventListener('mouseup', up)
        }}
      />
    </NodeViewWrapper>
  )
}

const Picture = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'center',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-align') || 'center',
        renderHTML: (attributes: { align?: string | null }) => (
          attributes.align ? { 'data-align': attributes.align } : {}
        ),
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(PictureView)
  },
}).configure({ inline: true, allowBase64: true })

export function RichEditor({
  html,
  fonts,
  onChange,
}: {
  html: string
  fonts: string[]
  onChange: (html: string) => void
}) {
  const [, setTick] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const editor = useEditor({
    immediatelyRender: true,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      Underline,
      Subscript,
      Superscript,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      DocRegion,
      Picture,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: html || '<p></p>',
    editorProps: {
      attributes: {
        spellcheck: 'true',
        'aria-label': 'Document',
      },
      handleDrop(view, event, _slice, moved) {
        if (moved || !event.dataTransfer) return false
        const file = [...event.dataTransfer.files].find((item) => item.type.startsWith('image/'))
        if (!file) return false
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
        const reader = new FileReader()
        reader.onload = () => {
          const current = editorRef.current
          if (!current || typeof reader.result !== 'string' || !coords) return
          current.chain().focus().insertContentAt(coords.pos, {
            type: 'image',
            attrs: { src: reader.result, align: 'center' },
          }).run()
        }
        reader.readAsDataURL(file)
        event.preventDefault()
        event.stopPropagation()
        return true
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange(current.getHTML())
      setTick((value) => value + 1)
    },
    onSelectionUpdate: () => setTick((value) => value + 1),
  })

  useEffect(() => {
    if (!editor) return undefined
    const onJump = (event: Event) => {
      const detail = (event as CustomEvent<OutlineItem>).detail
      const heading = editor.view.dom.querySelectorAll('h1, h2, h3, h4, h5, h6')[detail.index]
      heading?.scrollIntoView({ block: 'start' })
    }
    window.addEventListener(OUTLINE_EVENT, onJump)
    return () => window.removeEventListener(OUTLINE_EVENT, onJump)
  }, [editor])

  editorRef.current = editor
  if (!editor) return null
  const placeImage = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        editor.chain().focus().insertContent({ type: 'image', attrs: { src: reader.result, align: 'center' } }).run()
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="rich-editor">
      <FormatBar editor={editor} fonts={fonts} onPicture={() => fileRef.current?.click()} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) placeImage(file)
        }}
      />
      <EditorContent editor={editor} />
    </div>
  )
}
