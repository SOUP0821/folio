import { BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export async function htmlToPdf(html: string): Promise<Uint8Array> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-pdf-'))
  const file = path.join(dir, 'export.html')
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  try {
    await fs.writeFile(file, html, 'utf8')
    await win.loadFile(file)
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        top: 0.7,
        bottom: 0.7,
        left: 0.75,
        right: 0.75,
      },
    })
    return new Uint8Array(pdf)
  } finally {
    if (!win.isDestroyed()) win.destroy()
    await fs.rm(dir, { recursive: true, force: true })
  }
}
