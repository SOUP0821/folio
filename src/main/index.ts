import { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage, protocol, shell, type MenuItemConstructorOptions } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { ASSOCIATION_VERSION, FORMATS } from '@shared/formats'

declare const __dirname: string
import { registerIpc, registerAssociations } from './ipc'
import { readRecent, registrationStamp, rememberRegistration, type RecentItem } from './files'
import { cleanupMedia, serveMedia } from './playback'
import { detectTools, type ToolPaths } from './external'
import { installMissing } from './provision'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'folio-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
])

let mainWindow: BrowserWindow | null = null
let forceClose = false
let pendingClose = false
let dirty = false
let tools: ToolPaths = {
  pandoc: false,
  libreoffice: false,
  ffmpeg: false,
  pandocPath: null,
  libreofficePath: null,
  ffmpegPath: null,
  ffprobePath: null,
}
let registration: 'added' | 'skipped' | 'failed' | 'pending' = 'pending'
let rendererReady = false
let pendingFile: string | null = null

const gotLock = app.isPackaged ? app.requestSingleInstanceLock() : true
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const file = extractFileArg(argv)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    deliverFile(file)
  })

  app.whenReady().then(() => {
    void boot()
  })
}

function extractFileArg(argv: string[]): string | null {
  let appPath = ''
  try {
    appPath = app.getAppPath()
  } catch {
    appPath = ''
  }
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) continue
    const full = path.resolve(arg)
    if (appPath && (full === appPath || full.startsWith(appPath + path.sep))) continue
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return full
    } catch {
      /* skip arguments that are not files */
    }
  }
  return null
}

function send(command: string, payload?: string): void {
  mainWindow?.webContents.send('command', command, payload)
}

function deliverFile(file: string | null): void {
  if (!file) return
  if (rendererReady && mainWindow) {
    send('open-path', file)
    pendingFile = null
    return
  }
  pendingFile = file
}

async function boot(): Promise<void> {
  protocol.handle('folio-media', (request) => serveMedia(request))
  app.setAppUserModelId('app.folio.desktop')
  tools = await detectTools()
  registration = await ensureOpenWith()
  const recent = await readRecent()
  buildMenu(recent)
  createWindow()
  deliverFile(extractFileArg(process.argv))
  if (!tools.ffmpeg || !tools.pandoc) {
    void installMissing(tools).then(async () => {
      tools = await detectTools()
      send('tools-updated')
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

async function ensureOpenWith(): Promise<'added' | 'skipped' | 'failed' | 'pending'> {
  if (!app.isPackaged || process.platform !== 'win32') return 'skipped'
  const exe = process.execPath
  const previous = await registrationStamp()
  if (previous?.exe === exe && previous.version >= ASSOCIATION_VERSION) return 'added'
  return registerAssociations(exe, rememberRegistration)
}

function preloadPath(): string {
  const scriptPreload = path.join(__dirname, '../preload/index.js')
  const modulePreload = path.join(__dirname, '../preload/index.mjs')
  return fs.existsSync(scriptPreload) ? scriptPreload : modulePreload
}

function iconFile(theme: 'light' | 'dark'): string {
  const name = theme === 'dark' ? 'icon-dark.png' : 'icon.png'
  const packaged = path.join(process.resourcesPath, name)
  const dev = path.join(app.getAppPath(), 'resources', name)
  return fs.existsSync(packaged) ? packaged : dev
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#242422',
    icon: iconFile('dark'),
    title: 'Folio',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.setMenuBarVisibility(false)

  const publishWindow = () => send('window-maximized', mainWindow?.isMaximized() ? '1' : '0')
  mainWindow.on('maximize', publishWindow)
  mainWindow.on('unmaximize', publishWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl && url.startsWith(devUrl)) return
    if (url.startsWith('file:')) return
    event.preventDefault()
  })

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`Folio could not load ${url} (${code} ${description})`)
  })

  mainWindow.on('close', (event) => {
    if (forceClose || !dirty) return
    event.preventDefault()
    if (pendingClose) {
      forceClose = true
      mainWindow?.close()
      return
    }
    pendingClose = true
    send('request-close')
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    forceClose = false
    pendingClose = false
    rendererReady = false
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function buildMenu(recent: RecentItem[]): void {
  const fileMenu: MenuItemConstructorOptions[] = [
    { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
    { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
    { label: 'Export…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('export') },
    { type: 'separator' },
    {
      label: 'Open recent',
      submenu: recent.length > 0
        ? recent.map((item) => ({
          label: item.name,
          click: () => send('open-path', item.path),
        }))
        : [{ label: 'Nothing opened yet', enabled: false }],
    },
    { type: 'separator' },
    { label: 'Add to Open with', click: () => { void addToOpenWith() } },
    { type: 'separator' },
    { role: 'quit' },
  ]

  const template: MenuItemConstructorOptions[] = [
    { label: 'File', submenu: fileMenu },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Switch view', accelerator: 'CmdOrCtrl+\\', click: () => send('cycle-mode') },
        { type: 'separator' },
        { label: 'Zoom in', accelerator: 'CmdOrCtrl+=', click: () => send('zoom-in') },
        { label: 'Zoom out', accelerator: 'CmdOrCtrl+-', click: () => send('zoom-out') },
        { label: 'Actual size', accelerator: 'CmdOrCtrl+0', click: () => send('zoom-reset') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'reload', visible: !app.isPackaged },
        { role: 'toggleDevTools', visible: !app.isPackaged },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Formats Folio opens',
          click: () => {
            const lines = FORMATS.map((format) => `${format.ext.padEnd(10, ' ')} ${format.description}`)
            void dialog.showMessageBox({
              type: 'info',
              title: 'Formats',
              message: 'Folio opens these formats',
              detail: lines.join('\n'),
            })
          },
        },
        {
          label: 'About Folio',
          click: () => {
            void dialog.showMessageBox({
              type: 'info',
              title: 'About Folio',
              message: 'Folio',
              detail: 'View, edit, and convert documents, pictures, video, and audio.\n\nThe installed app adds itself to Open with without replacing the app that already opens those files.',
            })
          },
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function addToOpenWith(): Promise<void> {
  if (!app.isPackaged || process.platform !== 'win32') {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Open with',
      message: 'Install Folio to put it on the Open with menu',
      detail: 'Run the Folio setup program, then open Folio once. It registers itself for documents without replacing your current default app. The portable exe can do this too, as long as you keep it in the same folder.',
    })
    return
  }
  registration = await registerAssociations(process.execPath, rememberRegistration)
  await dialog.showMessageBox({
    type: registration === 'added' ? 'info' : 'warning',
    title: 'Open with',
    message: registration === 'added' ? 'Folio is on the Open with menu' : 'Folio could not register Open with',
    detail: registration === 'added'
      ? 'Right-click a picture, video, audio, PDF, Word, or text file and choose Open with, then Folio.'
      : 'Try running Folio again. If it still fails, the Windows registry blocked the change.',
  })
}

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())
ipcMain.on('window:background', (_event, color: unknown) => {
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) mainWindow?.setBackgroundColor(color)
})
ipcMain.on('window:icon', (_event, theme: unknown) => {
  if (theme !== 'light' && theme !== 'dark') return
  const image = nativeImage.createFromPath(iconFile(theme))
  if (!image.isEmpty()) mainWindow?.setIcon(image)
})

registerIpc({
  getWindow: () => mainWindow,
  setDirty: (value) => {
    dirty = value
  },
  onRecent: (items) => buildMenu(items),
  getTools: () => tools,
  setTools: (value) => {
    tools = value
  },
  getRegistration: () => registration,
  forceClose: () => {
    forceClose = true
    pendingClose = false
    mainWindow?.close()
  },
  cancelClose: () => {
    pendingClose = false
  },
  rendererReady: () => {
    rendererReady = true
    if (pendingFile) deliverFile(pendingFile)
  },
})

app.on('before-quit', () => {
  void cleanupMedia()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
