import { BOUNDED_MESSAGES_CAPABILITY } from '../../shared/capabilities';
import { CONFIGURATION_LIMIT_CODE, CONFIGURATION_LIMIT_MESSAGES } from '../../shared/configuration-limits';
import manifest from '../../cc100-runtime/manifest.json';
import { CAPABILITIES } from '../../cc100-runtime/src/runtime/identity/protocol';
import { parseConfigurationReport } from '../configuration/model';
import { parseHeartbeat } from '../protocol/index';
import { freshness, WagoDiagnosticsStore } from './store';

describe('WAGO bounded diagnostics', () => {
  let now: number;
  let store: WagoDiagnosticsStore;
  const send = (kind: string, value: unknown, id = 1) => store.ingest(id, kind, Buffer.from(JSON.stringify(value)));
  beforeEach(() => {
    now = Date.parse('2026-09-05T12:00:00Z');
    store = new WagoDiagnosticsStore(() => now);
  });
  it('keeps the configuration limit code of a runtime rejection and hides unknown codes', () => {
    send('configuration/reported', {
      revision: 3,
      contentHash: 'a'.repeat(64),
      errors: [
        { path: 'snapshot', code: CONFIGURATION_LIMIT_CODE, message: CONFIGURATION_LIMIT_MESSAGES.channels },
        { path: 'snapshot', code: 'made_up_code', message: 'anything' },
      ],
    });
    expect(store.read(1).rejection?.errors).toEqual([
      { path: 'snapshot', code: CONFIGURATION_LIMIT_CODE },
      { path: 'snapshot', code: 'validation_error' },
    ]);
  });
  it('distinguishes missing, invalid, stale and future source times', () => {
    expect(freshness(null, now)).toBe('missing');
    expect(freshness('bad', now)).toBe('invalid');
    expect(freshness(new Date(now + 5000).toISOString(), now)).toBe('fresh');
    expect(freshness(new Date(now + 5001).toISOString(), now)).toBe('future');
    expect(freshness(new Date(now - 90_001).toISOString(), now)).toBe('stale');
    expect(freshness(new Date(now).toISOString(), now)).toBe('fresh');
  });
  it('ingests the actual runtime shapes without inventing source times or readiness', () => {
    send('state', { connected: true, revision: 2, outputs: { relay: true, invalid: 'true' } });
    send('measurements', { channelId: 'meter', value: 12, unit: 'watt' });
    expect(store.read(1).outputs.relay.value).toBe(true);
    expect(store.read(1).measurements.meter).toMatchObject({
      kind: 'measurement',
      value: 12,
      unit: 'watt',
      sourceAt: null,
    });
    expect(store.read(1).outputs.invalid).toBeUndefined();
  });
  describe('mixed runtime and server versions', () => {
    const heartbeat = (extra: Record<string, unknown>) => ({
      hardwareId: 'cc100-1',
      protocolVersion: '1.0.0',
      runtimeVersion: '0.2.10',
      timestamp: '2026-09-05T12:00:00.000Z',
      streamId: '6b6b0b0e-3d0c-4d2a-9b7b-5f0f0b0b0b0b',
      sequence: 1,
      ...extra,
    });
    const counts = { oversized: 2, overload: 1 };

    it('reads drop counters only from a runtime that advertises bounded messages', () => {
      send('heartbeat', heartbeat({ capabilities: [BOUNDED_MESSAGES_CAPABILITY], dropCounts: counts }));
      expect(store.read(1).dropCounts).toEqual(counts);
    });

    it('ignores drop counters from a runtime without the capability', () => {
      send('heartbeat', heartbeat({ capabilities: ['claim'], dropCounts: counts }));
      expect(store.read(1).dropCounts).toBeUndefined();
    });

    it('treats an older runtime heartbeat without counters as unsupported', () => {
      send('heartbeat', heartbeat({ capabilities: ['claim', 'heartbeat'] }));
      expect(store.read(1).dropCounts).toBeUndefined();
    });

    it.each([{ oversized: -1, overload: 0 }, { oversized: 1.5, overload: 0 }, { oversized: 1 }, [1, 2], 'many'])(
      'ignores malformed counters %j',
      (dropCounts) => {
        send('heartbeat', heartbeat({ capabilities: [BOUNDED_MESSAGES_CAPABILITY], dropCounts }));
        expect(store.read(1).dropCounts).toBeUndefined();
      },
    );

    it('drops counters again when a later heartbeat no longer reports them', () => {
      send('heartbeat', heartbeat({ capabilities: [BOUNDED_MESSAGES_CAPABILITY], dropCounts: counts }));
      send('heartbeat', heartbeat({ capabilities: ['claim'], sequence: 2 }));
      expect(store.read(1).dropCounts).toBeUndefined();
    });

    it('lets an older server keep parsing heartbeats and reports that carry the new fields', () => {
      const payload = Buffer.from(
        JSON.stringify(heartbeat({ capabilities: [BOUNDED_MESSAGES_CAPABILITY], dropCounts: counts })),
      );
      expect(parseHeartbeat(payload).capabilities).toContain(BOUNDED_MESSAGES_CAPABILITY);
      expect(
        parseConfigurationReport({
          revision: 2,
          contentHash: 'a'.repeat(64),
          errors: [{ path: 'snapshot', code: 'configuration_limit_exceeded', message: 'too big' }],
          omittedErrors: 12,
        }),
      ).toEqual({
        revision: 2,
        contentHash: 'a'.repeat(64),
        errors: [{ path: 'snapshot', code: 'configuration_limit_exceeded', message: 'too big' }],
      });
    });

    it('keeps the same runtime capability list in the manifest and the code', () => {
      expect(manifest.capabilities).toEqual(CAPABILITIES);
    });
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
  it('rejects measurements from before a canonical reconnect after a legacy disconnect', () => {
    const streamId = '00000000-0000-4000-8000-000000000001';
    const timestamp = (offset: number) => new Date(now + offset).toISOString();
    send('state', { connected: false, revision: 2, outputs: {} });
    now += 1;
    send('state', {
      timestamp: timestamp(0),
      streamId,
      sequence: 1,
      connected: true,
      revision: 2,
      contentHash: 'a'.repeat(64),
      outputs: {},
    });
    expect(
      send('measurements', {
        timestamp: timestamp(-1),
        streamId,
        sequence: 1,
        channelId: 'meter',
        value: 1,
        unit: 'milliwatt',
        kind: 'live',
      }),
    ).toBe(false);
  });
});

describe('diagnostic payload admission', () => {
  it.each([
    ['configuration/reported', { revision: 0, contentHash: 'a'.repeat(64), errors: [] }],
    ['configuration/reported', { revision: 1, contentHash: 'invalid', errors: [] }],
    ['configuration/reported', { revision: 1, contentHash: 'a'.repeat(64), errors: null }],
    ['measurements', { channelId: 'meter', value: 1.5, unit: 'milliwatt', kind: 'live' }],
    ['measurements', { channelId: 'meter', value: 1, unit: 'invalid', kind: 'live' }],
    ['measurements', { channelId: 'meter', value: 1, unit: 'milliwatt', kind: 'invalid' }],
    ['faults', { channelId: '' }],
    ['acknowledgements', { id: 'command', status: 'invalid' }],
    ['acknowledgements', { id: '', status: 'accepted' }],
  ])('rejects invalid %s payloads without mutating stream state', (kind, fields) => {
    const now = Date.parse('2026-09-05T12:00:00Z');
    const store = new WagoDiagnosticsStore(() => now);
    const envelope = {
      timestamp: new Date(now).toISOString(),
      streamId: '00000000-0000-4000-8000-000000000001',
      sequence: 1,
    };
    expect(
      store.ingest(
        1,
        'state',
        Buffer.from(
          JSON.stringify({ ...envelope, connected: true, revision: 1, contentHash: 'a'.repeat(64), outputs: {} }),
        ),
      ),
    ).toBe(true);
    const before = store.read(1);
    expect(store.ingest(1, kind, Buffer.from(JSON.stringify({ ...envelope, ...fields })))).toBe(false);
    expect(store.read(1)).toEqual(before);
  });
});

describe('canonical state admission', () => {
  const now = Date.parse('2026-09-05T12:00:00Z');
  const valid = { connected: true, revision: 1, contentHash: 'a'.repeat(64), outputs: { relay: true } };
  const ingest = (fields: Record<string, unknown>) => {
    const store = new WagoDiagnosticsStore(() => now);
    const envelope = {
      timestamp: new Date(now).toISOString(),
      streamId: '00000000-0000-4000-8000-000000000001',
      sequence: 1,
    };
    return { store, admitted: store.ingest(1, 'state', Buffer.from(JSON.stringify({ ...envelope, ...fields }))) };
  };
  it('admits readiness, null revisions and boolean inputs', () => {
    const { store, admitted } = ingest({
      ...valid,
      revision: null,
      contentHash: null,
      readiness: { hardwareAvailable: false },
      inputs: { door: false },
      manualOutputChannelIds: ['relay'],
    });
    expect(admitted).toBe(true);
    expect(store.read(1)).toMatchObject({ hardwareAvailable: false, manualOutputChannelIds: ['relay'] });
    expect(store.read(1).inputs.door.value).toBe(false);
  });
  it.each([
    ['manual output list', { manualOutputChannelIds: 'relay' }],
    ['manual output identifier', { manualOutputChannelIds: [''] }],
    ['readiness shape', { readiness: [] }],
    ['readiness availability', { readiness: { hardwareAvailable: 'yes' } }],
    ['content hash', { contentHash: 'invalid' }],
    ['connection flag', { connected: 'true' }],
    ['revision', { revision: -1 }],
    ['outputs', { outputs: null }],
    ['inputs shape', { inputs: [] }],
    ['input value', { inputs: { door: 1 } }],
  ])('rejects an invalid %s', (_name, fields) => {
    const { store, admitted } = ingest({ ...valid, ...fields });
    expect(admitted).toBe(false);
    expect(store.read(1).outputs).toEqual({});
  });
});
