// Typed helpers for the plugin's own backend (`/api/reservations/*`) and the few host
// endpoints it needs (resource and group lists). The SDK client supplies the host's API
// origin and the session cookie; its error class drops the machine-readable `code` the
// reservations API returns, so requests go through the client's raw `fetch` here.
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import type {
  Availability,
  IcalFeed,
  IcalFeedSecret,
  IcalSelection,
  ManagedReservationList,
  NamedEntity,
  Reservation,
  ReservationStatus,
  ResourceSettings,
  ResourceSettingsValues,
} from './lib/types';

export const api = createPluginApiClient('/api/reservations');
const hostApi = createPluginApiClient('');

export class ReservationsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly count?: number,
    readonly fieldErrors?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = 'ReservationsApiError';
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;
interface Options {
  method?: string;
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

function withQuery(path: string, query?: Query): string {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

async function call<T>(client: ReturnType<typeof createPluginApiClient>, path: string, options: Options): Promise<T> {
  const response = await client.fetch(withQuery(path, options.query), {
    method: options.method,
    signal: options.signal,
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const body = (parsed ?? {}) as {
      code?: string;
      message?: string | string[];
      count?: number;
      errors?: { field: string; message: string }[];
    };
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new ReservationsApiError(
      message ?? `Request failed (HTTP ${response.status}).`,
      response.status,
      body.code,
      body.count,
      body.errors,
    );
  }
  return parsed as T;
}

const request = <T>(path: string, options: Options = {}) => call<T>(api, path, options);

export const getAvailability = (resourceId: number, from: Date, to: Date, signal?: AbortSignal) =>
  request<Availability>(`/resources/${resourceId}/availability`, {
    query: { from: from.toISOString(), to: to.toISOString() },
    signal,
  });

export const listMine = (scope: 'upcoming' | 'past', status?: ReservationStatus) =>
  request<Reservation[]>('/mine', { query: { scope, status } });

export interface ManageFilter {
  resourceId?: number;
  status?: ReservationStatus;
  from?: string;
  to?: string;
  page: number;
}

export const listManaged = (filter: ManageFilter) =>
  request<ManagedReservationList>('/manage', { query: { ...filter } });

export const getReservation = (id: number) => request<Reservation>(`/${id}`);

export interface CreateReservationInput {
  resourceId: number;
  startTime: string;
  durationMinutes: number;
  note?: string;
}

export const createReservation = (input: CreateReservationInput) =>
  request<Reservation>('', { method: 'POST', body: input });

export type ReservationAction = 'cancel' | 'end-early' | 'keep' | 'approve' | 'reject';

export const reservationAction = (id: number, action: ReservationAction, reason?: string) =>
  request<Reservation>(`/${id}/${action}`, {
    method: 'POST',
    body:
      action === 'cancel' || action === 'approve' || action === 'reject' ? { reason: reason || undefined } : undefined,
  });

export const getPendingDecision = (resourceId: number, signal?: AbortSignal) =>
  request<Reservation | null>(`/resources/${resourceId}/pending-decision`, { signal });

export const getManagerAccess = (resourceId: number) =>
  request<{ isManager: boolean }>(`/resources/${resourceId}/manager-access`);

export const getResourceSettings = (resourceId: number) =>
  request<ResourceSettings>(`/resources/${resourceId}/settings`);

export const getFutureBookingsCount = (resourceId: number) =>
  request<{ count: number }>(`/resources/${resourceId}/settings/future-bookings-count`);

export const updateResourceSettings = (
  resourceId: number,
  values: Partial<ResourceSettingsValues> & { cancelFutureBookings?: boolean },
) =>
  request<{ settings: ResourceSettings; cancelledBookings: number }>(`/resources/${resourceId}/settings`, {
    method: 'PUT',
    body: values,
  });

export interface GlobalSettings {
  timezone: string;
  defaultTimezone: string;
}

export const getGlobalSettings = () => request<GlobalSettings>('/settings/global');
export const updateGlobalSettings = (timezone: string) =>
  request<GlobalSettings>('/settings/global', { method: 'PUT', body: { timezone } });

export const listFeeds = () => request<IcalFeed[]>('/ical/feeds');
export const createFeed = (input: { name: string; selection: IcalSelection }) =>
  request<IcalFeedSecret>('/ical/feeds', { method: 'POST', body: input });
export const updateFeed = (id: number, input: { name?: string; selection?: IcalSelection }) =>
  request<IcalFeed>(`/ical/feeds/${id}`, { method: 'PATCH', body: input });
export const regenerateFeed = (id: number) =>
  request<IcalFeedSecret>(`/ical/feeds/${id}/regenerate`, { method: 'POST' });
export const revokeFeed = (id: number) => request<unknown>(`/ical/feeds/${id}`, { method: 'DELETE' });

// Host endpoints used by the feed form and the manage filter.
export async function searchHostResources(search: string): Promise<NamedEntity[]> {
  const result = await call<{ data: NamedEntity[] }>(hostApi, '/api/resources', {
    query: { limit: 50, page: 1, search },
  });
  return result.data;
}

export const listHostGroups = () => call<NamedEntity[]>(hostApi, '/api/resource-groups', {});
