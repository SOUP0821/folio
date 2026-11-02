export type DockEdge = 'left' | 'right' | 'top' | 'bottom'
export type DockId = 'history' | 'convert'

export interface DockItem {
  enabled: boolean
  open: boolean
  edge: DockEdge
  order: number
}

export interface DocksState {
  history: DockItem
  convert: DockItem
}

const EDGES: DockEdge[] = ['left', 'right', 'top', 'bottom']

export const DEFAULT_DOCKS: DocksState = {
  history: { enabled: true, open: true, edge: 'left', order: 0 },
  convert: { enabled: true, open: true, edge: 'right', order: 0 },
}

function isEdge(value: unknown): value is DockEdge {
  return value === 'left' || value === 'right' || value === 'top' || value === 'bottom'
}

function readItem(value: unknown, fallback: DockItem): DockItem {
  if (!value || typeof value !== 'object') return fallback
  const item = value as Partial<DockItem>
  return {
    enabled: typeof item.enabled === 'boolean' ? item.enabled : fallback.enabled,
    open: typeof item.open === 'boolean' ? item.open : fallback.open,
    edge: isEdge(item.edge) ? item.edge : fallback.edge,
    order: typeof item.order === 'number' ? item.order : fallback.order,
  }
}

export function loadDocks(): DocksState {
  try {
    const saved = localStorage.getItem('folio-docks')
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<DocksState>
      return {
        history: readItem(parsed.history, DEFAULT_DOCKS.history),
        convert: readItem(parsed.convert, DEFAULT_DOCKS.convert),
      }
    }
  } catch {
    /* use the defaults */
  }
  return DEFAULT_DOCKS
}

export function collapseDocks(state: DocksState): DocksState {
  return {
    history: { ...state.history, open: false },
    convert: { ...state.convert, open: false },
  }
}

export function docksForHome(state: DocksState): DocksState {
  return {
    history: { ...state.history, open: state.history.enabled },
    convert: { ...state.convert, open: state.convert.enabled },
  }
}

export function moveDock(state: DocksState, id: DockId, edge: DockEdge, before: boolean): DocksState {
  const otherId: DockId = id === 'history' ? 'convert' : 'history'
  const other = state[otherId]
  if (other.enabled && other.edge === edge) {
    return {
      ...state,
      [id]: { ...state[id], edge, open: true, order: before ? 0 : 1 },
      [otherId]: { ...other, order: before ? 1 : 0 },
    }
  }
  return { ...state, [id]: { ...state[id], edge, open: true, order: 0 } }
}

export function panelsOn(state: DocksState, edge: DockEdge): DockId[] {
  return (['history', 'convert'] as const)
    .filter((id) => state[id].enabled && state[id].edge === edge)
    .sort((left, right) => state[left].order - state[right].order)
}

export { EDGES }
