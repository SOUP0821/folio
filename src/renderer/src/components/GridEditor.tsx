import type { SheetData } from '../types'

export function GridEditor({
  sheets,
  sheet,
  readOnly,
  onSheet,
  onRows,
}: {
  sheets: SheetData[]
  sheet: string
  readOnly: boolean
  onSheet: (name: string) => void
  onRows: (rows: string[][]) => void
}) {
  const rows = sheets.find((item) => item.name === sheet)?.rows ?? [['']]
  const width = Math.max(1, ...rows.map((row) => row.length))

  return (
    <div className="grid-wrap">
      {sheets.length > 1 ? (
        <div className="sheet-tabs" role="tablist" aria-label="Sheets">
          {sheets.map((item) => (
            <button
              key={item.name}
              type="button"
              role="tab"
              aria-selected={item.name === sheet}
              onClick={() => onSheet(item.name)}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid-scroll">
        <table className="grid">
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: width }, (_, column) => (
                  <td key={column}>
                    <input
                      aria-label={`Row ${rowIndex + 1}, column ${column + 1}`}
                      value={row[column] ?? ''}
                      readOnly={readOnly}
                      onChange={(event) => {
                        const value = event.target.value
                        onRows(rows.map((current, index) => {
                          if (index !== rowIndex) return current
                          const next = current.slice()
                          while (next.length <= column) next.push('')
                          next[column] = value
                          return next
                        }))
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
