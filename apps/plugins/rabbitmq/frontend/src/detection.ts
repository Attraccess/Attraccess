// Frontend access to the plugin's RabbitMQ detection endpoint (ATT-521).
//
// The backend half (apps/plugins/rabbitmq/backend) mounts
// `GET /rabbitmq/detection/:mqttServerId` into the host API. We read it from the
// MQTT slot contributions to decide what to render. The result shape is
// restated here (the backend and frontend are separate bundles with no shared
// module), mirroring backend/rabbitmq-detection.types.ts.
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

// Host mounts plugin controllers under `/api`; cookies carry the session.
function detectionEndpoint(mqttServerId: number, refresh: boolean): string {
  const base = `/api/rabbitmq/detection/${mqttServerId}`;
  return refresh ? `${base}?refresh=true` : base;
}

async function fetchDetection(mqttServerId: number, refresh: boolean): Promise<RabbitmqDetectionResult> {
  const res = await fetch(detectionEndpoint(mqttServerId, refresh), { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as RabbitmqDetectionResult;
}

export interface UseDetectionState {
  result: RabbitmqDetectionResult | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// Loads detection for one MQTT server and re-loads on demand. Both MQTT slots
// (per-row badge + detail panel) share this so each renders from the same
// verdict the backend caches.
export function useDetection(mqttServerId: number): UseDetectionState {
  const [result, setResult] = useState<RabbitmqDetectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (refresh: boolean) => {
      let cancelled = false;
      setLoading(true);
      setError(null);
      fetchDetection(mqttServerId, refresh)
        .then((data) => {
          if (!cancelled) setResult(data);
        })
        .catch((err: Error) => {
          if (!cancelled) setError(err.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    },
    [mqttServerId]
  );

  useEffect(() => load(false), [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { result, loading, error, refresh };
}
