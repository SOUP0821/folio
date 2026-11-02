import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

async function wingetInstall(id: string): Promise<void> {
  await exec('winget', [
    'install',
    '--id',
    id,
    '-e',
    '--scope',
    'user',
    '--disable-interactivity',
    '--accept-package-agreements',
    '--accept-source-agreements',
  ], { windowsHide: true, timeout: 300000 })
}

export async function installMissing(tools: { pandoc: boolean; ffmpeg: boolean }): Promise<void> {
  if (!tools.ffmpeg) {
    try {
      await wingetInstall('Gyan.FFmpeg')
    } catch {
      /* winget can refuse a quiet install */
    }
  }
  if (!tools.pandoc) {
    try {
      await wingetInstall('JohnMacFarlane.Pandoc')
    } catch {
      /* pandoc stays optional if the install cannot finish */
    }
  }
}
