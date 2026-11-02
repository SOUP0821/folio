import type { ReactNode } from 'react'

export function Sheet({
  label,
  meta,
  children,
  split = false,
}: {
  label: string
  meta?: string
  children: ReactNode
  split?: boolean
}) {
  return (
    <article className={split ? 'sheet sheet-split' : 'sheet'}>
      <header className="sheet-label">
        <span>{label}</span>
        {meta ? <span>{meta}</span> : null}
      </header>
      <div className="sheet-body">{children}</div>
    </article>
  )
}
