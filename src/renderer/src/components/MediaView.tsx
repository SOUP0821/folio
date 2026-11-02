import { useState } from 'react'
import { formatClock } from '@shared/media'
import type { PictureOp } from '../lib/picture'
import type { FolioDoc } from '../types'
import { PictureTools } from './PictureTools'

export function MediaView({
  doc,
  zoom,
  onUnplayable,
  busy,
  onPicture,
}: {
  doc: FolioDoc
  zoom: number
  onUnplayable: () => void
  busy?: boolean
  onPicture?: (op: PictureOp) => void
}) {
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [broken, setBroken] = useState(false)
  const width = doc.width ?? natural?.width
  const height = doc.height ?? natural?.height
  const caption = [
    width && height ? `${width} × ${height}` : '',
    doc.duration ? formatClock(doc.duration) : '',
  ].filter(Boolean).join('  ·  ')

  let body = <p className="stage-message">Folio is preparing this file.</p>
  if (broken) {
    body = <p className="stage-message">Folio could not play this file. Export it as MP4 or MP3.</p>
  } else if (doc.kind === 'image' && doc.imageUrl) {
    body = (
      <img
        className="image-sheet"
        src={doc.imageUrl}
        alt={doc.name}
        style={width && zoom !== 1 ? { width: Math.round(width * zoom), maxWidth: 'none', maxHeight: 'none' } : undefined}
        onLoad={(event) => {
          const image = event.currentTarget
          setNatural({ width: image.naturalWidth, height: image.naturalHeight })
        }}
      />
    )
  } else if (doc.kind === 'video' && (doc.mediaUrl || doc.imageUrl)) {
    body = (
      <video
        className="video-sheet"
        src={doc.mediaUrl ?? undefined}
        poster={doc.imageUrl ?? undefined}
        controls
        playsInline
        onError={() => {
          if (doc.mediaUrl) onUnplayable()
          else setBroken(true)
        }}
      />
    )
  } else if (doc.kind === 'audio' && doc.mediaUrl) {
    body = (
      <div className="audio-card">
        <p>{doc.name}</p>
        <audio
          src={doc.mediaUrl}
          controls
          onError={() => onUnplayable()}
        />
      </div>
    )
  } else {
    body = <p className="stage-message">{doc.notice ?? 'Folio could not open this file.'}</p>
  }

  return (
    <div className="media-stage">
      {body}
      {onPicture ? <PictureTools disabled={busy} onPicture={onPicture} /> : null}
      {caption ? <p className="media-caption">{caption}</p> : null}
    </div>
  )
}
