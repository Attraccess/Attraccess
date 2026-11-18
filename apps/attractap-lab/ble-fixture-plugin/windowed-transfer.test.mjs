import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_WINDOW, checkAck, clampWindow, percentile, windowedTransfer } from './windowed-transfer.mjs';

const ack = (bytes, sequence) => {
  const out = Buffer.alloc(8);
  out.writeUInt32LE(bytes, 0);
  out.writeUInt32LE(sequence, 4);
  return out;
};

// The test peripheral in echo mode: every written chunk is acked a little later (or at once with `sync`), in order.
// `mangle` rewrites an ack, `dropAt` loses one: the next ack wait then times out like the SDK's `next`.
function peripheral({ chunk, mangle = (value) => value, failWriteAt = 0, sync = false, dropAt = 0 } = {}) {
  const acks = [];
  const waiters = [];
  let received = 0;
  let inFlight = 0;
  const device = {
    maxInFlight: 0,
    async write(value) {
      assert.equal(value.length, chunk);
      received += 1;
      if (received === failWriteAt) throw new Error('write failed');
      inFlight += 1;
      device.maxInFlight = Math.max(device.maxInFlight, inFlight);
      const sequence = received;
      const deliver = () => {
        inFlight -= 1;
        if (sequence === dropAt) return;
        const value = mangle(ack(sequence * chunk, sequence), sequence);
        const waiter = waiters.shift();
        if (waiter) waiter.resolve(value);
        else acks.push(value);
      };
      if (sync) deliver();
      else setImmediate(deliver);
    },
    nextAck(signal) {
      if (acks.length) return Promise.resolve(acks.shift());
      return new Promise((resolve, reject) => {
        const timer = dropAt ? setTimeout(() => leave(new Error('TIMEOUT')), 20) : undefined;
        const leave = (error) => {
          clearTimeout(timer);
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(error);
        };
        const waiter = {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
        };
        waiters.push(waiter);
        signal.addEventListener('abort', () => leave(new Error('aborted')), { once: true });
      });
    },
    get waiting() {
      return waiters.length;
    },
  };
  return device;
}

test('a transfer keeps at most `window` chunks unacknowledged and counts every ack', async () => {
  for (const window of [1, 4, 8]) {
    const device = peripheral({ chunk: 16 });
    const result = await windowedTransfer({ chunk: 16, bytes: 16 * 40, window, ...device });
    assert.equal(device.maxInFlight, window);
    assert.equal(result.window, window);
    assert.equal(result.chunks, 40);
    assert.equal(result.acked, 40);
    assert.equal(result.bytes, 640);
    assert.ok(result.ackMedianMs !== null && result.ackP95Ms >= result.ackMedianMs);
  }
});

test('the window defaults to 1 and stays within 1..MAX_WINDOW', () => {
  assert.equal(clampWindow(undefined), 1);
  assert.equal(clampWindow('8'), 8);
  assert.equal(clampWindow(0), 1);
  assert.equal(clampWindow(-3), 1);
  assert.equal(clampWindow('x'), 1);
  assert.equal(clampWindow(1000), MAX_WINDOW);
});

test('an ack out of order or with a wrong byte count fails the transfer', async () => {
  const swapped = peripheral({ chunk: 8, mangle: (value, sequence) => (sequence === 3 ? ack(24, 4) : value) });
  await assert.rejects(
    windowedTransfer({ chunk: 8, bytes: 80, window: 4, ...swapped }),
    /ack 4 out of order, expected 3/,
  );
  const short = peripheral({ chunk: 8, mangle: (value, sequence) => (sequence === 2 ? ack(9, 2) : value) });
  await assert.rejects(windowedTransfer({ chunk: 8, bytes: 80, ...short }), /ack 2 counts 9 bytes, expected 16/);
});

test('a failed write ends the transfer and stops waiting for acks', async () => {
  const device = peripheral({ chunk: 8, failWriteAt: 3 });
  await assert.rejects(windowedTransfer({ chunk: 8, bytes: 80, window: 8, ...device }), /write failed/);
  assert.equal(device.waiting, 0);
});

test('acks that arrive before the last write resolves end the transfer at once', async () => {
  const device = peripheral({ chunk: 8, sync: true });
  const result = await windowedTransfer({ chunk: 8, bytes: 80, window: 4, ...device });
  assert.equal(result.acked, 10);
  assert.equal(device.waiting, 0);
});

test('a lost ack fails the transfer with the wait error instead of hanging', async () => {
  for (const [window, dropAt] of [
    [1, 5],
    [8, 10],
  ]) {
    const device = peripheral({ chunk: 8, dropAt });
    await assert.rejects(windowedTransfer({ chunk: 8, bytes: 80, window, ...device }), /TIMEOUT/);
  }
});

test('the report measures throughput and ack latency on the given clock', async () => {
  let clock = 0;
  const device = peripheral({ chunk: 1024 });
  // Every write takes 100 ms; its ack is read 100 ms later at window 1.
  const result = await windowedTransfer({
    chunk: 1024,
    bytes: 4 * 1024,
    write: async (value) => {
      clock += 100;
      await device.write(value);
    },
    nextAck: async (signal) => {
      const value = await device.nextAck(signal);
      clock += 100;
      return value;
    },
    now: () => clock,
  });
  assert.equal(result.seconds, 0.8);
  assert.equal(result.kibPerSecond, 5);
  assert.equal(result.ackMedianMs, 200);
  assert.equal(result.ackP95Ms, 200);
});

test('a minimum duration keeps the transfer going past its byte count', async () => {
  let clock = 0;
  const device = peripheral({ chunk: 8 });
  const now = () => (clock += 10);
  const result = await windowedTransfer({ chunk: 8, bytes: 8, minDurationMs: 200, now, ...device });
  assert.ok(result.chunks > 1);
  assert.equal(result.acked, result.chunks);
});

test('checkAck and percentile', () => {
  assert.doesNotThrow(() => checkAck(ack(512, 1), 1, 512));
  assert.throws(() => checkAck(ack(512, 2), 1, 512), /out of order/);
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2);
  assert.equal(percentile([1, 2, 3, 4], 0.95), 4);
});
