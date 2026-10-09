// Frontend access to the plugin's RabbitMQ detection endpoint (ATT-521).
//
// The backend half (apps/plugins/rabbitmq/backend) mounts
// `GET /rabbitmq/detection/:mqttServerId` into the host API. We read it from the
// MQTT slot contributions to decide what to render. The result shape is
// restated here (the backend and frontend are separate bundles with no shared
// module), mirroring backend/rabbitmq-detection.types.ts.
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import { useCallback, useEffect, useState } from 'react';

export interface RabbitmqDetectionResult {
  mqttServerId: number;
  isRabbitMQ: boolean;
  reachable: boolean;
  authOk: boolean;
  rabbitmqVersion: string | null;
  managementVersion: string | null;
  managementApi: string;
  checkedAt: string;
  error: string | null;
}

// Host mounts plugin controllers under `/api`; the SDK client supplies the
// origin, session cookie and JSON/error handling.
const api = createPluginApiClient('/api/rabbitmq/detection');

function fetchDetection(mqttServerId: number, refresh: boolean): Promise<RabbitmqDetectionResult> {
  return api.request<RabbitmqDetectionResult>(`/${mqttServerId}`, {
    query: { refresh: refresh ? 'true' : undefined },
  });
}

export interface UseDetectionState {
  result: RabbitmqDetectionResult | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// Module-level, per-server detection store shared across every mounted
// component. Both MQTT slots (per-row badge + detail panel) render the same
// server, so without this they would each fire their own request; sharing one
// entry per id dedupes the in-flight fetch and keeps a short client cache.
// State lives outside React, so a fetch resolving after a component unmounts
// just updates the store and notifies whatever is still subscribed — there is
// no setState-on-unmounted-component path.
interface Entry {
  result: RabbitmqDetectionResult | null;
  loading: boolean;
  error: string | null;
  inFlight: Promise<void> | null;
  expiresAt: number;
}

// Mirrors the backend's detection cache window so the frontend doesn't re-probe
// more eagerly than the server refreshes.
const CACHE_TTL_MS = 60_000;

const EMPTY_ENTRY: Entry = { result: null, loading: true, error: null, inFlight: null, expiresAt: 0 };

const store = new Map<number, Entry>();
const subscribers = new Map<number, Set<() => void>>();

function now(): number {
  return Date.now();
}

function notify(mqttServerId: number): void {
  subscribers.get(mqttServerId)?.forEach((fn) => fn());
}

// Kicks off a load for one server unless a fresh result or an in-flight request
// already covers it. `refresh` bypasses the client cache (the backend probe
// honours `?refresh=true`).
function ensureLoaded(mqttServerId: number, refresh: boolean): void {
  const current = store.get(mqttServerId);
  if (current?.inFlight) {
    return;
  }
  if (!refresh && current?.result && current.expiresAt > now()) {
    return;
  }

  const entry: Entry = {
    result: current?.result ?? null,
    loading: true,
    error: null,
    inFlight: null,
    expiresAt: current?.expiresAt ?? 0,
  };
  entry.inFlight = fetchDetection(mqttServerId, refresh)
    .then((data) => {
      entry.result = data;
      entry.error = null;
      entry.expiresAt = now() + CACHE_TTL_MS;
    })
    .catch((err: Error) => {
      entry.error = err.message;
    })
    .finally(() => {
      entry.loading = false;
      entry.inFlight = null;
      notify(mqttServerId);
    });
  store.set(mqttServerId, entry);
  notify(mqttServerId);
}

// Subscribes to the shared store for one server and triggers the initial load.
// Returns the current entry's view plus a `refresh` that bypasses the cache.
export function useDetection(mqttServerId: number): UseDetectionState {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const rerender = () => forceRender((n) => n + 1);
    let set = subscribers.get(mqttServerId);
    if (!set) {
      set = new Set();
      subscribers.set(mqttServerId, set);
    }
    set.add(rerender);

    ensureLoaded(mqttServerId, false);

    return () => {
      set?.delete(rerender);
      if (set && set.size === 0) {
        subscribers.delete(mqttServerId);
      }
    };
  }, [mqttServerId]);

  const refresh = useCallback(() => ensureLoaded(mqttServerId, true), [mqttServerId]);

  const entry = store.get(mqttServerId) ?? EMPTY_ENTRY;
  return { result: entry.result, loading: entry.loading, error: entry.error, refresh };
}
