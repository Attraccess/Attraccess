import { useQueryClient } from '@tanstack/react-query';
import {
  DashboardPinDto,
  DashboardPinItemDto,
  DashboardPinItemType,
  useDashboardServiceDashboardGetPins,
  UseDashboardServiceDashboardGetPinsKeyFn,
  useDashboardServiceDashboardUpdatePins,
} from '@attraccess/react-query-client';

export type DashboardPin = DashboardPinDto;
export type DashboardPinItem = DashboardPinItemDto;

export const pinKey = (item: DashboardPinItem) => `${item.itemType}:${item.itemId}`;
export const pagePin = (path: string): DashboardPinItem => ({ itemType: DashboardPinItemType.PAGE, itemId: path });

/** The user's pins, shared by the dashboard, the landing page and every pin toggle through one query. */
export function useDashboardPins() {
  // A failed load stays failed until the user retries: the landing page swaps components on error, and a new
  // observer retrying on mount would put it back into loading over and over.
  return useDashboardServiceDashboardGetPins(undefined, { retryOnMount: false });
}

export function useSetDashboardPinsCache() {
  const queryClient = useQueryClient();
  return (pins: DashboardPin[]) => queryClient.setQueryData(UseDashboardServiceDashboardGetPinsKeyFn(), pins);
}

/** Changes one pin. The answer is the stored list, which replaces the cached one. */
export function useUpdateDashboardPins() {
  const setPins = useSetDashboardPinsCache();
  return useDashboardServiceDashboardUpdatePins({
    // One request at a time, in the order they were made, so a late answer never replaces a newer list.
    scope: { id: 'dashboard-pins' },
    onSuccess: setPins,
  });
}
