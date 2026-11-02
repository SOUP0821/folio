import { cpp } from '@codemirror/lang-cpp'
import { css } from '@codemirror/lang-css'
import { go } from '@codemirror/lang-go'
import { html } from '@codemirror/lang-html'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { php } from '@codemirror/lang-php'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { sql } from '@codemirror/lang-sql'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { StreamLanguage, type StreamParser } from '@codemirror/language'
import { lua } from '@codemirror/legacy-modes/mode/lua'
import { perl } from '@codemirror/legacy-modes/mode/perl'
import { powerShell } from '@codemirror/legacy-modes/mode/powershell'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import type { Extension } from '@codemirror/state'
import type { SourceLang } from '@shared/formats'

function stream(parser: StreamParser<unknown>): Extension {
  return StreamLanguage.define(parser)
}

export function codeLanguage(ext: string, lang: SourceLang): Extension {
  if (lang === 'markdown' || ext === 'md' || ext === 'mdx' || ext === 'markdown') return markdown()
  if (lang === 'html' || ext === 'vue' || ext === 'svelte' || ext === 'astro') return html()
  if (lang === 'json' || ext === 'jsonc' || ext === 'json5' || ext === 'jsonl') return json()
  if (lang === 'xml') return xml()
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return javascript()
    case 'jsx':
      return javascript({ jsx: true })
    case 'ts':
    case 'mts':
    case 'cts':
      return javascript({ typescript: true })
    case 'tsx':
      return javascript({ jsx: true, typescript: true })
    case 'py':
    case 'pyw':
    case 'pyi':
      return python()
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return css()
    case 'c':
    case 'h':
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
    case 'hh':
      return cpp()
    case 'rs':
      return rust()
    case 'go':
      return go()
    case 'java':
    case 'kt':
    case 'kts':
      return java()
    case 'php':
    case 'phtml':
      return php()
    case 'sql':
      return sql()
    case 'yml':
    case 'yaml':
      return yaml()
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
    case 'ksh':
      return stream(shell)
    case 'ps1':
    case 'psm1':
    case 'psd1':
      return stream(powerShell)
    case 'lua':
      return stream(lua)
    case 'rb':
      return stream(ruby)
    case 'pl':
    case 'pm':
      return stream(perl)
    case 'ini':
    case 'cfg':
    case 'conf':
    case 'env':
    case 'properties':
      return stream(properties)
    default:
      return []
  }
}
