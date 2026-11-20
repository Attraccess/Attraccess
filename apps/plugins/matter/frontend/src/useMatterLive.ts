import { usePluginLiveUpdates } from '@attraccess/plugins-frontend-sdk';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDocumentVisible } from './useDocumentVisible';

/** While the live topic is unavailable the data is refreshed by polling at this interval. */
export const LIVE_FALLBACK_POLL_MS = 15_000;

/**
 * Follows a live topic of this plugin and keeps `refetch` in step. A signal ("something changed") refetches through
 * REST, so the read is authorized again; a reconnect refetches because signals may have been missed; when the topic is
 * unavailable (rejected, or the transport is down) the data is flagged as possibly stale and polled until the topic
 * works again; that polling pauses while the browser tab is hidden and refetches once when it is visible again.
 * Returns that flag.
 *
 * The SDK only reports a topic as unavailable when the host has a live-updates client. Every host this plugin runs on
 * has one (`plugin.json` requires Attraccess 2.0.0 or later), so there is no separate fallback for a host without it.
 */
export function useMatterLive(options: {
  topic: 'devices' | 'device-state';
  identifier?: string;
  enabled: boolean;
  refetch: () => unknown;
}): { stale: boolean } {
  const { topic, identifier, enabled, refetch } = options;
  const [stale, setStale] = useState(false);
  const latest = useRef(refetch);
  latest.current = refetch;

  const changed = useCallback(() => {
    setStale(false);
    void latest.current();
  }, []);

  const visible = useDocumentVisible();

  usePluginLiveUpdates({
    plugin: 'matter',
    topic,
    identifier,
    enabled,
    onUpdate: changed,
    onReconnect: changed,
    onUnavailable: () => setStale(true),
  });

  const resumed = useRef(false);
  useEffect(() => {
    if (!enabled || !stale) return;
    if (!visible) {
      resumed.current = true;
      return;
    }
    // Back from a hidden tab: the data missed the polls in between.
    if (resumed.current) void latest.current();
    resumed.current = false;
    const timer = setInterval(() => void latest.current(), LIVE_FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, stale, visible]);

  return { stale };
}
