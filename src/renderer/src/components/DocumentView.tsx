import { countWords, markdownToHtml, textToHtml } from '@shared/text'
import { useEffect, useState } from 'react'
import type { PictureOp } from '../lib/picture'
import type { FolioDoc, PageLook } from '../types'
import { getBridge } from '../bridge'
import { DocxView } from './DocxView'
import { GridEditor } from './GridEditor'
import { HtmlFrame } from './HtmlFrame'
import { MediaView } from './MediaView'
import { PdfView } from './PdfView'
import { RichEditor } from './RichEditor'
import { Sheet } from './Sheet'
import { SourceEditor } from './SourceEditor'

function previewBody(doc: FolioDoc): string {
  if (doc.lang === 'markdown') return markdownToHtml(doc.text)
  if (doc.lang === 'html') return doc.text
  if (doc.html) return doc.html
  return textToHtml(doc.text)
}

function InlinePreview({ doc, pageLook }: { doc: FolioDoc; pageLook: PageLook }) {
  const raw = previewBody(doc)
  const [html, setHtml] = useState(raw)
  useEffect(() => {
    const bridge = getBridge()
    if (!doc.path || !bridge.isDesktop) {
      setHtml(raw)
      return undefined
    }
    let cancel = false
    void bridge.inlineImages(raw, doc.path).then((next) => {
      if (!cancel) setHtml(next)
    }).catch(() => {
      if (!cancel) setHtml(raw)
    })
    return () => {
      cancel = true
    }
  }, [raw, doc.path])
  return <HtmlFrame html={html} title={doc.name} pageLook={pageLook} />
}

function wordCount(doc: FolioDoc): number {
  if (doc.kind === 'grid') {
    return doc.sheets.reduce((total, sheet) => (
      total + sheet.rows.reduce((rowTotal, row) => rowTotal + countWords(row.join(' ')), 0)
    ), 0)
  }
  if (doc.kind === 'pdf' && !doc.textReady) return 0
  return countWords(doc.text || previewBody(doc))
}

export function DocumentView({
  doc,
  zoom,
  pages,
  onText,
  onHtml,
  onRows,
  onSheet,
  onPages,
  onUnplayable,
  pageLook,
  onPicture,
  onPdf,
  pictureBusy,
  fonts,
}: {
  doc: FolioDoc
  zoom: number
  pages: number | null
  onText: (text: string) => void
  onHtml: (html: string) => void
  onRows: (rows: string[][]) => void
  onSheet: (name: string) => void
  onPages: (count: number) => void
  onUnplayable: () => void
  pageLook: PageLook
  onPicture: (op: PictureOp) => void
  onPdf: (bytes: Uint8Array) => void
  pictureBusy: boolean
  fonts: string[]
}) {
  const words = wordCount(doc)
  const meta = doc.kind === 'pdf' && pages ? `${pages} ${pages === 1 ? 'page' : 'pages'}` : words ? `${words} ${words === 1 ? 'word' : 'words'}` : undefined

  if (doc.kind === 'pdf' && doc.mode === 'pages') {
    return <PdfView data={doc.original} zoom={zoom} onPages={onPages} onApply={onPdf} />
  }

  if ((doc.kind === 'image' || doc.kind === 'video' || doc.kind === 'audio') && doc.mode !== 'edit') {
    return <MediaView doc={doc} zoom={zoom} onUnplayable={onUnplayable} busy={pictureBusy} onPicture={doc.kind === 'image' ? onPicture : undefined} />
  }

  if (doc.kind === 'docx' && doc.mode === 'read') {
    return (
      <div className="docx-stage">
        <DocxView data={doc.original} />
      </div>
    )
  }

  if (doc.kind === 'grid') {
    return (
      <div className="sheet-wrap">
        <Sheet label={doc.label} meta={meta}>
          <GridEditor
            sheets={doc.sheets}
            sheet={doc.sheet}
            readOnly={doc.readOnly}
            onSheet={onSheet}
            onRows={onRows}
          />
        </Sheet>
      </div>
    )
  }

  const preview = <InlinePreview doc={doc} pageLook={pageLook} />
  const source = (
    <SourceEditor
      key={`${doc.id}-${doc.ext}-${doc.lang}`}
      value={doc.text}
      lang={doc.kind === 'pdf' ? 'plain' : doc.lang}
      ext={doc.ext}
      onChange={onText}
    />
  )

  let body = source
  if (doc.kind === 'source' && doc.mode === 'split') {
    body = <div className="split">{source}{preview}</div>
  } else if (doc.kind === 'source' && doc.mode === 'read') {
    body = preview
  } else if (doc.mode === 'edit' && (doc.kind === 'docx' || doc.kind === 'rich' || doc.kind === 'ebook')) {
    body = <RichEditor key={doc.id} html={doc.html || '<p></p>'} fonts={fonts} onChange={onHtml} />
  } else if (doc.mode === 'read') {
    body = preview
  }

  return (
    <div className={doc.mode === 'split' ? 'sheet-wrap sheet-wrap-wide' : 'sheet-wrap'}>
      <Sheet label={doc.label} meta={meta} split={doc.mode === 'split'}>
        {body}
      </Sheet>
    </div>
  )
}
