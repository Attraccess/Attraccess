import { WagoDiagnosticsStore, freshness } from './diagnostics-store';
import { safeValidationSummaries } from './diagnostics-validation';

describe('canonical diagnostic consumer', () => {
  let now: number;
  let store: WagoDiagnosticsStore;
  const stream = (index = 1) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  const hash = 'a'.repeat(64);
  const envelope = (sequence: number, index = 1, timestamp = now) => ({
    timestamp: new Date(timestamp).toISOString(),
    streamId: stream(index),
    sequence,
  });
  const send = (kind: string, value: unknown) => store.ingest(1, kind, Buffer.from(JSON.stringify(value)));
  const state = (sequence = 1, index = 1, extra: Record<string, unknown> = {}) =>
    send('state', {
      connected: true,
      revision: 2,
      contentHash: hash,
      inputs: { door: true },
      outputs: { relay: false },
      ...envelope(sequence, index),
      ...extra,
    });
  const measurement = (sequence = 1, extra: Record<string, unknown> = {}) =>
    send('measurements', {
      channelId: 'meter',
      kind: 'live',
      unit: 'milliwatt',
      value: 500,
      ...envelope(sequence),
      ...extra,
    });
  beforeEach(() => {
    now = Date.parse('2026-09-05T12:00:00Z');
    store = new WagoDiagnosticsStore(() => now);
  });
  it('keeps validated boolean inputs separate from outputs and preserves canonical integer measurements', () => {
    expect(state()).toBe(true);
    expect(measurement()).toBe(true);
    expect(store.read(1).inputs.door).toMatchObject({ kind: 'input', value: true, streamId: stream(), sequence: 1 });
    expect(store.read(1).outputs.relay).toMatchObject({ kind: 'output', value: false });
    expect(store.read(1).measurements.meter).toMatchObject({
      value: 500,
      unit: 'milliwatt',
      measurementKind: 'live',
      sourceAt: new Date(now).toISOString(),
    });
    expect(measurement(2, { unit: 'milliwatt-hour', kind: 'cumulative', value: 123456 })).toBe(true);
    expect(store.read(1).cumulativeMeasurements.meter.measurementKind).toBe('cumulative');
    expect(store.read(1).measurements.meter).toMatchObject({ value: 500, measurementKind: 'live' });
    expect(measurement(3, { unit: 'watt-hour', kind: 'cumulative', value: Number.MAX_SAFE_INTEGER })).toBe(true);
    expect(store.read(1).cumulativeMeasurements.meter).toMatchObject({
      unit: 'watt-hour',
      value: Number.MAX_SAFE_INTEGER,
    });
  });
  it('rejects malformed/future timestamps and invalid category values before watermarks', () => {
    state();
    for (const extra of [
      { timestamp: new Date(now + 1).toISOString() },
      { timestamp: '2026-02-30T12:00:00Z' },
      { timestamp: 'bad' },
      { value: 1.5 },
      { value: Number.MAX_SAFE_INTEGER + 1 },
      { unit: 'unknown-unit' },
      { kind: 'unknown' },
      { sequence: 0 },
      { streamId: '' },
      { streamId: ' '.repeat(128) },
      { streamId: 'b'.repeat(129) },
    ]) {
      expect(measurement(100, extra)).toBe(false);
    }
    expect(measurement(1)).toBe(true);
    expect(state(100, 1, { inputs: { door: 'true' } })).toBe(false);
    expect(state(2)).toBe(true);
    expect(store.read(1).sequenceGaps).toBe(0);
    expect(freshness('2026-09-05T14:00:00+02:00', now)).toBe('fresh');
    expect(freshness('2026-09-05T14:00:01+02:00', now)).toBe('future');
  });
  it('admits heartbeat liveness without state, with category ordering and retired-boot protection', () => {
    expect(state(1, 1, { timestamp: new Date(now - 100_000).toISOString() })).toBe(false);
    expect(send('heartbeat', envelope(1))).toBe(true);
    expect(store.read(1)).toMatchObject({ heartbeatAt: new Date(now).toISOString() });
    expect(store.read(1).stateSourceAt).toBeUndefined();
    expect(send('heartbeat', envelope(1))).toBe(false);
    now++;
    expect(send('heartbeat', envelope(1, 2))).toBe(true);
    expect(send('heartbeat', envelope(2, 1))).toBe(false);
    expect(state(2, 1)).toBe(false);
    expect(state(1, 2)).toBe(true);
    for (let index = 3; index <= 17; index++) {
      now++;
      expect(send('heartbeat', envelope(1, index))).toBe(true);
    }
    now++;
    expect(send('heartbeat', envelope(1, 18))).toBe(false);
    expect(store.read(1).trackingExhausted).toBe(true);
  });
  it.each(['simulator-boot-1', ' Boot-A ', 'b'.repeat(128)])(
    'preserves valid opaque stream identity %j',
    (streamId) => {
      expect(send('heartbeat', { ...envelope(1), streamId })).toBe(true);
      expect(state(1, 1, { streamId })).toBe(true);
      expect(measurement(1, { streamId })).toBe(true);
      expect(store.read(1).activeStream).toBe(streamId);
      expect(store.read(1).measurements.meter.streamId).toBe(streamId);
      expect(store.read(1).sequenceGaps).toBe(0);
    },
  );
  it('treats case changes as distinct boots and rejects retired identities', () => {
    expect(send('heartbeat', { ...envelope(1), streamId: 'Boot-A' })).toBe(true);
    now++;
    expect(send('heartbeat', { ...envelope(1), streamId: 'boot-a' })).toBe(true);
    expect(send('heartbeat', { ...envelope(2), streamId: 'Boot-A' })).toBe(false);
    expect(store.read(1).retiredStreams).toEqual(['Boot-A']);
  });
  it.each([null, [], {}, { hardwareAvailable: undefined }, { hardwareAvailable: 'true' }])(
    'rejects malformed supplied readiness without consuming sequence: %j',
    (readiness) => {
      expect(state(1, 1, { readiness })).toBe(false);
      expect(state(1, 1, { readiness: { hardwareAvailable: false } })).toBe(true);
      expect(store.read(1).hardwareAvailable).toBe(false);
    },
  );
  it('bounds both measurement kinds and expires rejection evidence despite ongoing traffic', () => {
    state();
    for (let index = 0; index < 300; index++) {
      measurement(index * 2 + 1, { channelId: `m${index}` });
      measurement(index * 2 + 2, { channelId: `m${index}`, kind: 'cumulative', unit: 'milliwatt-hour' });
    }
    expect(Object.keys(store.read(1).measurements)).toHaveLength(256);
    expect(Object.keys(store.read(1).cumulativeMeasurements)).toHaveLength(256);
    send('configuration/reported', { ...envelope(1), revision: 2, contentHash: hash, errors: [] });
    expect(store.read(1).rejection).toMatchObject({ revision: 2, contentHash: hash });
    now += 14 * 60_000;
    send('heartbeat', envelope(1));
    now += 2 * 60_000;
    expect(store.read(1).rejection).toBeUndefined();
    expect(store.read(1).cumulativeMeasurements).toEqual({});
  });
  it('deduplicates by boot/category without renewing receipt or source freshness', () => {
    state();
    measurement();
    const receivedAt = store.read(1).measurements.meter.receivedAt;
    const sourceAt = now;
    now += 100_000;
    expect(measurement(1, { timestamp: new Date(sourceAt).toISOString() })).toBe(false);
    expect(store.read(1).measurements.meter.receivedAt).toBe(receivedAt);
    expect(freshness(store.read(1).measurements.meter.sourceAt, now)).toBe('stale');
    expect(measurement(4, { timestamp: new Date(sourceAt + 1).toISOString() })).toBe(true);
    expect(store.read(1).sequenceGaps).toBe(2);
    // State sequence is independent from the measurement sequence.
    expect(state(2)).toBe(true);
  });
  it('requires fresh connected state for restarts, retires old boots and rejects delayed unseen boots', () => {
    expect(measurement()).toBe(false);
    state();
    measurement();
    now += 1_000;
    expect(state(1, 2, { connected: false })).toBe(false);
    expect(state(1, 2)).toBe(true);
    expect(store.read(1).measurements).toEqual({});
    expect(state(500, 1)).toBe(false);
    expect(state(1, 3, { timestamp: new Date(now - 1).toISOString() })).toBe(false);
    expect(store.read(1).activeStream).toBe(stream(2));
  });
  it('invalidates omitted snapshot values and pre-disconnect measurements on reconnect', () => {
    state();
    measurement();
    now += 1;
    state(2, 1, { connected: false });
    measurement(2);
    state(3, 1, { inputs: {}, outputs: {} });
    expect(store.read(1).inputs).toEqual({});
    expect(store.read(1).outputs).toEqual({});
    expect(store.read(1).measurements).toEqual({});
    expect(send('state', { connected: true, revision: 2, outputs: { relay: true } })).toBe(false);
    expect(store.read(1).outputs).toEqual({});
  });
  it('fails closed when retired stream tracking is full and bounds category tracking', () => {
    for (let index = 1; index <= 17; index++) {
      now++;
      expect(state(1, index)).toBe(true);
    }
    now++;
    expect(state(1, 18)).toBe(false);
    expect(store.read(1)).toMatchObject({ trackingExhausted: true, connected: false });
    expect(store.read(1).retiredStreams).toHaveLength(16);
    expect(store.read(1).watermarks).toHaveProperty('state');
    expect(send('unbounded-category', envelope(1, 17))).toBe(false);
  });
  it('does not revive delayed measurements from before reconnect or a revision change', () => {
    state();
    measurement();
    const oldSource = now;
    now += 100;
    state(2, 1, { connected: false });
    now += 100;
    state(3, 1, { inputs: {}, outputs: {} });
    expect(measurement(50, { timestamp: new Date(oldSource).toISOString() })).toBe(false);
    expect(measurement(50)).toBe(false); // Same millisecond as reconnect is ambiguous: fail closed.
    now++;
    expect(measurement(2)).toBe(true);
    now++;
    state(4, 1, { revision: 3 });
    expect(measurement(3, { timestamp: new Date(now - 1).toISOString() })).toBe(false);
    now++;
    expect(measurement(3)).toBe(true);
  });
  it('reports correlated command failures and timeouts without device error text', () => {
    store.command(1, 'relay', 'cmd');
    store.commandFailed('cmd', 'timeout');
    expect(store.read(1).acknowledgements.relay.status).toBe('timeout');
    store.command(1, 'relay', 'cmd-2');
    store.commandFailed('cmd-2', 'dispatch-failed');
    expect(store.read(1).acknowledgements.relay.status).toBe('dispatch-failed');
  });
  it('bounds safe path/code summaries and excludes unknown property names and arbitrary messages', () => {
    const summaries = safeValidationSummaries([
      { path: '$.logicalChannels[3].disconnectPolicy.timeoutMs', code: 'invalid_timeout', message: 'SECRET' },
      { path: '$.logicalChannels[3].SECRET', code: 'SECRET', message: 'SECRET' },
    ]);
    expect(summaries).toEqual([
      { path: '$.logicalChannels[3].disconnectPolicy.timeoutMs', code: 'invalid_timeout' },
      { path: '$', code: 'validation_error' },
    ]);
    expect(safeValidationSummaries(Array(100).fill({}))).toHaveLength(50);
    state();
    send('configuration/reported', {
      ...envelope(1),
      revision: 2,
      contentHash: hash,
      errors: [{ path: '$.SECRET', code: 'SECRET', message: 'SECRET' }],
    });
    expect(JSON.stringify(store.read(1))).not.toContain('SECRET');
  });
});
