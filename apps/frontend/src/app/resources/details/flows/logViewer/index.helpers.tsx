import { ResourceFlowNodeDto } from '@attraccess/react-query-client';
import { useEffect } from 'react';
import { useState } from 'react';
// Payloads over the recorder's limit arrive truncated, so they are no longer valid JSON.
export function prettyPayload(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

// Logs are newest-first and a run's oldest entry is the synthetic flow.start, which has
// no node — so the node that triggered the run is the oldest entry that does have one.
export function triggerNodeOfRun<T extends { node?: ResourceFlowNodeDto }>(logsNewestFirst: T[]) {
  return [...logsNewestFirst].reverse().find((log) => log.node)?.node;
}

export function useCountdown(until: Date | string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!until) {
      return;
    }

    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [until]);

  if (!until) {
    return null;
  }

  const remainingSeconds = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
