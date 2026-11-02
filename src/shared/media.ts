export interface FfmpegPlan {
  input: string[]
  output: string[]
}

export interface MediaChoice {
  ext: string
  label: string
}

const STILLS = new Set([
  'png', 'jpg', 'jpeg', 'jpe', 'jfif', 'gif', 'webp', 'bmp', 'svg', 'svgz', 'ico',
  'tif', 'tiff', 'heic', 'heif', 'avif', 'jxl', 'jp2', 'tga', 'qoi', 'psd',
  'pcx', 'ppm', 'pgm', 'pbm', 'pnm', 'xbm', 'hdr', 'dds', 'pict', 'pct', 'ras', 'sgi',
])

const VIDEOS = new Set([
  'mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'wmv', 'flv', 'mpeg', 'mpg',
  'ts', 'm2ts', 'mts', '3gp', '3g2', 'ogv', 'vob', 'asf', 'm3u8', 'm3u', 'pls',
  'mxf', 'm2v', 'ogm', 'rm', 'divx', 'f4v', 'wtv', 'dv',
])

export const NATIVE_STILL = new Set([
  'png', 'jpg', 'jpeg', 'jpe', 'jfif', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif',
])

export const NATIVE_VIDEO = new Set(['mp4', 'm4v', 'webm', 'ogv', 'mov'])

export const NATIVE_AUDIO = new Set([
  'mp3', 'wav', 'wave', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'opus',
])

const CANVAS_TARGETS = new Set(['png', 'jpg', 'jpeg', 'webp'])

export function canonExt(ext: string): string {
  const clean = ext.toLowerCase().replace(/^\./, '')
  if (clean === 'jpeg' || clean === 'jpe' || clean === 'jfif') return 'jpg'
  if (clean === 'tiff') return 'tif'
  if (clean === 'heif') return 'heic'
  if (clean === 'wave') return 'wav'
  if (clean === 'aif') return 'aiff'
  return clean
}

export function sameExt(left: string, right: string): boolean {
  return canonExt(left) === canonExt(right)
}

export function isNativeStill(ext: string): boolean {
  return NATIVE_STILL.has(ext.toLowerCase())
}

export function isNativePlayback(ext: string): boolean {
  const clean = ext.toLowerCase()
  return NATIVE_VIDEO.has(clean) || NATIVE_AUDIO.has(clean)
}

export function canDecodeWithoutFfmpeg(ext: string): boolean {
  const clean = ext.toLowerCase()
  return isNativeStill(clean) || clean === 'heic' || clean === 'heif'
}

export function targetNeedsFfmpeg(kind: string, from: string, to: string): boolean {
  if (to === 'pdf') return !canDecodeWithoutFfmpeg(from)
  if (kind === 'video' || kind === 'audio') return true
  if (CANVAS_TARGETS.has(canonExt(to))) return !canDecodeWithoutFfmpeg(from)
  return true
}

const IMAGE_CHOICES: MediaChoice[] = [
  { ext: 'jpg', label: 'JPEG' },
  { ext: 'png', label: 'PNG' },
  { ext: 'webp', label: 'WebP' },
  { ext: 'avif', label: 'AVIF' },
  { ext: 'gif', label: 'GIF' },
  { ext: 'heic', label: 'HEIC' },
  { ext: 'jxl', label: 'JPEG XL' },
  { ext: 'tif', label: 'TIFF' },
  { ext: 'bmp', label: 'BMP' },
  { ext: 'pdf', label: 'PDF' },
  { ext: 'mp4', label: 'MP4' },
]

const VIDEO_CHOICES: MediaChoice[] = [
  { ext: 'mp4', label: 'MP4' },
  { ext: 'webm', label: 'WebM' },
  { ext: 'mov', label: 'QuickTime' },
  { ext: 'mkv', label: 'Matroska' },
  { ext: 'avi', label: 'AVI' },
  { ext: 'gif', label: 'GIF' },
  { ext: 'mp3', label: 'MP3 audio' },
]

const AUDIO_CHOICES: MediaChoice[] = [
  { ext: 'mp3', label: 'MP3' },
  { ext: 'wav', label: 'WAV' },
  { ext: 'flac', label: 'FLAC' },
  { ext: 'm4a', label: 'AAC' },
  { ext: 'ogg', label: 'Ogg' },
  { ext: 'opus', label: 'Opus' },
  { ext: 'aiff', label: 'AIFF' },
  { ext: 'wma', label: 'WMA' },
]

export function mediaChoices(kind: string): MediaChoice[] {
  if (kind === 'image') return IMAGE_CHOICES
  if (kind === 'video') return VIDEO_CHOICES
  if (kind === 'audio') return AUDIO_CHOICES
  return []
}

export function playbackMime(ext: string): string {
  switch (canonExt(ext)) {
    case 'png': return 'image/png'
    case 'jpg': return 'image/jpeg'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'bmp': return 'image/bmp'
    case 'svg': return 'image/svg+xml'
    case 'avif': return 'image/avif'
    case 'ico': return 'image/x-icon'
    case 'mp4':
    case 'm4v': return 'video/mp4'
    case 'webm': return 'video/webm'
    case 'ogv': return 'video/ogg'
    case 'mov': return 'video/quicktime'
    case 'mp3': return 'audio/mpeg'
    case 'wav': return 'audio/wav'
    case 'flac': return 'audio/flac'
    case 'ogg':
    case 'oga': return 'audio/ogg'
    case 'opus': return 'audio/opus'
    case 'm4a':
    case 'aac': return 'audio/mp4'
    default: return 'application/octet-stream'
  }
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remain = total % 60
  const clock = `${minutes}:${String(remain).padStart(2, '0')}`
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}` : clock
}

export function playlistFlags(ext: string): string[] {
  const source = canonExt(ext)
  if (source !== 'm3u8' && source !== 'm3u' && source !== 'pls') return []
  return ['-f', 'hls', '-protocol_whitelist', 'file,http,https,tcp,tls,crypto', '-allowed_extensions', 'ALL']
}

export function ffmpegPlan(from: string, to: string): FfmpegPlan {
  const source = canonExt(from)
  const target = canonExt(to)
  const input: string[] = []
  const output: string[] = []
  const videoOut = target === 'mp4' || target === 'm4v' || target === 'mov' || target === 'webm' || target === 'mkv' || target === 'avi' || target === 'ogv' || target === 'wmv'
  const loopable = STILLS.has(source) && source !== 'gif' && source !== 'heic' && source !== 'svg' && source !== 'svgz'
  input.push(...playlistFlags(source))
  if (loopable && videoOut) {
    input.push('-loop', '1', '-framerate', '1')
    output.push('-t', '1')
  }
  if (target === 'mp4' || target === 'm4v' || target === 'mov') {
    output.push('-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart')
  } else if (target === 'mkv') {
    output.push('-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k')
  } else if (target === 'webm') {
    output.push('-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-c:a', 'libopus', '-b:a', '128k')
  } else if (target === 'avi') {
    output.push('-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'mp3', '-q:a', '2')
  } else if (target === 'ogv') {
    output.push('-c:v', 'libtheora', '-q:v', '7', '-c:a', 'libvorbis', '-q:a', '5')
  } else if (target === 'wmv') {
    output.push('-c:v', 'msmpeg4', '-q:v', '4', '-c:a', 'wmav2', '-b:a', '192k')
  } else if (target === 'gif' && VIDEOS.has(source)) {
    output.push('-filter_complex', '[0:v]fps=12,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse')
  } else if (target === 'mp3') {
    output.push('-vn', '-c:a', 'libmp3lame', '-q:a', '2')
  } else if (target === 'wav') {
    output.push('-vn', '-c:a', 'pcm_s16le')
  } else if (target === 'flac') {
    output.push('-vn', '-c:a', 'flac')
  } else if (target === 'm4a' || target === 'aac') {
    output.push('-vn', '-c:a', 'aac', '-b:a', '192k')
  } else if (target === 'ogg' || target === 'oga') {
    output.push('-vn', '-c:a', 'libvorbis', '-q:a', '5')
  } else if (target === 'opus') {
    output.push('-vn', '-c:a', 'libopus', '-b:a', '128k')
  } else if (target === 'aiff') {
    output.push('-vn', '-c:a', 'pcm_s16be')
  } else if (target === 'wma') {
    output.push('-vn', '-c:a', 'wmav2', '-b:a', '192k')
  } else if (target === 'jpg') {
    output.push('-frames:v', '1', '-q:v', '2', '-update', '1')
  } else if (target === 'webp') {
    output.push('-c:v', 'libwebp', '-quality', '86')
    if (source !== 'gif') output.push('-frames:v', '1', '-update', '1')
  } else if (target === 'avif') {
    output.push('-frames:v', '1', '-c:v', 'libaom-av1', '-still-picture', '1', '-cpu-used', '8', '-crf', '32')
  } else if (target === 'jxl') {
    output.push('-frames:v', '1', '-c:v', 'libjxl', '-distance', '1', '-update', '1')
  } else if (target === 'png' || target === 'bmp' || target === 'tif' || target === 'gif' || target === 'tga' || target === 'qoi' || target === 'jp2' || target === 'ico') {
    output.push('-frames:v', '1', '-update', '1')
  }
  return { input, output }
}

export function previewPlan(kind: 'video' | 'audio'): { ext: string; output: string[] } {
  if (kind === 'audio') {
    return { ext: 'mp3', output: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'] }
  }
  return {
    ext: 'mp4',
    output: ['-t', '12', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'],
  }
}

export const POSTER_ARGS = ['-ss', '0', '-frames:v', '1', '-update', '1']

export const FFMPEG_MISSING = 'Install FFmpeg to convert this format. Folio uses ffmpeg when it is on PATH.'
