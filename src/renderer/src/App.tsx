import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SAFE_SAVE,
  defaultExportExt,
  exportChoices,
  modesFor,
  replaceExt,
  PANDOC_PREVIEW,
  type ViewMode,
} from '@shared/formats'
import { isNativePlayback, playbackMime } from '@shared/media'
import { htmlToText, sanitizeHtml } from '@shared/text'
import { downloadBytes, getBridge, type FolioClient } from './bridge'
import { Docks } from './components/Docks'
import { DocumentView } from './components/DocumentView'
import { PixelField } from './components/PixelField'
import { SidePanel } from './components/SidePanel'
import { Modal } from './components/Modal'
import { TitleBar } from './components/TitleBar'
import { Welcome } from './components/Welcome'
import { readDocx } from './lib/docxParts'
import { collapseDocks, docksForHome, loadDocks } from './lib/docks'
import { editPicture, type PictureOp } from './lib/picture'
import { blobUrl, ensureDocxHtml, ensurePdfText, loadDocument } from './lib/load'
import { OUTLINE_EVENT, headingsFromHtml, headingsFromMarkdown, type OutlineItem } from './lib/outline'
import { printHtml } from './lib/print'
import { buildExport, choiceEnabled, chosenExtension, exportedName, saveFilters } from './lib/produce'
import { rasterize } from './lib/raster'
import type { FolioDoc, PageLook, RecentItem, Tools } from './types'
import { EMPTY_TOOLS } from './types'

type Choice = 'save' | 'discard' | 'cancel'

interface Prompt {
  message: string
  detail: string
  resolve: (choice: Choice) => void
}

function messageOf(error: unknown): string {
  const raw = error instanceof Error && error.message
    ? error.message
    : typeof error === 'string'
      ? error
      : 'Folio could not finish that.'
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}

function exportTarget(current: FolioDoc | null): string {
  if (!current) return 'pdf'
  return defaultExportExt(current.kind, current.ext)
}

type Playback = Awaited<ReturnType<FolioClient['prepareMedia']>>

function withPlayback(current: FolioDoc, playback: Playback): FolioDoc {
  return {
    ...current,
    mediaUrl: playback.url,
    imageUrl: playback.poster ? blobUrl(playback.poster, 'image/png') : current.imageUrl,
    width: playback.width,
    height: playback.height,
    duration: playback.duration,
    notice: playback.note ?? current.notice,
    mode: 'pages',
  }
}

export function App() {
  const bridge = useRef<FolioClient>(getBridge())
  const docRef = useRef<FolioDoc | null>(null)
  const toolsRef = useRef<Tools>(EMPTY_TOOLS)
  const [doc, setDoc] = useState<FolioDoc | null>(null)
  const [tools, setTools] = useState<Tools>(EMPTY_TOOLS)
  const [recent, setRecent] = useState<RecentItem[]>([])
  const [status, setStatus] = useState('')
  const [maximized, setMaximized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [zoom, setZoom] = useState(1.15)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  ))
  const [docks, setDocks] = useState(() => docksForHome(loadDocks()))
  const [fonts, setFonts] = useState<string[]>([])
  const [pageLook, setPageLook] = useState<PageLook>(() => {
    const saved = localStorage.getItem('folio-page')
    return saved === 'paper' || saved === 'night' || saved === 'match' ? saved : 'match'
  })
  const backStack = useRef<FolioDoc[]>([])
  const [canBack, setCanBack] = useState(false)
  const fromDocument = useRef(false)
  const [docxHeads, setDocxHeads] = useState<OutlineItem[]>([])
  const [pages, setPages] = useState<number | null>(null)
  const forcedPlay = useRef(false)

  const releaseAddress = useCallback((url: string | null | undefined) => {
    if (!url) return
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    else if (url.startsWith('folio-media:')) bridge.current.releaseMedia(url)
  }, [])

  const heldUrls = useCallback((extra: Array<FolioDoc | null>) => {
    const urls = new Set<string>()
    for (const item of [...backStack.current, ...extra]) {
      if (item?.imageUrl) urls.add(item.imageUrl)
      if (item?.mediaUrl) urls.add(item.mediaUrl)
    }
    return urls
  }, [])

  const releaseDoc = useCallback((leaving: FolioDoc | null, keep: Array<FolioDoc | null>) => {
    if (!leaving) return
    const held = heldUrls(keep)
    if (leaving.imageUrl && !held.has(leaving.imageUrl)) releaseAddress(leaving.imageUrl)
    if (leaving.mediaUrl && !held.has(leaving.mediaUrl)) releaseAddress(leaving.mediaUrl)
  }, [heldUrls, releaseAddress])

  const pushBack = useCallback((leaving: FolioDoc) => {
    const overflow = [...backStack.current, leaving]
    const dropped = overflow.slice(0, Math.max(0, overflow.length - 12))
    backStack.current = overflow.slice(-12)
    setCanBack(true)
    for (const item of dropped) releaseDoc(item, [...backStack.current, docRef.current])
  }, [releaseDoc])

  const replaceDoc = useCallback((next: FolioDoc | null) => {
    const previous = docRef.current
    docRef.current = next
    setDoc(next)
    document.title = next ? `${next.dirty ? '• ' : ''}${next.name} - Folio` : 'Folio'
    releaseDoc(previous, [next])
  }, [releaseDoc])

  const exportDeps = useCallback(() => ({
    isDesktop: bridge.current.isDesktop,
    pandoc: toolsRef.current.pandoc,
    ffmpeg: toolsRef.current.ffmpeg,
    htmlToPdf: (html: string) => bridge.current.htmlToPdf(html),
    pandocToBytes: (input: string, from: string, to: string) => bridge.current.pandocToBytes(input, from, to),
    printHtml,
    convertMedia: (payload: { path: string | null; ext: string; to: string; data?: Uint8Array }) => bridge.current.convertMedia(payload),
    decodeImage: (payload: { path: string | null; ext: string; data?: Uint8Array }) => bridge.current.decodeImage(payload),
    rasterize,
  }), [])

  const patchDoc = useCallback((recipe: (current: FolioDoc) => FolioDoc) => {
    const current = docRef.current
    if (!current) return
    replaceDoc(recipe(current))
  }, [replaceDoc])

  useEffect(() => {
    bridge.current.setDirty(Boolean(doc?.dirty))
  }, [doc?.dirty])

  const refreshRecent = useCallback(async () => {
    try {
      setRecent(await bridge.current.recent())
    } catch {
      /* recent files are a convenience */
    }
  }, [])

  const prepare = useCallback(async (current: FolioDoc) => {
    let next = current
    if (next.kind === 'pdf' && !next.textReady) next = await ensurePdfText(next)
    if (next.kind === 'docx' && !next.htmlReady) next = await ensureDocxHtml(next)
    return next
  }, [])

  const exportTo = useCallback(async (ext: string): Promise<boolean> => {
    const current = docRef.current
    if (!current) return false
    setBusy(true)
    setError(null)
    try {
      const prepared = await prepare(current)
      replaceDoc(prepared)
      const result = await buildExport(prepared, ext, exportDeps())
      if (result.kind === 'printed') {
        setStatus('Choose Save as PDF in the print dialog.')
        return true
      }
      const filename = exportedName(prepared.name, ext)
      if (!bridge.current.isDesktop) {
        downloadBytes(filename, result.data, result.mime)
        setStatus(`Downloaded ${filename}`)
        return true
      }
      const picked = await bridge.current.pickSave(filename, saveFilters(ext))
      if (!picked) return false
      const chosen = chosenExtension(picked, ext)
      const finalResult = chosen.ext === ext
        ? result
        : await buildExport(prepared, chosen.ext, exportDeps())
      if (finalResult.kind !== 'bytes') return false
      await bridge.current.writeBytes(chosen.path, finalResult.data)
      await refreshRecent()
      setStatus(`Exported ${chosen.path}`)
      return true
    } catch (caught) {
      setError(messageOf(caught))
      return false
    } finally {
      setBusy(false)
    }
  }, [exportDeps, prepare, refreshRecent, replaceDoc])

  const save = useCallback(async (): Promise<boolean> => {
    const current = docRef.current
    if (!current) return false
    if (!current.dirty) {
      setStatus(current.path ? 'No changes to save' : 'Nothing to save')
      return true
    }
    const canOverwrite = (current.kind === 'source' && current.textReady) || SAFE_SAVE.has(current.ext)
    if (!canOverwrite) {
      setStatus('Export a new file. Folio leaves this original as it is.')
      return exportTo(defaultExportExt(current.kind, current.ext))
    }
    setBusy(true)
    setError(null)
    try {
      const prepared = await prepare(current)
      const result = await buildExport(prepared, current.ext, exportDeps())
      if (result.kind !== 'bytes') return false
      if (!bridge.current.isDesktop || !prepared.path) {
        if (!bridge.current.isDesktop) {
          downloadBytes(exportedName(prepared.name, current.ext), result.data, result.mime)
          replaceDoc({ ...prepared, dirty: false })
          setStatus('Downloaded a copy')
          return true
        }
        const picked = await bridge.current.pickSave(prepared.name, saveFilters(current.ext))
        if (!picked) return false
        const chosen = chosenExtension(picked, current.ext)
        const written = chosen.ext === current.ext
          ? result
          : await buildExport(prepared, chosen.ext, exportDeps())
        if (written.kind !== 'bytes') return false
        await bridge.current.writeBytes(chosen.path, written.data)
        await refreshRecent()
        replaceDoc({
          ...prepared,
          path: chosen.ext === prepared.ext ? chosen.path : prepared.path,
          dirty: chosen.ext !== prepared.ext,
        })
        setStatus('Saved')
        return true
      }
      await bridge.current.writeBytes(prepared.path, result.data)
      replaceDoc({ ...prepared, dirty: false })
      setStatus('Saved')
      return true
    } catch (caught) {
      setError(messageOf(caught))
      return false
    } finally {
      setBusy(false)
    }
  }, [exportDeps, exportTo, prepare, refreshRecent, replaceDoc])

  const ask = useCallback((message: string, detail: string) => new Promise<Choice>((resolve) => {
    setPrompt({ message, detail, resolve })
  }), [])

  const present = useCallback(async (loaded: FolioDoc): Promise<FolioDoc> => {
    if (loaded.kind === 'image' && !loaded.imageUrl) {
      if (!bridge.current.isDesktop) {
        return { ...loaded, notice: 'Open the Folio desktop app to view this picture.' }
      }
      const still = await bridge.current.decodeImage(loaded.path
        ? { path: loaded.path, ext: loaded.ext }
        : { path: null, ext: loaded.ext, data: loaded.original })
      return {
        ...loaded,
        imageUrl: blobUrl(still.png, 'image/png'),
        width: still.width,
        height: still.height,
        mode: 'pages',
      }
    }
    if (loaded.kind === 'video' || loaded.kind === 'audio') {
      if (!bridge.current.isDesktop) {
        if (!isNativePlayback(loaded.ext)) {
          return { ...loaded, notice: 'Open the Folio desktop app to play this file.' }
        }
        return { ...loaded, mediaUrl: blobUrl(loaded.original, playbackMime(loaded.ext)), mode: 'pages' }
      }
      try {
        const playback = await bridge.current.prepareMedia(loaded.path
          ? { path: loaded.path, ext: loaded.ext, kind: loaded.kind }
          : { path: null, ext: loaded.ext, kind: loaded.kind, data: loaded.original })
        return withPlayback(loaded, playback)
      } catch (caught) {
        return {
          ...loaded,
          mode: loaded.textReady ? 'edit' : loaded.mode,
          notice: messageOf(caught),
        }
      }
    }
    return loaded
  }, [])

  const openBytes = useCallback(async (name: string, path: string | null, data: Uint8Array) => {
    const current = docRef.current
    if (current?.dirty) {
      const choice = await ask('Save changes before opening another document?', `${current.name} has unsaved edits.`)
      if (choice === 'cancel') return
      if (choice === 'save') {
        const saved = await save()
        if (!saved) return
      }
    }
    setBusy(true)
    setError(null)
    setPages(null)
    forcedPlay.current = false
    try {
      const loaded = await present(await loadDocument(name, path, data, toolsRef.current, (bytes, from, to) => (
        bridge.current.officeConvert(bytes, from, to)
      )))
      if (docRef.current) pushBack(docRef.current)
      replaceDoc(loaded)
      setDocks(collapseDocks)
      setZoom(loaded.kind === 'pdf' ? 1.15 : 1)
      if (path) await refreshRecent()
      setStatus('')
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setBusy(false)
    }
  }, [ask, present, pushBack, refreshRecent, replaceDoc, save])

  const openDialog = useCallback(async () => {
    const opened = await bridge.current.openFile()
    if (opened) await openBytes(opened.name, opened.path, opened.data)
  }, [openBytes])

  const openPath = useCallback(async (path: string) => {
    try {
      const opened = await bridge.current.readPath(path)
      await openBytes(opened.name, opened.path, opened.data)
    } catch (caught) {
      setError(messageOf(caught))
    }
  }, [openBytes])

  const replayMedia = useCallback(async () => {
    const current = docRef.current
    if (!current || forcedPlay.current || !bridge.current.isDesktop) return
    if (current.kind !== 'video' && current.kind !== 'audio') return
    forcedPlay.current = true
    setBusy(true)
    setError(null)
    try {
      const playback = await bridge.current.prepareMedia(current.path
        ? { path: current.path, ext: current.ext, kind: current.kind, force: true }
        : { path: null, ext: current.ext, kind: current.kind, force: true, data: current.original })
      const latest = docRef.current
      if (latest?.id === current.id) replaceDoc(withPlayback(latest, playback))
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setBusy(false)
    }
  }, [replaceDoc])

  const requestClose = useCallback(async () => {
    const current = docRef.current
    if (!current?.dirty) {
      bridge.current.forceClose()
      return
    }
    const choice = await ask('Save changes before closing?', `${current.name} has unsaved edits.`)
    if (choice === 'cancel') {
      bridge.current.cancelClose()
      return
    }
    if (choice === 'discard') {
      bridge.current.forceClose()
      return
    }
    const saved = await save()
    if (saved) bridge.current.forceClose()
    else bridge.current.cancelClose()
  }, [ask, save])

  const goHome = useCallback(async () => {
    const current = docRef.current
    if (!current) return
    if (current.dirty) {
      const choice = await ask('Save changes before going home?', `${current.name} has unsaved edits.`)
      if (choice === 'cancel') return
      if (choice === 'save') {
        const saved = await save()
        if (!saved) return
      }
    }
    const leaving = docRef.current
    if (leaving) pushBack(leaving)
    setDocks(docksForHome)
    replaceDoc(null)
    setPages(null)
    setError(null)
    setStatus('')
  }, [ask, pushBack, replaceDoc, save])

  const goBack = useCallback(async () => {
    const previous = backStack.current.at(-1)
    if (!previous) return
    const current = docRef.current
    if (current?.dirty) {
      const choice = await ask('Save changes before going back?', `${current.name} has unsaved edits.`)
      if (choice === 'cancel') return
      if (choice === 'save') {
        const saved = await save()
        if (!saved) return
      }
    }
    backStack.current = backStack.current.slice(0, -1)
    setCanBack(backStack.current.length > 0)
    replaceDoc(previous)
    setPages(null)
    setError(null)
    setStatus('')
  }, [ask, replaceDoc, save])

  const editCurrentPicture = useCallback(async (op: PictureOp) => {
    const current = docRef.current
    if (!current?.imageUrl) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(current.imageUrl)
      const bytes = new Uint8Array(await response.arrayBuffer())
      const mime = response.headers.get('content-type')?.split(';')[0] || 'image/png'
      const result = await editPicture(bytes, mime, op)
      const ext = result.mime === 'image/jpeg' ? 'jpg' : result.mime === 'image/webp' ? 'webp' : 'png'
      const latest = docRef.current
      if (!latest || latest.id !== current.id) return
      replaceDoc({
        ...latest,
        name: replaceExt(latest.name, ext),
        ext,
        original: result.bytes,
        imageUrl: blobUrl(result.bytes, result.mime),
        width: result.width,
        height: result.height,
        dirty: true,
      })
      setStatus(result.note ?? '')
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setBusy(false)
    }
  }, [replaceDoc])

  const revealPath = useCallback((filePath: string) => {
    void bridge.current.reveal(filePath).catch((caught) => setError(messageOf(caught)))
  }, [])

  const paintPdf = useCallback((bytes: Uint8Array) => {
    const current = docRef.current
    if (!current) return
    replaceDoc({ ...current, original: bytes, dirty: true, painted: true })
    setStatus('Pictures written into the PDF.')
  }, [replaceDoc])

  const setMode = useCallback(async (mode: ViewMode) => {
    const current = docRef.current
    if (!current || current.mode === mode) return
    setBusy(true)
    try {
      let next = current
      if (mode === 'edit' && current.kind === 'docx') next = await ensureDocxHtml(current)
      if (mode === 'edit' && current.kind === 'pdf') next = await ensurePdfText(current)
      replaceDoc({ ...next, mode })
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setBusy(false)
    }
  }, [replaceDoc])

  useEffect(() => {
    const client = bridge.current
    const loadTools = () => {
      void client.tools().then((found) => {
        toolsRef.current = found
        setTools(found)
      }).catch(() => undefined)
    }
    loadTools()
    void refreshRecent()
    client.ready()
    return client.onCommand((command, payload) => {
      if (command === 'open') void openDialog()
      if (command === 'save') void save()
      if (command === 'export') void exportTo(exportTarget(docRef.current))
      if (command === 'open-path' && payload) void openPath(payload)
      if (command === 'request-close') void requestClose()
      if (command === 'tools-updated') loadTools()
      if (command === 'window-maximized') setMaximized(payload === '1')
      if (command === 'cycle-mode') {
        const current = docRef.current
        if (!current) return
        const modes = modesFor(current.kind, current.ext)
        const index = Math.max(0, modes.findIndex((mode) => mode.id === current.mode))
        void setMode(modes[(index + 1) % modes.length].id)
      }
      if (command === 'zoom-in') setZoom((value) => Math.min(2.4, Number((value + 0.15).toFixed(2))))
      if (command === 'zoom-out') setZoom((value) => Math.max(0.6, Number((value - 0.15).toFixed(2))))
      if (command === 'zoom-reset') setZoom(docRef.current?.kind === 'image' ? 1 : 1.15)
    })
  }, [exportTo, openDialog, openPath, refreshRecent, requestClose, save, setMode])

  useEffect(() => {
    const current = doc
    if (!current || !tools.pandoc) return undefined
    const from = PANDOC_PREVIEW[current.ext]
    if (!from || (current.mode !== 'read' && current.mode !== 'split')) return undefined
    let cancel = false
    const timer = window.setTimeout(() => {
      void bridge.current.pandocToText(current.text, from, 'html').then((html) => {
        if (!cancel) patchDoc((latest) => latest.id === current.id ? { ...latest, html: sanitizeHtml(html), htmlReady: true } : latest)
      }).catch(() => undefined)
    }, 280)
    return () => {
      cancel = true
      window.clearTimeout(timer)
    }
  }, [doc?.ext, doc?.id, doc?.mode, doc?.text, patchDoc, tools.pandoc])

  useEffect(() => {
    if (bridge.current.isDesktop) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'o') {
        event.preventDefault()
        void openDialog()
      } else if (key === 's' && event.shiftKey) {
        event.preventDefault()
        void exportTo(exportTarget(docRef.current))
      } else if (key === 's') {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exportTo, openDialog, save])

  useEffect(() => {
    let timer = 0
    const onScroll = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      target.classList.add('is-scrolling')
      window.clearTimeout(timer)
      timer = window.setTimeout(() => target.classList.remove('is-scrolling'), 700)
    }
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('scroll', onScroll, true)
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('folio-theme', theme)
    window.dispatchEvent(new Event('folio-theme'))
    bridge.current.setBackground(theme === 'dark' ? '#242422' : '#f4f3ef')
    bridge.current.setIcon(theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('folio-docks', JSON.stringify(docks))
  }, [docks])

  useEffect(() => {
    void bridge.current.fonts().then((names) => {
      if (names.length > 0) setFonts(names)
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    localStorage.setItem('folio-page', pageLook)
  }, [pageLook])

  useEffect(() => {
    if (!doc || doc.kind !== 'docx') {
      setDocxHeads([])
      return undefined
    }
    let cancel = false
    void readDocx(doc.original).then((extras) => {
      if (!cancel) setDocxHeads(extras.headings)
    }).catch(() => {
      if (!cancel) setDocxHeads([])
    })
    return () => {
      cancel = true
    }
  }, [doc?.id, doc?.kind, doc?.original])

  const outline = useMemo(() => {
    if (!doc) return []
    if (doc.lang === 'markdown' || ['md', 'markdown', 'mdown', 'mdx', 'mkd', 'rmd'].includes(doc.ext)) return headingsFromMarkdown(doc.text)
    if (doc.html && doc.kind !== 'source') return headingsFromHtml(doc.html)
    if (doc.lang === 'html' || doc.ext === 'html' || doc.ext === 'htm') return headingsFromHtml(doc.text)
    if (doc.kind === 'docx') return docxHeads
    return []
  }, [doc, docxHeads])
  const showOutline = Boolean(doc && (
    outline.length > 0
    || doc.kind === 'docx'
    || doc.kind === 'rich'
    || doc.kind === 'ebook'
    || doc.lang === 'markdown'
    || doc.lang === 'html'
  ))
  const jumpOutline = (item: OutlineItem) => {
    window.dispatchEvent(new CustomEvent(OUTLINE_EVENT, { detail: item }))
  }

  const modes = doc ? modesFor(doc.kind, doc.ext) : []
  const exports = doc ? exportChoices(doc.kind, doc.ext) : []
  const edit = (command: 'undo' | 'redo' | 'selectAll') => {
    document.execCommand(command)
  }

  return (
    <div
      className={dragging ? 'app dragging' : 'app'}
      onDragStart={(event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        if (target.closest('.docx-host')) {
          fromDocument.current = true
          event.preventDefault()
          return
        }
        if (target.closest('.ProseMirror, .folio-picture, .pdf-sticker')) fromDocument.current = true
      }}
      onDragEnd={() => { fromDocument.current = false }}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        setDragging(false)
        if (fromDocument.current) {
          fromDocument.current = false
          event.preventDefault()
          return
        }
        if (event.defaultPrevented) return
        event.preventDefault()
        const file = event.dataTransfer.files[0]
        if (!file) return
        if (bridge.current.isDesktop) {
          try {
            const filePath = bridge.current.getPathForFile(file)
            if (filePath) {
              void openPath(filePath)
              return
            }
          } catch {
            /* fall through to the dropped bytes */
          }
        }
        void file.arrayBuffer().then((buffer) => openBytes(file.name, null, new Uint8Array(buffer)))
      }}
    >
      <PixelField />
      <TitleBar
        name={doc?.name ?? ''}
        dirty={Boolean(doc?.dirty)}
        desktop={bridge.current.isDesktop}
        maximized={maximized}
        recent={recent}
        modes={modes}
        mode={doc?.mode ?? null}
        showZoom={doc?.kind === 'pdf' || doc?.kind === 'image'}
        zoom={zoom}
        exports={exports.map((choice) => {
          const enabled = choiceEnabled(choice, { pandoc: tools.pandoc, ffmpeg: tools.ffmpeg }) && !busy
          return {
            label: choice.label,
            disabled: !enabled,
            hint: enabled ? `Export as ${choice.label}` : 'That export is not available for this file.',
            onClick: () => { void exportTo(choice.ext) },
          }
        })}
        onOpen={() => { void openDialog() }}
        onSave={() => { void save() }}
        onOpenPath={(filePath) => { void openPath(filePath) }}
        onReveal={revealPath}
        onMode={(mode) => { void setMode(mode) }}
        onZoom={(direction) => {
          if (direction === 0) setZoom(docRef.current?.kind === 'image' ? 1 : 1.15)
          else setZoom((value) => Math.min(2.4, Math.max(0.6, Number((value + direction * 0.15).toFixed(2)))))
        }}
        onUndo={() => edit('undo')}
        onRedo={() => edit('redo')}
        onSelectAll={() => edit('selectAll')}
        showFormatJson={doc?.lang === 'json'}
        onFormatJson={() => {
          if (!doc) return
          try {
            const pretty = `${JSON.stringify(JSON.parse(doc.text), null, 2)}\n`
            patchDoc((current) => ({ ...current, text: pretty, dirty: pretty !== current.text || current.dirty }))
            setError(null)
          } catch (caught) {
            setError(messageOf(caught))
          }
        }}
        onMinimize={() => bridge.current.minimize()}
        onMaximize={() => bridge.current.toggleMaximize()}
        onClose={() => bridge.current.closeWindow()}
        theme={theme}
        onHome={() => { void goHome() }}
        onTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
        sides={{ history: docks.history.enabled, convert: docks.convert.enabled }}
        onHistory={(enabled) => setDocks((current) => ({
          ...current,
          history: { ...current.history, enabled, open: enabled && !doc },
        }))}
        onConvert={(enabled) => setDocks((current) => ({
          ...current,
          convert: { ...current.convert, enabled, open: enabled && !doc },
        }))}
        canBack={canBack}
        onBack={() => { void goBack() }}
      />

      <Docks
        docks={docks}
        onChange={setDocks}
        history={(grip, collapse) => (
          <SidePanel
            kind="history"
            modes={modes}
            mode={doc?.mode ?? null}
            showZoom={false}
            zoom={zoom}
            exports={[]}
            recent={recent}
            outline={outline}
            showOutline={false}
            onOutline={jumpOutline}
            onMode={(mode) => { void setMode(mode) }}
            onZoom={() => undefined}
            onOpenPath={(filePath) => { void openPath(filePath) }}
            pageLook={pageLook}
            onPage={setPageLook}
            showPicture={false}
            pictureBusy={busy}
            onPicture={(op) => { void editCurrentPicture(op) }}
            showPdf={false}
            onGrip={grip}
            onCollapse={collapse}
            onReveal={revealPath}
          />
        )}
        convert={(grip, collapse) => (
          <SidePanel
            kind="work"
            modes={modes}
            mode={doc?.mode ?? null}
            showZoom={doc?.kind === 'pdf' || doc?.kind === 'image'}
            zoom={zoom}
            exports={exports.map((choice) => {
              const enabled = choiceEnabled(choice, { pandoc: tools.pandoc, ffmpeg: tools.ffmpeg }) && !busy
              return {
                label: choice.label,
                disabled: !enabled,
                hint: enabled ? `Export as ${choice.label}` : 'That export is not available for this file.',
                onClick: () => { void exportTo(choice.ext) },
              }
            })}
            recent={recent}
            outline={outline}
            showOutline={showOutline}
            onOutline={jumpOutline}
            onMode={(mode) => { void setMode(mode) }}
            onZoom={(direction) => {
              if (direction === 0) setZoom(docRef.current?.kind === 'image' ? 1 : 1.15)
              else setZoom((value) => Math.min(2.4, Math.max(0.6, Number((value + direction * 0.15).toFixed(2)))))
            }}
            onOpenPath={(filePath) => { void openPath(filePath) }}
            pageLook={pageLook}
            onPage={setPageLook}
            showPicture={doc?.kind === 'image'}
            pictureBusy={busy}
            onPicture={(op) => { void editCurrentPicture(op) }}
            showPdf={doc?.kind === 'pdf'}
            onGrip={grip}
            onCollapse={collapse}
            onReveal={revealPath}
          />
        )}
      >
        <main className={pageLook === 'match' ? 'stage' : `stage page-${pageLook}`} aria-busy={busy}>
          {error ? (
            <div className="error-bar" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)}>Dismiss</button>
            </div>
          ) : null}
          {doc?.notice ? <p className="notice">{doc.notice}</p> : null}
          {doc ? (
            <DocumentView
              doc={doc}
              zoom={zoom}
              pages={pages}
              onPages={setPages}
              onText={(text) => patchDoc((current) => current.text === text ? current : { ...current, text, dirty: true, textReady: true })}
              onHtml={(html) => patchDoc((current) => current.html === html ? current : { ...current, html, text: htmlToText(html), dirty: true, htmlReady: true, textReady: true })}
              onRows={(rows) => patchDoc((current) => ({
                ...current,
                dirty: true,
                sheets: current.sheets.map((sheet) => sheet.name === current.sheet ? { ...sheet, rows } : sheet),
              }))}
              onSheet={(name) => patchDoc((current) => ({ ...current, sheet: name }))}
              onUnplayable={() => { void replayMedia() }}
              pageLook={pageLook}
              onPicture={(op) => { void editCurrentPicture(op) }}
              onPdf={paintPdf}
              pictureBusy={busy}
              fonts={fonts}
            />
          ) : <Welcome onOpen={() => { void openDialog() }} />}
        </main>
      </Docks>

      <footer className="statusbar">
        <span>{doc ? doc.label : 'Ready'}</span>
        <span>{busy ? 'Working' : status}</span>
      </footer>

      {prompt ? (
        <Modal
          message={prompt.message}
          detail={prompt.detail}
          onChoice={(choice) => {
            const resolve = prompt.resolve
            setPrompt(null)
            resolve(choice)
          }}
        />
      ) : null}
    </div>
  )
}
