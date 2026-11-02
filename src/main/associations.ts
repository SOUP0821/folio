import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { OPEN_WITH_EXTENSIONS } from '@shared/formats'

const exec = promisify(execFile)

const LABELS: Record<string, string> = {
  pdf: 'PDF document',
  docx: 'Word document',
  doc: 'Word 97 document',
  odt: 'OpenDocument text',
  rtf: 'Rich text document',
  epub: 'EPUB book',
  txt: 'Plain text',
  md: 'Markdown document',
  markdown: 'Markdown document',
  html: 'HTML document',
  htm: 'HTML document',
  csv: 'CSV spreadsheet',
  tsv: 'TSV spreadsheet',
  xlsx: 'Excel spreadsheet',
  xls: 'Excel 97 spreadsheet',
  json: 'JSON document',
  xml: 'XML document',
  log: 'Log',
  rst: 'reStructuredText',
  tex: 'LaTeX document',
  adoc: 'AsciiDoc document',
}

function progId(ext: string): string {
  return `Folio.${ext.toUpperCase()}`
}

async function add(key: string, args: string[]): Promise<void> {
  await exec('reg', ['add', key, ...args, '/f'], { windowsHide: true })
}

export async function registerOpenWith(exePath: string): Promise<void> {
  if (process.platform !== 'win32') return
  const command = `"${exePath}" "%1"`
  for (const ext of OPEN_WITH_EXTENSIONS) {
    const id = progId(ext)
    const classKey = `HKCU\\Software\\Classes\\${id}`
    await add(classKey, ['/ve', '/d', LABELS[ext] ?? `${ext.toUpperCase()} document`])
    await add(classKey, ['/v', 'FriendlyAppName', '/d', 'Folio'])
    await add(`${classKey}\\DefaultIcon`, ['/ve', '/d', `"${exePath}",0`])
    await add(`${classKey}\\shell\\open\\command`, ['/ve', '/d', command])
    await add(`HKCU\\Software\\Classes\\.${ext}\\OpenWithProgids`, ['/v', id, '/t', 'REG_SZ', '/d', ''])
    await add('HKCU\\Software\\Classes\\Applications\\Folio.exe\\shell\\open\\command', ['/ve', '/d', command])
    await add('HKCU\\Software\\Classes\\Applications\\Folio.exe\\SupportedTypes', ['/v', `.${ext}`, '/t', 'REG_SZ', '/d', ''])
  }
  const refresh = `
Add-Type -Namespace FolioNotify -Name Shell -MemberDefinition '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int wEventId, uint uFlags, System.IntPtr dwItem1, System.IntPtr dwItem2);'
[FolioNotify.Shell]::SHChangeNotify(0x08000000, 0, [System.IntPtr]::Zero, [System.IntPtr]::Zero)
`
  await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', refresh], { windowsHide: true })
}
