import { performance } from 'node:perf_hooks';
import { EmulatedCard } from '../card-crypto/card-emulator.test-fixture';
import { CARD_CONVERSATION_LIMITS } from './card-conversation.service';
import { createRelayReader, createServices } from './card-relay.test-fixture';

/**
 * Sized for 1,000 readers with 250 tapping at once. Every tap is a real card conversation: card
 * type detection, EV2 authentication with the stored key, over a network with a round trip of
 * `2 * LATENCY_MS`. The numbers print so the limits can be tuned from a measurement.
 */
const READERS = 1000;
const LATENCY_MS = 15;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];
}

async function tapAll(taps: number) {
  const { cards, conversations, operations, user } = createServices();
  const readers = Array.from({ length: READERS }, (_, index) => {
    const kind = index % 2 === 0 ? 'desfire' : 'ntag424';
    const card = new EmulatedCard(kind);
    const key = Buffer.alloc(16, (index % 250) + 1);
    card.keys[1] = key;
    card.keyVersions[1] = 1;
    card.appExists = true;
    const uid = `04${index.toString(16).padStart(12, '0')}`;
    cards.push({ id: index + 1, uid, keyNo: 1, key: key.toString('hex'), isActive: true, user });
    return { uid, reader: createRelayReader(card, conversations, LATENCY_MS) };
  });

  const started = performance.now();
  const results = await Promise.all(
    readers.slice(0, taps).map(async ({ uid, reader }) => {
      const begin = performance.now();
      const outcome = await operations.verifyCard(reader.socket, 'tap', uid);
      return { outcome, ms: performance.now() - begin, exchanges: reader.apdus().length };
    }),
  );
  const wall = performance.now() - started;
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
  return { results, latencies, wall, conversations };
}

describe('load: 1,000 readers', () => {
  jest.setTimeout(120_000);

  it('verifies 250 simultaneous taps without a single refusal', async () => {
    const { results, latencies, wall, conversations } = await tapAll(250);

    // eslint-disable-next-line no-console
    console.log(
      `250 simultaneous taps (${2 * LATENCY_MS} ms round trip): p50 ${percentile(latencies, 50).toFixed(0)} ms, ` +
        `p95 ${percentile(latencies, 95).toFixed(0)} ms, max ${(latencies.at(-1) ?? 0).toFixed(0)} ms, ` +
        `all done in ${wall.toFixed(0)} ms, ${Math.max(...results.map((r) => r.exchanges))} exchanges per tap`,
    );
    expect(results.filter((r) => r.outcome.ok)).toHaveLength(250);
    expect(results.filter((r) => r.outcome.error === 'BUSY')).toHaveLength(0);
    expect(Math.max(...results.map((r) => r.exchanges))).toBeLessThanOrEqual(CARD_CONVERSATION_LIMITS.maxExchanges);
    expect(conversations.activeConversations).toBe(0);
    // A tap is a handful of round trips; even with 250 at once it must stay well under the
    // per-conversation limit.
    expect(percentile(latencies, 95)).toBeLessThan(CARD_CONVERSATION_LIMITS.conversationTimeoutMs / 3);
  });

  it('answers "busy" beyond the server-wide limit and recovers', async () => {
    const taps = CARD_CONVERSATION_LIMITS.maxConcurrent + 100;
    const { results, conversations } = await tapAll(taps);

    const busy = results.filter((r) => r.outcome.error === 'BUSY').length;
    expect(busy).toBeGreaterThanOrEqual(100);
    expect(results.filter((r) => r.outcome.ok).length + busy).toBe(taps);
    expect(conversations.activeConversations).toBe(0);
  });
});
