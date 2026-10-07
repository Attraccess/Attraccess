import { afterEach, beforeEach, vi } from 'vitest';
import { LiveUpdateClient } from './live-update-client';
import { LivePacket, LiveSubscription } from '@attraccess/shared';

export function stream(signal?: AbortSignal, url?: string) {
  const encoder = new TextEncoder();
  let ended = false;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    signal,
    url,
    response: new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    send: (packet: LivePacket) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(packet)}\n\n`)),
    end: () => {
      if (!ended) {
        ended = true;
        controller.close();
      }
    },
  };
}

export const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

export function useLiveClientFixture() {
  let client: LiveUpdateClient;
  let streams: ReturnType<typeof stream>[];
  let controls: { subscriptions: LiveSubscription[]; present: boolean }[];
  let expired: ReturnType<typeof vi.fn<() => void>>;
  let recovered: ReturnType<typeof vi.fn<() => void>>;
  beforeEach(() => {
    vi.useFakeTimers();
    streams = [];
    controls = [];
    expired = vi.fn();
    recovered = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (init.method === 'PUT') {
          controls.push(JSON.parse(init.body as string));
          return new Response(null, { status: 204 });
        }
        const next = stream(init.signal ?? undefined, url);
        streams.push(next);
        init.signal?.addEventListener('abort', () => next.end(), { once: true });
        return next.response;
      }),
    );
    client = new LiveUpdateClient('http://test', expired, recovered);
  });
  afterEach(() => {
    client.dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  return {
    get client() {
      return client;
    },
    get streams() {
      return streams;
    },
    get controls() {
      return controls;
    },
    get expired() {
      return expired;
    },
    get recovered() {
      return recovered;
    },
  };
}
