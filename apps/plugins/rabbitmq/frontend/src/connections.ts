// Frontend access to the plugin's RabbitMQ connections endpoint (ATT-523).
//
// The backend mounts `GET /rabbitmq/connections/:mqttServerId` and
// `DELETE /rabbitmq/connections/:mqttServerId?name=...` into the host API.
// Types are restated here (separate bundle from backend).
import { useCallback, useEffect, useState } from 'react';

export interface RabbitmqConnection {
  readonly name: string;
  readonly clientId: string | null;
  readonly user: string | null;
  readonly vhost: string | null;
  readonly peerHost: string | null;
  readonly peerPort: number | null;
  readonly protocol: string | null;
  readonly state: string | null;
  readonly ssl: boolean;
  readonly channels: number | null;
  readonly connectedAt: string | null;
  readonly recvBytes: number | null;
  readonly sendBytes: number | null;
  readonly recvRate: number | null;
  readonly sendRate: number | null;
}

export interface RabbitmqConnectionsResult {
  readonly mqttServerId: number;
  readonly ok: boolean;
  readonly connections: RabbitmqConnection[];
  readonly checkedAt: string;
  readonly error: string | null;
}

export interface RabbitmqCloseConnectionResult {
  readonly mqttServerId: number;
  readonly name: string;
  readonly closed: boolean;
  readonly error: string | null;
}

const POLL_INTERVAL_MS = 5_000;

function connectionsEndpoint(mqttServerId: number): string {
  return `/api/rabbitmq/connections/${mqttServerId}`;
}

async function fetchConnections(mqttServerId: number): Promise<RabbitmqConnectionsResult> {
  const res = await fetch(connectionsEndpoint(mqttServerId), { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as RabbitmqConnectionsResult;
}

async function closeConnection(mqttServerId: number, name: string): Promise<RabbitmqCloseConnectionResult> {
  const url = `${connectionsEndpoint(mqttServerId)}?name=${encodeURIComponent(name)}`;
  const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as RabbitmqCloseConnectionResult;
}

export interface UseConnectionsState {
  result: RabbitmqConnectionsResult | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  close: (name: string) => Promise<RabbitmqCloseConnectionResult>;
  closing: string | null;
}

interface Entry {
  result: RabbitmqConnectionsResult | null;
  loading: boolean;
  error: string | null;
  inFlight: Promise<void> | null;
  closing: string | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  subscriberCount: number;
}

const store = new Map<number, Entry>();
const subscribers = new Map<number, Set<() => void>>();

const EMPTY_ENTRY: Entry = {
  result: null,
  loading: true,
  error: null,
  inFlight: null,
  closing: null,
  pollTimer: null,
  subscriberCount: 0,
};

function notify(mqttServerId: number): void {
  subscribers.get(mqttServerId)?.forEach((fn) => fn());
}

function getEntry(mqttServerId: number): Entry {
  let entry = store.get(mqttServerId);
  if (!entry) {
    entry = { ...EMPTY_ENTRY };
    store.set(mqttServerId, entry);
  }
  return entry;
}

function ensurePollTimer(mqttServerId: number): void {
  const entry = getEntry(mqttServerId);
  if (entry.pollTimer) {
    return;
  }
  entry.pollTimer = setInterval(() => load(mqttServerId, false), POLL_INTERVAL_MS);
}

function clearPollTimer(mqttServerId: number): void {
  const entry = store.get(mqttServerId);
  if (!entry?.pollTimer) {
    return;
  }
  clearInterval(entry.pollTimer);
  entry.pollTimer = null;
}

function load(mqttServerId: number, force: boolean): void {
  const entry = getEntry(mqttServerId);
  if (entry.inFlight) {
    if (!force) {
      return;
    }
  }

  entry.loading = true;
  entry.error = null;
  notify(mqttServerId);

  entry.inFlight = fetchConnections(mqttServerId)
    .then((data) => {
      entry.result = data;
      entry.error = null;
    })
    .catch((err: Error) => {
      entry.error = err.message;
    })
    .finally(() => {
      entry.loading = false;
      entry.inFlight = null;
      notify(mqttServerId);
    });
}

function subscribe(mqttServerId: number, rerender: () => void): () => void {
  let set = subscribers.get(mqttServerId);
  if (!set) {
    set = new Set();
    subscribers.set(mqttServerId, set);
  }
  set.add(rerender);

  const entry = getEntry(mqttServerId);
  entry.subscriberCount += 1;
  ensurePollTimer(mqttServerId);
  load(mqttServerId, false);

  return () => {
    set?.delete(rerender);
    if (set && set.size === 0) {
      subscribers.delete(mqttServerId);
    }
    entry.subscriberCount -= 1;
    if (entry.subscriberCount <= 0) {
      entry.subscriberCount = 0;
      clearPollTimer(mqttServerId);
    }
  };
}

export function useConnections(mqttServerId: number): UseConnectionsState {
  const [, forceRender] = useState(0);

  useEffect(() => subscribe(mqttServerId, () => forceRender((n) => n + 1)), [mqttServerId]);

  const refresh = useCallback(() => load(mqttServerId, true), [mqttServerId]);

  const close = useCallback(
    async (name: string): Promise<RabbitmqCloseConnectionResult> => {
      const entry = getEntry(mqttServerId);
      entry.closing = name;
      notify(mqttServerId);
      try {
        const result = await closeConnection(mqttServerId, name);
        if (result.closed) {
          load(mqttServerId, true);
        }
        return result;
      } finally {
        entry.closing = null;
        notify(mqttServerId);
      }
    },
    [mqttServerId]
  );

  const entry = store.get(mqttServerId) ?? EMPTY_ENTRY;
  return {
    result: entry.result,
    loading: entry.loading,
    error: entry.error,
    refresh,
    close,
    closing: entry.closing,
  };
}
