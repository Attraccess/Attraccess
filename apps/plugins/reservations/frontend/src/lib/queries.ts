import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import {
  getAvailability,
  getGlobalSettings,
  getManagerAccess,
  getPendingDecision,
  getReservation,
  listFeeds,
  listManaged,
  listMine,
  type ManageFilter,
} from '../api';
import type { ReservationStatus } from './types';

export const ROOT_KEY = 'reservations';

export const keys = {
  availability: (resourceId: number, from: string, to: string) => [ROOT_KEY, 'availability', resourceId, from, to],
  pending: (resourceId: number) => [ROOT_KEY, 'pending-decision', resourceId],
  mine: (scope: string, status?: string) => [ROOT_KEY, 'mine', scope, status ?? 'all'],
  managed: (filter: ManageFilter) => [ROOT_KEY, 'managed', filter],
  reservation: (id: number) => [ROOT_KEY, 'reservation', id],
  feeds: () => [ROOT_KEY, 'feeds'],
  managerAccess: (resourceId: number) => [ROOT_KEY, 'manager-access', resourceId],
};

/** Refreshes every reservation-related query after a change. */
export function useInvalidateReservations() {
  const client = useQueryClient();
  return useCallback(() => client.invalidateQueries({ queryKey: [ROOT_KEY] }), [client]);
}

export function useAvailability(resourceId: number, from: Date, to: Date, enabled = true) {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  return useQuery({
    queryKey: keys.availability(resourceId, fromIso, toIso),
    queryFn: ({ signal }) => getAvailability(resourceId, new Date(fromIso), new Date(toIso), signal),
    staleTime: 15_000,
    retry: false,
    enabled,
  });
}

/**
 * The keep-or-free question after the holder's session ended during an active booking. Light by
 * design: one tiny GET every 10 s, only while the tab is visible, plus a refetch on focus.
 */
export function usePendingDecision(resourceId: number, enabled: boolean) {
  return useQuery({
    queryKey: keys.pending(resourceId),
    queryFn: ({ signal }) => getPendingDecision(resourceId, signal),
    enabled,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
    retry: false,
  });
}

export function useMyReservations(scope: 'upcoming' | 'past', status?: ReservationStatus) {
  return useQuery({ queryKey: keys.mine(scope, status), queryFn: () => listMine(scope, status), retry: false });
}

export function useManagedReservations(filter: ManageFilter) {
  const stable = useMemo(() => filter, [filter]);
  return useQuery({
    queryKey: keys.managed(stable),
    queryFn: () => listManaged(stable),
    retry: false,
    placeholderData: (previous) => previous,
  });
}

export function useReservation(id: number) {
  return useQuery({ queryKey: keys.reservation(id), queryFn: () => getReservation(id), retry: false });
}

export function useFeeds() {
  return useQuery({ queryKey: keys.feeds(), queryFn: listFeeds, retry: false });
}

export function useManagerAccess(resourceId: number) {
  return useQuery({
    queryKey: keys.managerAccess(resourceId),
    queryFn: () => getManagerAccess(resourceId),
    staleTime: 60_000,
    retry: false,
  });
}

/** The plugin timezone for pages that list reservations without an availability payload. */
export function usePluginTimezone(): string | null {
  const query = useQuery({
    queryKey: [ROOT_KEY, 'global-settings'],
    queryFn: getGlobalSettings,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return query.data?.timezone ?? null;
}

/** True when the user may manage reservations of at least one resource (the manage list answers 403 otherwise). */
export function useIsManagerAnywhere(): boolean {
  const query = useQuery({
    queryKey: [ROOT_KEY, 'is-manager'],
    queryFn: () => listManaged({ page: 1 }).then(() => true),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return query.data === true;
}
