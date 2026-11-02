import { ASSOCIATION_VERSION } from '@shared/formats'
import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

export interface RecentItem {
  path: string
  name: string
  ext: string
  openedAt: number
}

const MAX_RECENT = 10
const MAX_BYTES = 200 * 1024 * 1024

function recentFile(): string {
  return path.join(app.getPath('userData'), 'recent.json')
}

function registrationFile(): string {
  return path.join(app.getPath('userData'), 'open-with.json')
}

export async function readRecent(): Promise<RecentItem[]> {
  try {
    const raw = await fs.readFile(recentFile(), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecent).slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

function isRecent(value: unknown): value is RecentItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<RecentItem>
  return typeof item.path === 'string' && typeof item.name === 'string' && typeof item.openedAt === 'number'
}

export async function rememberRecent(filePath: string): Promise<RecentItem[]> {
  const current = (await readRecent()).filter((item) => item.path !== filePath)
  const next: RecentItem[] = [{
    path: filePath,
    name: path.basename(filePath),
    ext: path.extname(filePath).replace(/^\./, '').toLowerCase(),
    openedAt: Date.now(),
  }, ...current].slice(0, MAX_RECENT)
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(recentFile(), JSON.stringify(next, null, 2))
  return next
}

export function assertReadable(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0 || input.length > 4096 || input.includes('\0')) {
    throw new Error('Choose a file to open.')
  }
  return path.resolve(input)
}

export async function readDocument(filePath: string): Promise<{ path: string; name: string; data: Uint8Array }> {
  const full = assertReadable(filePath)
  const stat = await fs.stat(full)
  if (!stat.isFile()) throw new Error('That path is not a file.')
  if (stat.size > MAX_BYTES) throw new Error('Folio opens files up to 200 MB.')
  const data = await fs.readFile(full)
  return { path: full, name: path.basename(full), data: new Uint8Array(data) }
}

export function assertWritable(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0 || input.length > 4096 || input.includes('\0')) {
    throw new Error('Choose where to save.')
  }
  return path.resolve(input)
}

export async function writeDocument(filePath: string, data: Uint8Array): Promise<void> {
  if (data.byteLength > MAX_BYTES) throw new Error('That document is over 200 MB.')
  const full = assertWritable(filePath)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, data)
}

export async function registrationStamp(): Promise<{ exe: string; version: number } | null> {
  try {
    const raw = await fs.readFile(registrationFile(), 'utf8')
    const parsed = JSON.parse(raw) as { exe?: string; version?: number }
    if (typeof parsed.exe !== 'string') return null
    return { exe: parsed.exe, version: typeof parsed.version === 'number' ? parsed.version : 1 }
  } catch {
    return null
  }
}

export async function rememberRegistration(exe: string): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(registrationFile(), JSON.stringify({ exe, version: ASSOCIATION_VERSION, at: Date.now() }))
}
