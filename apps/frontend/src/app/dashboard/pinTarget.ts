import { createContext } from 'react';
import { DashboardPinItemDto, DashboardPinItemType } from '@attraccess/react-query-client';

/** Lets a page pin something other than its path, such as a resource on its detail page. */
export const DashboardPinTargetContext = createContext<DashboardPinItemDto | null>(null);

export function resourcePinTarget(resourceId: number): DashboardPinItemDto {
  return { itemType: DashboardPinItemType.RESOURCE, itemId: String(resourceId) };
}
