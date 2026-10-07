import { LiveEnvelope, LivePacket } from '@attraccess/shared';
import { v4 as uuidv4 } from 'uuid';
import { events } from 'fetch-event-stream';
import { Transport } from './live-update-client.types';

interface TransportOwner {
  isCurrent(transport: Transport): boolean;
  expire(): void;
  sync(transport: Transport): Promise<void>;
  ready(): void;
  heartbeat(): void;
  deliver(event: LiveEnvelope, transport: Transport): void;
  reject(subscription: unknown): void;
  reconnect(transport: Transport): void;
}

export async function consumeLiveTransport(origin: string, transport: Transport, owner: TransportOwner): Promise<void> {
  try {
    // eslint-disable-next-line no-restricted-syntax -- Raw multiplexed SSE response.
    const response = await fetch(`${origin}/api/live-updates/${transport.id}/events`, {
      credentials: 'include',
      signal: transport.abort.signal,
    });
    if (!owner.isCurrent(transport)) return;
    if (response.status === 401 || response.status === 403) {
      owner.expire();
      return;
    }
    if (!response.ok) throw new Error(`Live stream returned ${response.status}`);
    for await (const message of events(response, transport.abort.signal)) {
      if (!owner.isCurrent(transport)) return;
      transport.lastPacket = Date.now();
      let packet: LivePacket;
      try {
        packet = JSON.parse(message.data as string);
      } catch {
        continue;
      }
      if (packet.type === 'ready') {
        transport.ready = true;
        await owner.sync(transport);
        if (!owner.isCurrent(transport)) return;
        owner.ready();
      } else if (packet.type === 'heartbeat') {
        // A healthy stream resets the exponential delay; a briefly opened stream does not.
        owner.heartbeat();
      } else if (packet.type === 'event') {
        owner.deliver(packet.event, transport);
      } else if (packet.type === 'rejected') {
        owner.reject(packet.subscription);
        console.warn('[Live updates] Topic rejected:', packet.subscription, packet.reason);
      }
    }
  } catch (error) {
    if (!transport.abort.signal.aborted) console.warn('[Live updates] Stream interrupted:', error);
  } finally {
    owner.reconnect(transport);
  }
}

export function createLiveTransport(): Transport {
  return {
    // uuid falls back to getRandomValues on supported plain-HTTP deployments.
    id: uuidv4(),
    abort: new AbortController(),
    ready: false,
    dirty: true,
    syncing: false,
    revision: 0,
    lastPacket: Date.now(),
  };
}
