export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const DEFAULT_CORNER: Corner = 'bottom-right';
export const CORNER_STORAGE_KEY = 'attraccess.pwaUpdateIndicator.corner';

const CORNERS: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export function isCorner(value: unknown): value is Corner {
  return CORNERS.includes(value as Corner);
}

export function nearestCorner(point: { x: number; y: number }, viewport: { width: number; height: number }): Corner {
  const vertical = point.y < viewport.height / 2 ? 'top' : 'bottom';
  const horizontal = point.x < viewport.width / 2 ? 'left' : 'right';
  return `${vertical}-${horizontal}`;
}

export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

// Arrow keys move to the adjacent corner along that axis and stay put at the edge.
export function adjacentCorner(corner: Corner, key: ArrowKey): Corner {
  const [vertical, horizontal] = corner.split('-');
  if (key === 'ArrowUp') return `top-${horizontal}` as Corner;
  if (key === 'ArrowDown') return `bottom-${horizontal}` as Corner;
  if (key === 'ArrowLeft') return `${vertical}-left` as Corner;
  return `${vertical}-right` as Corner;
}

export function loadCorner(storage: Pick<Storage, 'getItem'> | undefined = safeLocalStorage()): Corner {
  try {
    const value = storage?.getItem(CORNER_STORAGE_KEY);
    return isCorner(value) ? value : DEFAULT_CORNER;
  } catch {
    return DEFAULT_CORNER;
  }
}

export function saveCorner(corner: Corner, storage: Pick<Storage, 'setItem'> | undefined = safeLocalStorage()) {
  try {
    storage?.setItem(CORNER_STORAGE_KEY, corner);
  } catch {
    // Storage can be blocked; the corner just won't persist.
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
