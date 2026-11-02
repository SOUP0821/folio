import { PICTURE_TOOLS, type PictureOp } from '../lib/picture'

export function PictureTools({
  disabled,
  onPicture,
}: {
  disabled?: boolean
  onPicture: (op: PictureOp) => void
}) {
  return (
    <div className="tool-row" role="group" aria-label="Picture tools">
      {PICTURE_TOOLS.map((tool) => (
        <button key={tool.id} type="button" className="btn" disabled={disabled} onClick={() => onPicture(tool.id)}>
          {tool.label}
        </button>
      ))}
    </div>
  )
}
