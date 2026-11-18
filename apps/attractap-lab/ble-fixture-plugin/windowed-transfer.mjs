// Windowed bulk transfer of the BLE lab fixture plugin (plugin.ts, `transfer` step). Free of Nest and the plugin
// SDK, so node:test covers it (windowed-transfer.test.mjs).

/** Unacknowledged chunks a transfer may keep in flight (the test peripheral queues up to 64 acks). */
export const MAX_WINDOW = 32;

/** The requested window as 1..MAX_WINDOW (default 1). */
export function clampWindow(value) {
  const window = Math.trunc(Number(value ?? 1)) || 1;
  return Math.min(Math.max(window, 1), MAX_WINDOW);
}

/** The value at `fraction` of an ascending list (nearest rank); null when it is empty. */
export function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

/** Checks one ack of the test peripheral's echo mode: `u32` running byte count + `u32` chunk sequence (LE). */
export function checkAck(ack, sequence, bytes) {
  const view = Buffer.from(ack);
  const got = view.readUInt32LE(4);
  if (got !== sequence) throw new Error(`ack ${got} out of order, expected ${sequence}`);
  const counted = view.readUInt32LE(0);
  if (counted !== bytes) throw new Error(`ack ${got} counts ${counted} bytes, expected ${bytes}`);
}

// Reads acks as they arrive, so their latency is not inflated while the writer waits for a write slot.
async function receiveAcks(state, { chunk, nextAck, now, signal }) {
  try {
    while (state.writing || state.acked < state.chunks) {
      const ack = await nextAck(signal);
      checkAck(ack, state.acked + 1, (state.acked + 1) * chunk);
      state.latencies.push(now() - state.sentAt[state.acked]);
      state.acked += 1;
      state.freed?.();
    }
  } catch (error) {
    // The writer stopped it after the last ack: not a failure.
    if (state.writing || state.acked < state.chunks) throw error;
  }
}

async function windowSlot(state, window, receiver) {
  while (state.chunks - state.acked >= window) {
    await Promise.race([new Promise((resolve) => (state.freed = resolve)), receiver]);
  }
}

/**
 * Writes `chunk`-byte chunks until `bytes` are sent and `minDurationMs` passed, with at most `window` of them
 * unacknowledged. `write(value)` sends one chunk; `nextAck(signal)` resolves with the next ack's bytes. Acks must
 * arrive in order and count every byte, otherwise the transfer rejects.
 */
export async function windowedTransfer({ chunk, bytes, window, minDurationMs = 0, write, nextAck, now = Date.now }) {
  const inFlight = clampWindow(window);
  const state = { chunks: 0, acked: 0, writing: true, sentAt: [], latencies: [], freed: undefined };
  const stop = new AbortController();
  const startedAt = now();
  const receiver = receiveAcks(state, { chunk, nextAck, now, signal: stop.signal });
  receiver.catch(() => undefined);
  try {
    while (state.chunks * chunk < bytes || now() - startedAt < minDurationMs) {
      await windowSlot(state, inFlight, receiver);
      state.sentAt[state.chunks] = now();
      await write(new Uint8Array(chunk).fill(state.chunks & 0xff));
      state.chunks += 1;
    }
  } catch (error) {
    stop.abort();
    throw error;
  }
  state.writing = false;
  if (state.acked === state.chunks) stop.abort();
  await receiver;
  const seconds = (now() - startedAt) / 1000;
  const sent = state.chunks * chunk;
  state.latencies.sort((a, b) => a - b);
  return {
    window: inFlight,
    chunks: state.chunks,
    acked: state.acked,
    bytes: sent,
    seconds,
    kibPerSecond: sent / 1024 / seconds,
    ackMedianMs: percentile(state.latencies, 0.5),
    ackP95Ms: percentile(state.latencies, 0.95),
  };
}
