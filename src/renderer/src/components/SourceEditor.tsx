import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { tags } from '@lezer/highlight'
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, drawSelection, keymap, lineNumbers } from '@codemirror/view'
import type { SourceLang } from '@shared/formats'
import { codeLanguage } from '../lib/codeLanguage'
import { OUTLINE_EVENT, type OutlineItem } from '../lib/outline'

function darkTheme(): boolean {
  return document.documentElement.dataset.theme !== 'light'
}

function editorLook(dark: boolean) {
  const ink = dark ? '#f4f3ef' : '#1c1c1a'
  const muted = dark ? '#9a9890' : '#6f6e68'
  const accent = '#d2653a'
  const string = dark ? '#e7c2b0' : '#8a3a32'
  const number = dark ? '#e2b15a' : '#8a5a12'
  const type = dark ? '#d7c4a3' : '#6a5344'
  const line = dark ? 'rgba(210, 101, 58, 0.16)' : 'rgba(210, 101, 58, 0.1)'
  return [
    syntaxHighlighting(HighlightStyle.define([
      { tag: [tags.heading, tags.strong], color: ink, fontWeight: '650' },
      { tag: tags.emphasis, color: ink, fontStyle: 'italic' },
      { tag: tags.strikethrough, color: muted, textDecoration: 'line-through' },
      { tag: [tags.keyword, tags.modifier, tags.operatorKeyword, tags.controlKeyword, tags.definitionKeyword], color: accent },
      { tag: [tags.tagName, tags.angleBracket, tags.attributeName], color: accent },
      { tag: [tags.link, tags.url], color: string, textDecoration: 'underline' },
      { tag: [tags.string, tags.special(tags.string), tags.regexp], color: string },
      { tag: [tags.number, tags.bool, tags.atom, tags.literal], color: number },
      { tag: [tags.typeName, tags.className, tags.namespace], color: type },
      { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.function(tags.variableName))], color: ink, fontWeight: '600' },
      { tag: [tags.propertyName, tags.attributeValue], color: string },
      { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.meta, tags.docComment, tags.processingInstruction], color: muted, fontStyle: 'italic' },
      { tag: [tags.operator, tags.punctuation, tags.bracket, tags.separator], color: muted },
      { tag: tags.invalid, color: accent, textDecoration: 'underline' },
    ])),
    EditorView.theme({
      '&': { backgroundColor: 'transparent', color: ink, height: '100%' },
      '.cm-content': {
        fontFamily: '"IBM Plex Mono", Consolas, monospace',
        fontSize: '13.5px',
        lineHeight: '1.55',
        padding: '4px 0 40px',
        caretColor: accent,
      },
      '.cm-gutters': { backgroundColor: 'transparent', color: muted, border: 'none' },
      '.cm-activeLine': { backgroundColor: line },
      '.cm-activeLineGutter': { backgroundColor: 'transparent' },
      '&.cm-focused': { outline: 'none' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: accent },
    }, { dark }),
  ]
}

export function SourceEditor({
  value,
  lang,
  ext,
  onChange,
}: {
  value: string
  lang: SourceLang
  ext: string
  onChange: (value: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  const themeCompartment = useRef(new Compartment())
  const viewRef = useRef<EditorView | null>(null)
  onChangeRef.current = onChange

  useEffect(() => {
    const parent = host.current
    if (!parent) return undefined
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          bracketMatching(),
          themeCompartment.current.of(editorLook(darkTheme())),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          codeLanguage(ext, lang),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            spellcheck: lang === 'plain' || lang === 'markdown' ? 'true' : 'false',
            'aria-label': 'Document text',
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // The editor owns the buffer after mount. A new document remounts this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, ext])

  useEffect(() => {
    const onJump = (event: Event) => {
      const detail = (event as CustomEvent<OutlineItem>).detail
      const view = viewRef.current
      if (!view || detail.line == null) return
      const line = view.state.doc.line(Math.min(Math.max(detail.line, 1), view.state.doc.lines))
      view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true })
      view.focus()
    }
    window.addEventListener(OUTLINE_EVENT, onJump)
    return () => window.removeEventListener(OUTLINE_EVENT, onJump)
  }, [])

  useEffect(() => {
    const apply = () => {
      viewRef.current?.dispatch({
        effects: themeCompartment.current.reconfigure(editorLook(darkTheme())),
      })
    }
    window.addEventListener('folio-theme', apply)
    return () => window.removeEventListener('folio-theme', apply)
  }, [])

  return <div className="source-editor" ref={host} />
}
