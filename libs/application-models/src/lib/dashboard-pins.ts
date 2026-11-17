export type DashboardPinItemType = 'page' | 'resource' | 'widget';
export type DashboardPinSize = 'small' | 'medium' | 'large';

/** One entry on a user's personal dashboard: the item and the tile size the user chose (null: default size). */
export interface StoredDashboardPin {
  itemType: DashboardPinItemType;
  /** The route path of a page pin, the decimal id of a resource pin, or the id of a widget pin. */
  itemId: string;
  size: DashboardPinSize | null;
}
