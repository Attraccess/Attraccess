import { duplicateProfile, BUILTIN_MODBUS_PROFILES } from '../../../modbus/model';
import {
  CONFIGURATION_LIMIT_CODE,
  MAX_CONFIGURATION_ITEMS,
  configurationLimitViolations,
  worstCaseStatusReportBytes,
} from '../../../shared/configuration-limits';
import { boundErrors, boundFaultText, boundReport, truncateUtf8 } from './bounded';
import { MAX_FAULT_TEXT_BYTES, MAX_READINESS_ERROR_BYTES, MAX_REPORT_BYTES, MAX_REPORT_ERRORS } from './limits';
import { JsonStateStore, WagoRuntime, hash, type Snapshot } from '../runtime';
import { MemoryDeviceAdapter } from '../io/adapters';
import { TestTransport, desired, snapshot } from '../runtime.test-utils';
import { BOUNDED_MESSAGES_CAPABILITY, CAPABILITIES } from './identity/protocol';

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const worstError = (index: number) => ({
  path: `snapshot.logicalChannels[${index}].${'p'.repeat(5000)}`,
  code: 'c'.repeat(5000),
  message: '😀'.repeat(20_000),
});
const channels = (count: number, id = (index: number) => `ch-${index}`): Snapshot => ({
  version: 1,
  physicalPoints: Array.from({ length: count }, (_, index) => ({
    id: `p-${index}`,
    hardwareProfile: '751-9301' as const,
    channel: index,
  })),
  logicalChannels: Array.from({ length: count }, (_, index) => ({
    id: id(index),
    physicalPointId: `p-${index}`,
    profile: 'generic-digital-output',
    capabilities: ['output'],
    disconnectPolicy: { mode: 'immediate' as const },
  })),
});

describe('bounded runtime messages', () => {
  it('keeps a rejection report within 50 errors and 64 KiB with worst-case text', () => {
    const report = boundReport(
      1,
      'a'.repeat(64),
      Array.from({ length: 5000 }, (_, index) => worstError(index)),
    );
    expect(report.errors.length).toBeLessThanOrEqual(MAX_REPORT_ERRORS);
    expect(bytes(report)).toBeLessThanOrEqual(MAX_REPORT_BYTES);
    expect(report.omittedErrors).toBe(5000 - report.errors.length);
    expect(report.errors.every((error) => error.path && error.code && error.message)).toBe(true);
  });

  it('leaves a short report unchanged and omits the counter', () => {
    const errors = [{ path: 'snapshot', code: 'invalid_id', message: 'bad' }];
    expect(boundReport(2, 'h', errors)).toEqual({ revision: 2, contentHash: 'h', errors });
  });

  it('gives readiness errors an 8 KiB budget and counts what does not fit', () => {
    const { errors, omitted } = boundErrors(
      Array.from({ length: 500 }, (_, index) => worstError(index)),
      Infinity,
      MAX_READINESS_ERROR_BYTES,
    );
    expect(bytes(errors)).toBeLessThanOrEqual(MAX_READINESS_ERROR_BYTES);
    expect(omitted).toBe(500 - errors.length);
  });

  it('truncates fault text to 1 KiB on a character boundary', () => {
    const text = boundFaultText('😀'.repeat(10_000));
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(MAX_FAULT_TEXT_BYTES);
    expect(text).not.toContain('�');
    expect(truncateUtf8('short', 10)).toBe('short');
  });
});

describe('configuration limits', () => {
  it('passes an ordinary configuration', () => {
    expect(configurationLimitViolations(snapshot)).toEqual([]);
  });

  it('passes a copied meter profile with one channel per register', () => {
    const profile = duplicateProfile(BUILTIN_MODBUS_PROFILES[0], 'copy');
    const meter = {
      ...channels(profile.measurements.length, (index) => `meter-${profile.measurements[index].id}`),
      modbus: { connections: [], devices: [], profiles: [profile] },
    };
    expect(configurationLimitViolations(meter)).toEqual([]);
  });

  it.each([
    ['more than 256 channels', channels(MAX_CONFIGURATION_ITEMS + 1), 'channels'],
    ['an ID over 256 characters', channels(1, () => 'x'.repeat(257)), 'identifier'],
    ['an ID with a control character', channels(1, () => 'bad\nid'), 'identifier'],
    ['a status report that could exceed 64 KiB', channels(256, (index) => `${index}`.padEnd(256, 'x')), 'status-report'],
    [
      'nesting over 16 levels',
      { ...snapshot, extra: JSON.parse('{"a":'.repeat(17) + '1' + '}'.repeat(17)) },
      'depth',
    ],
    ['a configuration over 1 MiB', { ...snapshot, extra: 'x'.repeat(1024 * 1024) }, 'bytes'],
  ])('refuses %s', (_name, value, limit) => {
    expect(configurationLimitViolations(value).map((item) => item.limit)).toContain(limit);
  });

  it('accepts exactly 256 channels and a 256-character ID', () => {
    expect(configurationLimitViolations(channels(MAX_CONFIGURATION_ITEMS))).toEqual([]);
    expect(configurationLimitViolations(channels(1, () => 'x'.repeat(256)))).toEqual([]);
  });

  it('estimates the status report from every channel ID', () => {
    expect(worstCaseStatusReportBytes(channels(10))).toBeLessThan(worstCaseStatusReportBytes(channels(11)));
  });
});

describe('runtime configuration limits', () => {
  const reported = 'attraccess/wago/v1/controllers/cc100-1/configuration/reported';
  async function runtime(store = new JsonStateStore(`/tmp/wago-limits-${Date.now()}-${Math.random()}.json`)) {
    const transport = new TestTransport();
    const instance = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device: new MemoryDeviceAdapter(),
    });
    await instance.start();
    return { transport, instance, store };
  }
  const send = (transport: TestTransport, revision: number, value: Snapshot) =>
    transport.send(desired, { protocolVersion: 1, revision, contentHash: hash(value), snapshot: value });
  const lastReport = (transport: TestTransport) =>
    transport.published.filter((item) => item.topic === reported).at(-1)?.payload as {
      revision: number;
      errors: Array<{ code: string }>;
    };
  const tooMany = channels(MAX_CONFIGURATION_ITEMS + 1);

  it('rejects a new over-limit revision with the new code and keeps the running configuration', async () => {
    const { transport, instance } = await runtime();
    await send(transport, 1, snapshot);
    await send(transport, 2, tooMany);
    expect(lastReport(transport)).toMatchObject({
      revision: 2,
      errors: expect.arrayContaining([expect.objectContaining({ code: CONFIGURATION_LIMIT_CODE })]),
    });
    expect(Reflect.get(instance, 'state').accepted.revision).toBe(1);
  });

  it('rejects a rollback that is over the limits', async () => {
    const { transport } = await runtime();
    await send(transport, 1, snapshot);
    await send(transport, 3, tooMany);
    expect(lastReport(transport).errors[0].code).toBe(CONFIGURATION_LIMIT_CODE);
  });

  it('never rejects a running configuration that is redelivered or restored after a restart', async () => {
    const store = new JsonStateStore(`/tmp/wago-limits-restart-${Date.now()}-${Math.random()}.json`);
    const first = await runtime(store);
    await send(first.transport, 1, snapshot);
    // Make the persisted configuration exceed the limits, as one accepted by an older runtime might.
    const state = await store.load();
    state.accepted = { revision: 5, contentHash: hash(tooMany), snapshot: tooMany };
    await store.save(state);
    const second = await runtime(store);
    expect(Reflect.get(second.instance, 'state').accepted.revision).toBe(5);
    await send(second.transport, 5, tooMany);
    expect(lastReport(second.transport)).toEqual({ revision: 5, contentHash: hash(tooMany), errors: [] });
    expect(Reflect.get(second.instance, 'state').accepted.revision).toBe(5);
  });

  it('advertises the bounded-messages capability and drop counters in heartbeats', async () => {
    const { transport, instance } = await runtime();
    transport.dropCounts = () => ({ oversized: 3, overload: 1 });
    await instance.publishHeartbeat();
    const heartbeat = transport.published.filter((item) => item.topic.endsWith('/heartbeat')).at(-1)?.payload as {
      capabilities: string[];
      dropCounts: Record<string, number>;
    };
    expect(CAPABILITIES).toContain(BOUNDED_MESSAGES_CAPABILITY);
    expect(heartbeat.capabilities).toContain(BOUNDED_MESSAGES_CAPABILITY);
    expect(heartbeat.dropCounts).toEqual({ oversized: 3, overload: 1 });
  });
});
