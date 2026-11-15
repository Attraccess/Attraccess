import { createContext } from 'react';
import type { DashboardPinItemDto } from '@attraccess/react-query-client';

/** Lets a page pin something other than its path, such as a resource on its detail page. */
export const DashboardPinTargetContext = createContext<DashboardPinItemDto | null>(null);

export function resourcePinTarget(resourceId: number): DashboardPinItemDto {
  // The string literal equals DashboardPinItemType.RESOURCE; a type-only import keeps this module a leaf.
  return { itemType: 'resource' as DashboardPinItemDto['itemType'], itemId: String(resourceId) };
}
