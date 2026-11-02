import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { exportChoices } from '../src/shared/formats.ts'
import { ffmpegPlan } from '../src/shared/media.ts'
import { decodeHeic, encodeHeic } from '../src/main/heif.ts'
import { encodePng } from '../src/main/png.ts'

function ffmpegBin(): string | null {
  if (process.env.FOLIO_FFMPEG) return process.env.FOLIO_FFMPEG
  try {
    const listed = execFileSync('where.exe', ['ffmpeg'], { encoding: 'utf8' })
    const found = listed.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    if (found) return found
  } catch {
    /* not on PATH */
  }
  return null
}

describe('media catalogs', () => {
  it('offers jpeg for a heic picture and skips word', () => {
    const choices = exportChoices('image', 'heic').map((choice) => choice.ext)
    assert.ok(choices.includes('jpg'))
    assert.equal(choices.includes('docx'), false)
  })

  it('offers webm for video and skips markdown', () => {
    const choices = exportChoices('video', 'mov').map((choice) => choice.ext)
    assert.ok(choices.includes('webm'))
    assert.equal(choices.includes('md'), false)
  })

  it('encodes mp4 with libx264', () => {
    assert.ok(ffmpegPlan('png', 'mp4').output.includes('libx264'))
    assert.ok(ffmpegPlan('png', 'mp4').input.includes('-loop'))
  })
})

describe('pictures', () => {
  it('writes a png ffmpeg can read', async () => {
    const pixels = new Uint8Array(2 * 2 * 4)
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 220
      pixels[index + 1] = 40
      pixels[index + 2] = 40
      pixels[index + 3] = 255
    }
    const png = encodePng(2, 2, pixels)
    assert.equal(png[0], 137)
    assert.equal(png[1], 80)
    assert.equal(png[2], 78)
    assert.equal(png[3], 71)
    const bin = ffmpegBin()
    if (!bin) return
    const dir = await mkdtemp(path.join(os.tmpdir(), 'folio-png-'))
    const file = path.join(dir, 'tiny.png')
    try {
      await writeFile(file, png)
      execFileSync(bin, ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('round-trips a still through heic', async () => {
    const bin = ffmpegBin()
    if (!bin) return
    const pixels = new Uint8Array(8 * 8 * 4)
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 20
      pixels[index + 1] = 90
      pixels[index + 2] = 160
      pixels[index + 3] = 255
    }
    const dir = await mkdtemp(path.join(os.tmpdir(), 'folio-heic-'))
    const file = path.join(dir, 'tiny.png')
    try {
      await writeFile(file, encodePng(8, 8, pixels))
      const heic = await encodeHeic(bin, file)
      assert.ok(heic.byteLength > 32)
      const png = await decodeHeic(heic)
      assert.equal(png[0], 137)
      assert.equal(png[1], 80)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
