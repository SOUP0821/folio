const GROUPS = [
  ['Playlists', '.m3u8, .m3u, .pls'],
  ['Scripts', '.ahk, .ps1, .bat, .sh, .py, .js, .lua'],
  ['Code', '.ts, .css, .json, .xml, .yml, .sql, .c, .rs, .go'],
  ['Text', '.txt, .md, .html, .tex, .log, .srt, .ass'],
  ['Config', '.ini, .toml, .cfg, .env, .reg'],
  ['Pictures', '.svg, .jpg, .png, .heic, .webp, .gif, .jxl'],
  ['Video', '.mp4, .mov, .webm, .mkv, .avi'],
  ['Audio', '.mp3, .wav, .flac, .aac, .ogg'],
  ['Pages', '.pdf, .docx, .epub, .csv'],
]

export function Welcome({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="welcome">
      <h1>Drop a file</h1>
      <p>Text and scripts open for editing. Pictures, video, and playlists open for viewing. Any other text file does too.</p>
      <button type="button" className="btn primary" onClick={onOpen}>Open a file</button>
      <ul>
        {GROUPS.map(([name, kinds]) => (
          <li key={name}>
            <span>{name}</span>
            {kinds}
          </li>
        ))}
      </ul>
    </div>
  )
}
