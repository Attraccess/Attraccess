import type { DashboardWidgetSize } from '@attraccess/plugins-frontend-sdk';

export type TileSize = DashboardWidgetSize;

/** All sizes, smallest first: the order of the size control and the gallery's size selector. */
export const TILE_SIZES: readonly TileSize[] = ['small', 'medium', 'large'];

/** The sizes an item offers and the one a new tile gets. */
export interface TileSizes {
  sizes: readonly TileSize[];
  defaultSize: TileSize;
}

export const PAGE_TILE_SIZES: TileSizes = { sizes: ['small'], defaultSize: 'small' };
export const RESOURCE_TILE_SIZES: TileSizes = { sizes: ['small', 'large'], defaultSize: 'large' };

/** The stored size when the item still offers it, else its default: sizes an item dropped fall back quietly. */
export function resolveTileSize(stored: string | null | undefined, { sizes, defaultSize }: TileSizes): TileSize {
  return sizes.includes(stored as TileSize) ? (stored as TileSize) : defaultSize;
}

/**
 * Grid cells per size, as on a phone home screen: small 1×1, medium 2×1, large 2×2. In the two-column layout medium
 * and large therefore span the full width.
 */
export const TILE_SPAN_CLASSES: Record<TileSize, string> = {
  small: 'col-span-1 row-span-1',
  medium: 'col-span-2 row-span-1',
  large: 'col-span-2 row-span-2',
};

/**
 * The dashboard grid: 2, 4 or 6 columns by the width next to the sidebar, fixed rows (--dashboard-row) so tiles line
 * up, and dense packing so small tiles fill the holes a wider tile leaves. The gallery's previews use the same rows.
 */
export const TILE_ROWS_CLASSES = 'auto-rows-[var(--dashboard-row)] gap-3 [--dashboard-row:11rem]';

export const DASHBOARD_GRID_CLASSES = `grid grid-cols-2 grid-flow-row-dense ${TILE_ROWS_CLASSES} @min-[40rem]:grid-cols-4 @min-[64rem]:grid-cols-6`;
