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
export const widgetPin = (id: string): DashboardPinItem => ({ itemType: DashboardPinItemType.WIDGET, itemId: id });

/** The user's pins, shared by the dashboard, the landing page and every pin toggle through one query. */
export function useDashboardPins() {
  // A failed load stays failed until the user retries: the landing page swaps components on error, and a new
  // observer retrying on mount would put it back into loading over and over. Every change writes its answer into
  // the cache, so the list only goes stale through another tab or a deleted resource: no refetch per page change.
  return useDashboardServiceDashboardGetPins(undefined, { retryOnMount: false, staleTime: 60_000 });
}

export function useSetDashboardPinsCache() {
  const queryClient = useQueryClient();
  return (pins: DashboardPin[]) => queryClient.setQueryData(UseDashboardServiceDashboardGetPinsKeyFn(), pins);
}

const UPDATE_PINS_KEY = ['dashboardUpdatePins'];

/** Changes one pin. The answer is the stored list, which replaces the cached one. */
export function useUpdateDashboardPins() {
  const queryClient = useQueryClient();
  const setPins = useSetDashboardPinsCache();
  return useDashboardServiceDashboardUpdatePins({
    mutationKey: UPDATE_PINS_KEY,
    // One request at a time, in the order they were made, so a late answer never replaces a newer list.
    scope: { id: 'dashboard-pins' },
    onSuccess: async (pins) => {
      // While later changes still wait in the queue, this answer predates them and would undo their optimistic
      // order on screen; the last answer brings the full stored list.
      if (queryClient.isMutating({ mutationKey: UPDATE_PINS_KEY }) > 1) return;
      // A fetch sent before this change was saved must not overwrite its answer.
      await queryClient.cancelQueries({ queryKey: UseDashboardServiceDashboardGetPinsKeyFn() });
      setPins(pins);
    },
    // A failed change leaves the cache unsure (an optimistic order, or a skipped answer above): reload the stored list.
    onError: () => queryClient.invalidateQueries({ queryKey: UseDashboardServiceDashboardGetPinsKeyFn() }),
  });
}

/** Stops a refetch in flight from replacing an order the user just set. */
export function useCancelDashboardPinsFetch() {
  const queryClient = useQueryClient();
  return () => queryClient.cancelQueries({ queryKey: UseDashboardServiceDashboardGetPinsKeyFn() });
}
