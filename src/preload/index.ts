import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('folio', {
  isDesktop: true,
  openFile: () => ipcRenderer.invoke('dialog:open'),
  readPath: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  pickSave: (defaultName: string, filters: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('dialog:save', defaultName, filters),
  writeBytes: (filePath: string, data: Uint8Array) => ipcRenderer.invoke('file:write', filePath, data),
  htmlToPdf: (html: string) => ipcRenderer.invoke('pdf:html', html),
  tools: () => ipcRenderer.invoke('tools:get'),
  recent: () => ipcRenderer.invoke('recent:list'),
  reveal: (filePath: string) => ipcRenderer.invoke('file:reveal', filePath),
  fonts: () => ipcRenderer.invoke('fonts:list'),
  pandocToText: (input: string, from: string, to: string) => ipcRenderer.invoke('pandoc:text', input, from, to),
  pandocToBytes: (input: string, from: string, to: string) => ipcRenderer.invoke('pandoc:bytes', input, from, to),
  officeConvert: (data: Uint8Array, fromExt: string, toExt: string) =>
    ipcRenderer.invoke('office:convert', data, fromExt, toExt),
  decodeImage: (payload: { path: string | null; ext: string; data?: Uint8Array }) =>
    ipcRenderer.invoke('media:decode', payload),
  prepareMedia: (payload: { path: string | null; ext: string; kind: string; force?: boolean; data?: Uint8Array }) =>
    ipcRenderer.invoke('media:prepare', payload),
  convertMedia: (payload: { path: string | null; ext: string; to: string; data?: Uint8Array }) =>
    ipcRenderer.invoke('media:convert', payload),
  inlineImages: (html: string, documentPath: string) => ipcRenderer.invoke('media:inline', html, documentPath),
  releaseMedia: (url: string) => {
    ipcRenderer.send('media:release', url)
  },
  setDirty: (dirty: boolean) => {
    ipcRenderer.send('doc:dirty', dirty)
  },
  forceClose: () => {
    ipcRenderer.send('window:destroy')
  },
  cancelClose: () => {
    ipcRenderer.send('window:cancel-close')
  },
  registration: () => ipcRenderer.invoke('associations:status'),
  ready: () => {
    ipcRenderer.send('renderer:ready')
  },
  minimize: () => {
    ipcRenderer.send('window:minimize')
  },
  toggleMaximize: () => {
    ipcRenderer.send('window:toggle-maximize')
  },
  closeWindow: () => {
    ipcRenderer.send('window:close')
  },
  setBackground: (color: string) => {
    ipcRenderer.send('window:background', color)
  },
  setIcon: (theme: 'light' | 'dark') => {
    ipcRenderer.send('window:icon', theme)
  },
  onCommand: (handler: (command: string, payload?: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: string, payload?: string) => {
      handler(command, payload)
    }
    ipcRenderer.on('command', listener)
    return () => {
      ipcRenderer.removeListener('command', listener)
    }
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
})
