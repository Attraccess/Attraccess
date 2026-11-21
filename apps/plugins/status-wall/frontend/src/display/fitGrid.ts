/** Width divided by height of one tile: a picture with a status band below it. */
export const TILE_ASPECT = 4 / 3;

export interface GridFit {
  columns: number;
  tileWidth: number;
}

/**
 * The column count that makes `count` tiles of a fixed aspect as large as possible inside `width` x `height`, so a
 * wall never scrolls. `gap` is the space between tiles.
 */
export function fitGrid(count: number, width: number, height: number, gap: number): GridFit {
  if (count <= 0 || width <= 0 || height <= 0) return { columns: 1, tileWidth: 0 };
  let best: GridFit = { columns: 1, tileWidth: 0 };
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const byWidth = (width - gap * (columns - 1)) / columns;
    const byHeight = ((height - gap * (rows - 1)) / rows) * TILE_ASPECT;
    const tileWidth = Math.floor(Math.min(byWidth, byHeight));
    if (tileWidth > best.tileWidth) best = { columns, tileWidth };
  }
  return best;
}
