export function Modal({
  message,
  detail,
  onChoice,
}: {
  message: string
  detail: string
  onChoice: (choice: 'save' | 'discard' | 'cancel') => void
}) {
  return (
    <div className="modal-back" role="presentation" onMouseDown={() => onChoice('cancel')}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="modal-title">{message}</h2>
        <p>{detail}</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => onChoice('cancel')}>Cancel</button>
          <button type="button" className="btn" onClick={() => onChoice('discard')}>Discard</button>
          <button type="button" className="btn primary" onClick={() => onChoice('save')} autoFocus>Save</button>
        </div>
      </div>
    </div>
  )
}
