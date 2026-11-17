import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_WINDOW, checkAck, clampWindow, percentile, windowedTransfer } from './windowed-transfer.mjs';

const ack = (bytes, sequence) => {
  const out = Buffer.alloc(8);
  out.writeUInt32LE(bytes, 0);
  out.writeUInt32LE(sequence, 4);
  return out;
};

// The test peripheral in echo mode: every written chunk is acked a little later, in order. `mangle` rewrites an ack.
function peripheral({ chunk, mangle = (value) => value, failWriteAt = 0 } = {}) {
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
      setImmediate(() => {
        inFlight -= 1;
        const value = mangle(ack(sequence * chunk, sequence), sequence);
        const waiter = waiters.shift();
        if (waiter) waiter.resolve(value);
        else acks.push(value);
      });
    },
    nextAck(signal) {
      if (acks.length) return Promise.resolve(acks.shift());
      return new Promise((resolve, reject) => {
        const waiter = { resolve };
        waiters.push(waiter);
        signal.addEventListener('abort', () => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(new Error('aborted'));
        });
      });
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
