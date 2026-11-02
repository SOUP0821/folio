import { mediaChoices, sameExt, targetNeedsFfmpeg } from './media'

export type DocKind = 'pdf' | 'docx' | 'rich' | 'source' | 'grid' | 'image' | 'ebook' | 'video' | 'audio'

export type SourceLang = 'plain' | 'markdown' | 'html' | 'json' | 'xml'

export type ViewMode = 'pages' | 'read' | 'edit' | 'split'

export interface FormatInfo {
  ext: string
  label: string
  kind: DocKind
  lang: SourceLang
  description: string
}

type TextSpec = [string, string, SourceLang?]

const TEXT_EXTRA: TextSpec[] = [
  ['ahk', 'AutoHotkey'], ['ahkl', 'AutoHotkey'], ['au3', 'AutoIt'],
  ['ps1', 'PowerShell'], ['psm1', 'PowerShell'], ['psd1', 'PowerShell'],
  ['bat', 'Batch'], ['cmd', 'Batch'], ['vbs', 'VBScript'], ['wsf', 'Windows script'],
  ['sh', 'Shell'], ['bash', 'Shell'], ['zsh', 'Shell'], ['fish', 'Shell'], ['ksh', 'Shell'],
  ['js', 'JavaScript'], ['jsx', 'JavaScript'], ['mjs', 'JavaScript'], ['cjs', 'JavaScript'],
  ['tsx', 'TypeScript'], ['cts', 'TypeScript'],
  ['py', 'Python'], ['pyw', 'Python'], ['pyi', 'Python'], ['rb', 'Ruby'], ['gemspec', 'Ruby'],
  ['pl', 'Perl'], ['pm', 'Perl'], ['lua', 'Lua'], ['php', 'PHP', 'html'], ['phtml', 'PHP', 'html'],
  ['go', 'Go'], ['rs', 'Rust'], ['java', 'Java'], ['kt', 'Kotlin'], ['kts', 'Kotlin'],
  ['scala', 'Scala'], ['cs', 'C#'], ['fs', 'F#'], ['fsx', 'F#'], ['vb', 'Visual Basic'],
  ['swift', 'Swift'], ['dart', 'Dart'], ['ex', 'Elixir'], ['exs', 'Elixir'],
  ['erl', 'Erlang'], ['hrl', 'Erlang'], ['clj', 'Clojure'], ['cljs', 'Clojure'],
  ['hs', 'Haskell'], ['ml', 'OCaml'], ['nim', 'Nim'], ['zig', 'Zig'], ['cr', 'Crystal'],
  ['d', 'D'], ['pas', 'Pascal'], ['pp', 'Pascal'], ['groovy', 'Groovy'], ['gradle', 'Gradle'],
  ['jl', 'Julia'], ['r', 'R'], ['tcl', 'Tcl'], ['awk', 'Awk'],
  ['c', 'C'], ['h', 'C'], ['cpp', 'C++'], ['cc', 'C++'], ['cxx', 'C++'], ['hpp', 'C++'], ['hh', 'C++'],
  ['m', 'Objective-C'], ['mm', 'Objective-C'], ['csproj', 'Project', 'xml'], ['fsproj', 'Project', 'xml'],
  ['vbproj', 'Project', 'xml'], ['vcxproj', 'Project', 'xml'], ['sln', 'Solution'],
  ['css', 'CSS'], ['scss', 'SCSS'], ['sass', 'Sass'], ['less', 'Less'], ['styl', 'Stylus'],
  ['vue', 'Vue', 'html'], ['svelte', 'Svelte', 'html'], ['astro', 'Astro', 'html'],
  ['ejs', 'Template', 'html'], ['hbs', 'Template', 'html'], ['njk', 'Template', 'html'],
  ['twig', 'Template', 'html'], ['liquid', 'Template', 'html'], ['jsp', 'JSP', 'html'],
  ['asp', 'ASP', 'html'], ['aspx', 'ASP', 'html'], ['xhtml', 'XHTML', 'html'],
  ['mdx', 'Markdown', 'markdown'], ['mkd', 'Markdown', 'markdown'], ['mkdn', 'Markdown', 'markdown'],
  ['mdwn', 'Markdown', 'markdown'], ['rmd', 'R Markdown', 'markdown'],
  ['jsonc', 'JSON'], ['json5', 'JSON'], ['jsonl', 'JSON lines'], ['ndjson', 'JSON lines'],
  ['geojson', 'GeoJSON', 'json'], ['webmanifest', 'Web manifest', 'json'], ['har', 'HAR', 'json'],
  ['ipynb', 'Notebook', 'json'], ['gltf', 'glTF', 'json'], ['map', 'Source map', 'json'],
  ['xsd', 'XML', 'xml'], ['xsl', 'XML', 'xml'], ['xslt', 'XML', 'xml'], ['plist', 'Property list', 'xml'],
  ['opml', 'OPML', 'xml'], ['rss', 'RSS', 'xml'], ['atom', 'Atom', 'xml'],
  ['kml', 'KML', 'xml'], ['gpx', 'GPX', 'xml'], ['tcx', 'TCX', 'xml'],
  ['xspf', 'Playlist', 'xml'], ['wpl', 'Playlist', 'xml'], ['asx', 'Playlist', 'xml'], ['smil', 'SMIL', 'xml'],
  ['resx', 'Resources', 'xml'], ['cshtml', 'Razor', 'html'], ['razor', 'Razor', 'html'],
  ['sql', 'SQL'], ['graphql', 'GraphQL'], ['gql', 'GraphQL'], ['proto', 'Protobuf'],
  ['cfg', 'Config'], ['conf', 'Config'], ['config', 'Config'], ['inf', 'Setup'],
  ['reg', 'Registry'], ['url', 'Internet shortcut'], ['theme', 'Theme'],
  ['env', 'Environment'], ['properties', 'Properties'], ['prop', 'Properties'],
  ['hcl', 'HCL'], ['tf', 'Terraform'], ['tfvars', 'Terraform'],
  ['service', 'Unit file'], ['socket', 'Unit file'], ['timer', 'Unit file'], ['mount', 'Unit file'],
  ['desktop', 'Desktop entry'], ['gitignore', 'Git ignore'], ['gitattributes', 'Git attributes'],
  ['gitmodules', 'Git modules'], ['dockerignore', 'Docker ignore'], ['npmrc', 'npm config'],
  ['nvmrc', 'Node version'], ['yarnrc', 'Yarn'], ['editorconfig', 'Editor config'],
  ['prettierrc', 'Prettier'], ['eslintrc', 'ESLint'], ['babelrc', 'Babel'],
  ['cmake', 'CMake'], ['mak', 'Makefile'], ['mk', 'Makefile'], ['ninja', 'Ninja'],
  ['pro', 'Qt project'], ['pri', 'Qt project'], ['qrc', 'Qt resource', 'xml'],
  ['glsl', 'Shader'], ['vert', 'Shader'], ['frag', 'Shader'], ['hlsl', 'Shader'], ['wgsl', 'Shader'],
  ['iss', 'Inno Setup'], ['nsi', 'NSIS'], ['nsh', 'NSIS'],
  ['diff', 'Diff'], ['patch', 'Patch'], ['rej', 'Reject'],
  ['ass', 'Subtitles'], ['ssa', 'Subtitles'], ['sub', 'Subtitles'], ['sbv', 'Subtitles'], ['lrc', 'Lyrics'],
  ['ics', 'Calendar'], ['ical', 'Calendar'], ['vcf', 'vCard'], ['vcard', 'vCard'],
  ['eml', 'Email'], ['mht', 'MHTML'], ['mhtml', 'MHTML'],
  ['pem', 'Certificate'], ['crt', 'Certificate'], ['cer', 'Certificate'], ['key', 'Key'],
  ['bib', 'BibTeX'], ['texi', 'Texinfo'], ['pod', 'Perl pod'], ['rdoc', 'RDoc'],
  ['textile', 'Textile'], ['wiki', 'Wiki'], ['nfo', 'NFO'], ['diz', 'Diz'], ['me', 'Text'],
  ['spec', 'Spec'], ['lock', 'Lockfile'],
]

const MEDIA_EXTRA: FormatInfo[] = [
  { ext: 'pls', label: 'PLS', kind: 'video', lang: 'plain', description: 'Media playlist' },
  { ext: 'pcx', label: 'PCX', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'ppm', label: 'PPM', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'pgm', label: 'PGM', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'pbm', label: 'PBM', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'pnm', label: 'PNM', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'xbm', label: 'XBM', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'hdr', label: 'HDR', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'dds', label: 'DDS', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'pict', label: 'PICT', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'pct', label: 'PICT', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'ras', label: 'Sun raster', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'sgi', label: 'SGI', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'mxf', label: 'MXF', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'm2v', label: 'MPEG', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'ogm', label: 'Ogg media', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'rm', label: 'RealMedia', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'divx', label: 'DivX', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'f4v', label: 'Flash video', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'wtv', label: 'WTV', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'dv', label: 'DV', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'mka', label: 'Matroska audio', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'mp2', label: 'MP2', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'au', label: 'AU', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'caf', label: 'CAF', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'spx', label: 'Speex', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'mid', label: 'MIDI', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'midi', label: 'MIDI', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'wv', label: 'WavPack', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'ra', label: 'RealAudio', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'dts', label: 'DTS', kind: 'audio', lang: 'plain', description: 'Audio' },
]

function textFormat([ext, label, lang]: TextSpec): FormatInfo {
  return { ext, label, kind: 'source', lang: lang ?? 'plain', description: 'Text you can edit' }
}

export const FORMATS: FormatInfo[] = [
  { ext: 'pdf', label: 'PDF', kind: 'pdf', lang: 'plain', description: 'Pages, extracted text, and export' },
  { ext: 'docx', label: 'Word', kind: 'docx', lang: 'html', description: 'Layout view and rich text editing' },
  { ext: 'doc', label: 'Word 97', kind: 'docx', lang: 'html', description: 'Opened through LibreOffice' },
  { ext: 'odt', label: 'OpenDocument', kind: 'rich', lang: 'html', description: 'Text from an ODT package' },
  { ext: 'rtf', label: 'Rich text', kind: 'rich', lang: 'html', description: 'Rich text with basic formatting' },
  { ext: 'epub', label: 'EPUB', kind: 'ebook', lang: 'html', description: 'Chapters in reading order' },
  { ext: 'txt', label: 'Plain text', kind: 'source', lang: 'plain', description: 'Plain text' },
  { ext: 'text', label: 'Plain text', kind: 'source', lang: 'plain', description: 'Plain text' },
  { ext: 'md', label: 'Markdown', kind: 'source', lang: 'markdown', description: 'Markdown with a reading preview' },
  { ext: 'markdown', label: 'Markdown', kind: 'source', lang: 'markdown', description: 'Markdown with a reading preview' },
  { ext: 'mdown', label: 'Markdown', kind: 'source', lang: 'markdown', description: 'Markdown with a reading preview' },
  { ext: 'html', label: 'HTML', kind: 'source', lang: 'html', description: 'HTML source and preview' },
  { ext: 'htm', label: 'HTML', kind: 'source', lang: 'html', description: 'HTML source and preview' },
  { ext: 'rst', label: 'reStructuredText', kind: 'source', lang: 'plain', description: 'Preview uses Pandoc when it is installed' },
  { ext: 'tex', label: 'LaTeX', kind: 'source', lang: 'plain', description: 'Preview uses Pandoc when it is installed' },
  { ext: 'latex', label: 'LaTeX', kind: 'source', lang: 'plain', description: 'Preview uses Pandoc when it is installed' },
  { ext: 'org', label: 'Org', kind: 'source', lang: 'plain', description: 'Preview uses Pandoc when it is installed' },
  { ext: 'adoc', label: 'AsciiDoc', kind: 'source', lang: 'plain', description: 'Preview uses Pandoc when it is installed' },
  { ext: 'asciidoc', label: 'AsciiDoc', kind: 'source', lang: 'plain', description: 'Preview uses Pandoc when it is installed' },
  { ext: 'log', label: 'Log', kind: 'source', lang: 'plain', description: 'Log text' },
  { ext: 'yaml', label: 'YAML', kind: 'source', lang: 'plain', description: 'YAML text' },
  { ext: 'yml', label: 'YAML', kind: 'source', lang: 'plain', description: 'YAML text' },
  { ext: 'toml', label: 'TOML', kind: 'source', lang: 'plain', description: 'TOML text' },
  { ext: 'ini', label: 'INI', kind: 'source', lang: 'plain', description: 'INI text' },
  { ext: 'csv', label: 'CSV', kind: 'grid', lang: 'plain', description: 'Comma-separated table' },
  { ext: 'tsv', label: 'TSV', kind: 'grid', lang: 'plain', description: 'Tab-separated table' },
  { ext: 'xlsx', label: 'Excel', kind: 'grid', lang: 'plain', description: 'Spreadsheet sheets' },
  { ext: 'xls', label: 'Excel 97', kind: 'grid', lang: 'plain', description: 'Spreadsheet sheets' },
  { ext: 'json', label: 'JSON', kind: 'source', lang: 'json', description: 'JSON text' },
  { ext: 'xml', label: 'XML', kind: 'source', lang: 'xml', description: 'XML text' },
  { ext: 'png', label: 'PNG', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'jpg', label: 'JPEG', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'jpeg', label: 'JPEG', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'gif', label: 'GIF', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'webp', label: 'WebP', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'bmp', label: 'BMP', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'svg', label: 'SVG', kind: 'image', lang: 'plain', description: 'Vector picture' },
  { ext: 'svgz', label: 'SVG', kind: 'image', lang: 'plain', description: 'Compressed vector picture' },
  { ext: 'jpe', label: 'JPEG', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'jfif', label: 'JPEG', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'ico', label: 'Icon', kind: 'image', lang: 'plain', description: 'Image' },
  { ext: 'heic', label: 'HEIC', kind: 'image', lang: 'plain', description: 'HEIC picture' },
  { ext: 'heif', label: 'HEIF', kind: 'image', lang: 'plain', description: 'HEIF picture' },
  { ext: 'avif', label: 'AVIF', kind: 'image', lang: 'plain', description: 'AVIF picture' },
  { ext: 'jxl', label: 'JPEG XL', kind: 'image', lang: 'plain', description: 'JPEG XL picture' },
  { ext: 'tif', label: 'TIFF', kind: 'image', lang: 'plain', description: 'TIFF picture' },
  { ext: 'tiff', label: 'TIFF', kind: 'image', lang: 'plain', description: 'TIFF picture' },
  { ext: 'jp2', label: 'JPEG 2000', kind: 'image', lang: 'plain', description: 'JPEG 2000 picture' },
  { ext: 'tga', label: 'TGA', kind: 'image', lang: 'plain', description: 'Targa picture' },
  { ext: 'qoi', label: 'QOI', kind: 'image', lang: 'plain', description: 'QOI picture' },
  { ext: 'psd', label: 'Photoshop', kind: 'image', lang: 'plain', description: 'Photoshop picture' },
  { ext: 'mp4', label: 'MP4', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'm4v', label: 'MP4', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'mov', label: 'QuickTime', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'webm', label: 'WebM', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'mkv', label: 'Matroska', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'avi', label: 'AVI', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'wmv', label: 'WMV', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'flv', label: 'Flash video', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'mpeg', label: 'MPEG', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'mpg', label: 'MPEG', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'ts', label: 'MPEG-TS', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'm2ts', label: 'MPEG-TS', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'mts', label: 'MPEG-TS', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: '3gp', label: '3GP', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: '3g2', label: '3GP', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'ogv', label: 'Ogg video', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'vob', label: 'VOB', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'asf', label: 'ASF', kind: 'video', lang: 'plain', description: 'Video' },
  { ext: 'm3u8', label: 'HLS', kind: 'video', lang: 'plain', description: 'HLS playlist' },
  { ext: 'm3u', label: 'M3U', kind: 'video', lang: 'plain', description: 'Media playlist' },
  { ext: 'mp3', label: 'MP3', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'wav', label: 'WAV', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'wave', label: 'WAV', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'flac', label: 'FLAC', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'aac', label: 'AAC', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'm4a', label: 'AAC', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'ogg', label: 'Ogg', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'oga', label: 'Ogg', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'opus', label: 'Opus', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'wma', label: 'WMA', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'aiff', label: 'AIFF', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'aif', label: 'AIFF', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'ac3', label: 'AC-3', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'amr', label: 'AMR', kind: 'audio', lang: 'plain', description: 'Audio' },
  { ext: 'srt', label: 'Subtitles', kind: 'source', lang: 'plain', description: 'Subtitle text' },
  { ext: 'vtt', label: 'WebVTT', kind: 'source', lang: 'plain', description: 'Subtitle text' },
  ...TEXT_EXTRA.map(textFormat),
  ...MEDIA_EXTRA,
]

const BY_EXT = new Map(FORMATS.map((format) => [format.ext, format]))

export function extensionOf(name: string): string {
  const match = /\.([^.\\/]+)$/.exec(name)
  return match ? match[1].toLowerCase() : ''
}

export function replaceExt(name: string, ext: string): string {
  const clean = ext.replace(/^\./, '')
  const base = name.replace(/\.[^.\\/]+$/, '')
  return `${base || 'Untitled'}.${clean}`
}

export function formatFor(ext: string): FormatInfo | null {
  return BY_EXT.get(ext.toLowerCase().replace(/^\./, '')) ?? null
}

export function isPlaylist(ext: string): boolean {
  return ext === 'm3u' || ext === 'm3u8' || ext === 'pls'
}

export function defaultMode(kind: DocKind, ext: string): ViewMode {
  if (kind === 'pdf' || kind === 'image' || kind === 'video' || kind === 'audio') return 'pages'
  if (kind === 'docx' || kind === 'rich' || kind === 'ebook') return 'read'
  if (kind === 'grid') return 'edit'
  if (['md', 'markdown', 'mdown', 'html', 'htm'].includes(ext)) return 'split'
  return 'edit'
}

export function modesFor(kind: DocKind, ext: string): { id: ViewMode; label: string }[] {
  if (kind === 'pdf') return [
    { id: 'pages', label: 'Pages' },
    { id: 'edit', label: 'Text' },
  ]
  if (kind === 'docx') return [
    { id: 'read', label: 'Layout' },
    { id: 'edit', label: 'Edit' },
  ]
  if (kind === 'image') return [{ id: 'pages', label: 'View' }]
  if (isPlaylist(ext)) return [
    { id: 'pages', label: 'Play' },
    { id: 'edit', label: 'Edit' },
  ]
  if (kind === 'video' || kind === 'audio') return [{ id: 'pages', label: 'Play' }]
  if (kind === 'grid') return [{ id: 'edit', label: 'Table' }]
  if (kind === 'rich' || kind === 'ebook') return [
    { id: 'read', label: 'Read' },
    { id: 'edit', label: 'Edit' },
  ]
  if (['md', 'markdown', 'mdown', 'html', 'htm', 'rst', 'tex', 'latex', 'adoc', 'asciidoc', 'org'].includes(ext)) {
    return [
      { id: 'edit', label: 'Write' },
      { id: 'split', label: 'Split' },
      { id: 'read', label: 'Read' },
    ]
  }
  return [{ id: 'edit', label: 'Edit' }]
}

export const OPEN_EXTENSIONS = [...new Set(FORMATS.map((format) => format.ext))]

export const OPEN_WITH_EXTENSIONS = [
  'pdf', 'docx', 'doc', 'odt', 'rtf', 'epub',
  'txt', 'md', 'markdown', 'html', 'htm',
  'csv', 'tsv', 'xlsx', 'xls', 'json', 'xml', 'log', 'rst', 'tex', 'adoc',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'svgz', 'heic', 'heif', 'avif', 'jxl', 'tif', 'tiff',
  'mp4', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'm4v', 'm3u8', 'm3u',
  'srt', 'vtt', 'ass', 'ssa',
  'mp3', 'wav', 'flac', 'm4a', 'ogg', 'opus', 'aac', 'wma', 'aiff',
  'ahk', 'ps1', 'bat', 'cmd', 'js', 'jsx', 'ts', 'tsx', 'py', 'css', 'scss',
  'yml', 'yaml', 'sh', 'lua', 'sql', 'php', 'rs', 'go', 'c', 'cpp', 'h', 'hpp',
  'java', 'cs', 'rb', 'pl', 'toml', 'cfg', 'conf', 'ini', 'env', 'vue', 'svelte',
  'pls', 'vbs', 'reg', 'pem', 'jsonc', 'au3',
]

export const ASSOCIATION_VERSION = 4

export const OPEN_FILTERS: { name: string; extensions: string[] }[] = [
  { name: 'Documents Folio opens', extensions: OPEN_EXTENSIONS },
  { name: 'PDF', extensions: ['pdf'] },
  { name: 'Word and rich text', extensions: ['docx', 'doc', 'odt', 'rtf'] },
  { name: 'Text, code, and scripts', extensions: FORMATS.filter((format) => format.kind === 'source').map((format) => format.ext) },
  { name: 'Spreadsheets and data', extensions: ['csv', 'tsv', 'xlsx', 'xls', 'json', 'xml'] },
  { name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'svgz', 'heic', 'heif', 'avif', 'jxl', 'tif', 'tiff'] },
  { name: 'Video and playlists', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'm4v', 'm3u8', 'm3u', 'pls', 'mxf', 'ogm'] },
  { name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'opus', 'aac', 'wma', 'aiff'] },
  { name: 'All files', extensions: ['*'] },
]

export function imageMime(ext: string): string {
  switch (ext) {
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'bmp': return 'image/bmp'
    case 'svg': return 'image/svg+xml'
    case 'avif': return 'image/avif'
    case 'ico': return 'image/x-icon'
    case 'jpe':
    case 'jfif': return 'image/jpeg'
    default: return 'application/octet-stream'
  }
}

export function looksBinary(data: Uint8Array): boolean {
  const length = Math.min(data.length, 8000)
  if (length === 0) return false
  let odd = 0
  for (let index = 0; index < length; index += 1) {
    const byte = data[index]
    if (byte === 0) return true
    if (byte < 9 || (byte > 13 && byte < 32)) odd += 1
  }
  return odd / length > 0.08
}

export const PANDOC_PREVIEW: Record<string, string> = {
  rst: 'rst',
  tex: 'latex',
  latex: 'latex',
  org: 'org',
  adoc: 'asciidoc',
  asciidoc: 'asciidoc',
}

export interface ExportChoice {
  ext: string
  label: string
  needs?: 'pandoc' | 'desktop' | 'ffmpeg'
}

export function exportChoices(kind: DocKind, ext: string): ExportChoice[] {
  if (kind === 'image' || kind === 'video' || kind === 'audio') {
    return mediaChoices(kind)
      .filter((choice) => !sameExt(choice.ext, ext))
      .map((choice) => ({
        ext: choice.ext,
        label: choice.label,
        needs: targetNeedsFfmpeg(kind, ext, choice.ext) ? 'ffmpeg' as const : undefined,
      }))
  }
  const choices: ExportChoice[] = [
    { ext: 'pdf', label: 'PDF' },
    { ext: 'docx', label: 'Word' },
    { ext: 'md', label: 'Markdown' },
    { ext: 'html', label: 'HTML' },
    { ext: 'txt', label: 'Plain text' },
    { ext: 'rtf', label: 'Rich text' },
    { ext: 'odt', label: 'OpenDocument', needs: 'pandoc' },
    { ext: 'epub', label: 'EPUB', needs: 'pandoc' },
    { ext: 'tex', label: 'LaTeX', needs: 'pandoc' },
  ]
  if (kind === 'grid') {
    choices.push(
      { ext: 'csv', label: 'CSV' },
      { ext: 'xlsx', label: 'Excel' },
    )
  }
  return choices.filter((choice) => choice.ext !== ext)
}

export function defaultExportExt(kind: DocKind, ext: string): string {
  if (kind === 'grid') return 'csv'
  if (kind === 'image') return sameExt(ext, 'jpg') ? 'png' : 'jpg'
  if (kind === 'video') return ext === 'mp4' ? 'webm' : 'mp4'
  if (kind === 'audio') return ext === 'mp3' ? 'wav' : 'mp3'
  return 'pdf'
}

export const SAFE_SAVE = new Set([
  ...FORMATS.filter((format) => format.kind === 'source' || isPlaylist(format.ext)).map((format) => format.ext),
  'rtf', 'xlsx', 'xls', 'docx', 'csv', 'tsv',
])
