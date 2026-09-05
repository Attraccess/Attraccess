import { freshness, WagoDiagnosticsStore } from './diagnostics-store';

describe('WAGO bounded diagnostics', () => {
  let now: number;
  let store: WagoDiagnosticsStore;
  const send = (kind: string, value: unknown, id = 1) => store.ingest(id, kind, Buffer.from(JSON.stringify(value)));
  beforeEach(() => {
    now = Date.parse('2026-09-05T12:00:00Z');
    store = new WagoDiagnosticsStore(() => now);
  });
  it('distinguishes missing, invalid, stale and future source times', () => {
    expect(freshness(null, now)).toBe('missing');
    expect(freshness('bad', now)).toBe('invalid');
    expect(freshness(new Date(now + 1).toISOString(), now)).toBe('future');
    expect(freshness(new Date(now - 90_001).toISOString(), now)).toBe('stale');
    expect(freshness(new Date(now).toISOString(), now)).toBe('fresh');
  });
  it('ingests the actual runtime shapes without inventing source times or readiness', () => {
    send('state', { connected: true, revision: 2, outputs: { relay: true, invalid: 'true' } });
    send('measurements', { channelId: 'meter', value: 12, unit: 'watt' });
    expect(store.read(1).outputs.relay.value).toBe(true);
    expect(store.read(1).measurements.meter).toMatchObject({ kind: 'measurement', value: 12, unit: 'watt', sourceAt: null });
    expect(store.read(1).outputs.invalid).toBeUndefined();
  });
  it('excludes secrets and safely stores own prototype-named channels', () => {
    send('heartbeat', { pairingCode: 'SECRET', enrollmentSecret: 'SECRET', password: 'SECRET' });
    send('faults', { channelId: 'relay', code: 'SECRET', message: 'password=SECRET' });
    send('state', JSON.parse('{"outputs":{"__proto__":true,"constructor":true}}'));
    send('measurements', { channelId: 'relay', value: 1, unit: 'SECRET' });
    expect(JSON.stringify(store.read(1))).not.toContain('SECRET');
    expect(store.read(1).faults.relay.code).toBe('runtime_fault');
    expect(Object.keys(store.read(1).outputs)).toEqual(['__proto__', 'constructor']);
    expect(store.read(1).outputs.toString).toBeUndefined();
    expect(Object.getPrototypeOf(store.read(1).outputs)).toBeNull();
  });
  it('correlates acknowledgements with both controller and command, including dispatch-only commands', () => {
    store.command(1, 'relay', 'cmd-1');
    send('acknowledgements', { id: 'cmd-1', status: 'accepted' }, 2);
    expect(store.read(2).acknowledgements.relay).toBeUndefined();
    send('acknowledgements', { id: 'cmd-1', status: 'rejected', error: 'SECRET' });
    expect(store.read(1).acknowledgements.relay).toMatchObject({ id: 'cmd-1', status: 'rejected' });
    send('acknowledgements', { id: 'unknown', status: 'accepted' });
    expect(store.read(1).acknowledgements.relay.status).toBe('rejected');
  });
  it('bounds controllers, channels, event count and age even while heartbeats continue', () => {
    for (let i = 0; i < 300; i++) send('measurements', { channelId: `m-${i}`, value: i, unit: 'watt' });
    expect(Object.keys(store.read(1).measurements)).toHaveLength(256);
    expect(store.read(1).events).toHaveLength(50);
    now += 16 * 60_000;
    send('heartbeat', {});
    expect(Object.keys(store.read(1).measurements)).toHaveLength(0);
    expect(store.read(1).events).toHaveLength(1);
    for (let id = 2; id <= 258; id++) send('heartbeat', {}, id);
    expect(store.read(1).heartbeatAt).toBeUndefined();
  });
  it('ignores malformed and oversized input and returns detached snapshots', () => {
    store.ingest(1, 'state', Buffer.from('bad'));
    store.ingest(1, 'state', Buffer.alloc(70_000));
    send('state', null);
    send('state', { outputs: { relay: false } });
    store.read(1).outputs.relay.value = true;
    expect(store.read(1).outputs.relay.value).toBe(false);
  });
});
