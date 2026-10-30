import { duplicateProfile, BUILTIN_MODBUS_PROFILES } from '../../../modbus/model';
import {
  CONFIGURATION_LIMIT_CODE,
  MAX_CONFIGURATION_ITEMS,
  MAX_ENABLED_CHANNELS,
  MAX_STATUS_REPORT_BYTES,
  configurationLimitViolations,
  worstCaseStatusReportBytes,
} from '../../../shared/configuration-limits';
import { meterFleet } from '../../../shared/configuration-limits.test-utils';
import { validateSnapshot } from './configuration/validation';
import { boundErrors, boundFaultText, boundReport, clip, truncateUtf8 } from './bounded';
import {
  MAX_COMMAND_BYTES,
  MAX_DESIRED_BYTES,
  MAX_FAULT_TEXT_BYTES,
  MAX_READINESS_ERROR_BYTES,
  MAX_REPORT_BYTES,
  MAX_REPORT_ERRORS,
  MAX_ROTATION_BYTES,
} from './limits';
import { JsonStateStore, WagoRuntime, hash, type Snapshot } from '../runtime';
import { MemoryDeviceAdapter } from '../io/adapters';
import { TestTransport, commands, desired, snapshot, validCommand } from '../runtime.test-utils';
import { DropCounters, SubscriptionAdmission } from '../transport/admission';
import type { DeviceAdapter, ValidationError } from './types';
import { BOUNDED_MESSAGES_CAPABILITY, CAPABILITIES } from './identity/protocol';

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const flush = () => new Promise((resolve) => setImmediate(resolve));
/** Half of a surrogate pair with no partner: what cutting an emoji in two leaves behind. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
/** A snapshot whose deepest object sits at exactly `depth` levels (the snapshot itself is level 1). */
const nestedTo = (depth: number) => ({
  ...snapshot,
  extra: JSON.parse('{"a":'.repeat(depth - 1) + '1' + '}'.repeat(depth - 1)),
});
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

/** `count` channels of which only the first 256 are enabled; the rest say `enabled: false`. */
const disabledChannels = (count: number): Snapshot => {
  const value = channels(count);
  value.logicalChannels = value.logicalChannels.map((channel, index) =>
    index < MAX_ENABLED_CHANNELS ? channel : { ...channel, enabled: false },
  );
  return value;
};

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
    expect(report.errors.some((error) => LONE_SURROGATE.test(JSON.stringify(error)))).toBe(false);
  });

  it('keeps at most 50 errors when they are short', () => {
    const report = boundReport(
      1,
      'a'.repeat(64),
      Array.from({ length: 5000 }, (_, index) => ({ path: `p${index}`, code: 'c', message: 'm' })),
    );
    expect(report.errors).toHaveLength(MAX_REPORT_ERRORS);
    expect(report.omittedErrors).toBe(5000 - MAX_REPORT_ERRORS);
  });

  it('keeps one shortened error when the envelope leaves no room, so a rejection never reads as accepted', () => {
    const report = boundReport(1, 'h'.repeat(MAX_REPORT_BYTES), [worstError(0), worstError(1)]);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].code).toBe('c'.repeat(63) + '…');
    expect(report.omittedErrors).toBe(1);
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
    expect(truncateUtf8('a😀', 4)).toBe('a');
    expect(truncateUtf8('😀😀', 4)).toBe('😀');
    expect(truncateUtf8('ä😀', 6)).toBe('ä😀');
  });

  it('clips text without leaving half of an emoji before the ellipsis', () => {
    expect(clip('😀😀😀', 4)).toBe('😀…');
    expect(clip('a😀😀', 4)).toBe('a😀…');
    expect(clip('short', 5)).toBe('short');
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
    ['more than 256 enabled channels', channels(MAX_ENABLED_CHANNELS + 1), 'enabled-channels'],
    ['more than 2048 channels, even when disabled', disabledChannels(MAX_CONFIGURATION_ITEMS + 1), 'channels'],
    ['an ID over 256 characters', channels(1, () => 'x'.repeat(257)), 'identifier'],
    ['an ID with a control character', channels(1, () => 'bad\nid'), 'identifier'],
    ['an ID with DEL', channels(1, () => 'bad\u007fid'), 'identifier'],
    ['an ID with a C1 control character', channels(1, () => 'bad\u0085id'), 'identifier'],
    [
      'more than 2048 points with few channels',
      {
        ...channels(1),
        physicalPoints: Array.from({ length: MAX_CONFIGURATION_ITEMS + 1 }, (_, index) => ({
          id: `p-${index}`,
          hardwareProfile: '751-9301' as const,
          channel: index,
        })),
      },
      'points',
    ],
    ['nesting of exactly 17 levels', nestedTo(17), 'depth'],
    [
      'a status report that could exceed 64 KiB',
      channels(256, (index) => `${index}`.padEnd(256, 'x')),
      'status-report',
    ],
    ['nesting over 16 levels', { ...snapshot, extra: JSON.parse('{"a":'.repeat(17) + '1' + '}'.repeat(17)) }, 'depth'],
    ['a configuration over 1 MiB', { ...snapshot, extra: 'x'.repeat(1024 * 1024) }, 'bytes'],
  ])('refuses %s', (_name, value, limit) => {
    expect(configurationLimitViolations(value).map((item) => item.limit)).toContain(limit);
  });

  it('accepts exactly 256 enabled channels, 2048 channels in all, a 256-character ID and 16 levels of nesting', () => {
    expect(configurationLimitViolations(channels(MAX_ENABLED_CHANNELS))).toEqual([]);
    expect(configurationLimitViolations(disabledChannels(MAX_CONFIGURATION_ITEMS))).toEqual([]);
    expect(configurationLimitViolations(nestedTo(16))).toEqual([]);
    expect(configurationLimitViolations(channels(1, () => 'x'.repeat(256)))).toEqual([]);
  });

  it('accepts ten built-in 879-3020 meters with 131 channels each and 11 enabled', () => {
    const fleet = meterFleet(10, 11);
    expect(fleet.logicalChannels).toHaveLength(10 * 131);
    expect(fleet.logicalChannels.filter((channel) => !('enabled' in channel))).toHaveLength(110);
    expect(validateSnapshot(fleet)).toEqual([]);
    expect(configurationLimitViolations(fleet)).toEqual([]);
  });

  it('refuses ten meters with all channels enabled only for the enabled-channel limit', () => {
    expect(configurationLimitViolations(meterFleet(10, 131))).toEqual([
      { limit: 'enabled-channels', actual: 1310, max: MAX_ENABLED_CHANNELS },
    ]);
  });

  it('estimates the status report from digital and output channel IDs only', () => {
    expect(worstCaseStatusReportBytes(channels(10))).toBeLessThan(worstCaseStatusReportBytes(channels(11)));
    // Modbus measurement channels never appear in the state message, enabled or not, whatever their IDs.
    const base = worstCaseStatusReportBytes({});
    expect(worstCaseStatusReportBytes(meterFleet(10, 131))).toBe(base);
    const longMeterIds = meterFleet(2, 128);
    longMeterIds.logicalChannels = longMeterIds.logicalChannels.map((channel, index) => ({
      ...channel,
      id: `${index}`.padEnd(256, 'x'),
    }));
    expect(worstCaseStatusReportBytes(longMeterIds)).toBe(base);
    expect(configurationLimitViolations(longMeterIds)).toEqual([]);
    // A digital input counts once, an output three times.
    const input = { ...channels(1), logicalChannels: [{ ...channels(1).logicalChannels[0], capabilities: ['input'] }] };
    expect(worstCaseStatusReportBytes(input)).toBe(base + Buffer.byteLength('"ch-0":false,'));
    expect(worstCaseStatusReportBytes(channels(1))).toBe(base + 2 * Buffer.byteLength('"ch-0":false,') + 7);
    // A Modbus input or output channel only counts when it can be commanded.
    const modbusPoint = { ...channels(1).physicalPoints[0], hardwareProfile: 'modbus' as const };
    const modbusOutput = {
      ...channels(1),
      physicalPoints: [{ ...modbusPoint, modbus: { deviceId: 'relay', actionId: 'coil' } }],
    };
    expect(worstCaseStatusReportBytes(modbusOutput)).toBe(worstCaseStatusReportBytes(channels(1)));
    const modbusInput = {
      ...input,
      physicalPoints: [{ ...modbusPoint, modbus: { deviceId: 'meter', measurementId: 'power' } }],
    };
    expect(worstCaseStatusReportBytes(modbusInput)).toBe(base);
  });
});

describe('runtime configuration limits', () => {
  const reported = 'attraccess/wago/v1/controllers/cc100-1/configuration/reported';
  async function runtime(
    store = new JsonStateStore(`/tmp/wago-limits-${Date.now()}-${Math.random()}.json`),
    device: DeviceAdapter = new MemoryDeviceAdapter(),
    reconnectCredentials?: () => Promise<void>,
  ) {
    const transport = new TestTransport();
    const instance = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device,
      reconnectCredentials,
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

  it('refuses a stale revision as stale even when it is also over the limits', async () => {
    const { transport, instance } = await runtime();
    await send(transport, 5, snapshot);
    await send(transport, 3, tooMany);
    expect(lastReport(transport)).toMatchObject({ revision: 3, errors: [{ code: 'stale_revision' }] });
    expect(Reflect.get(instance, 'state').accepted.revision).toBe(5);
  });

  it('leaves a malformed revision to validation instead of calling it stale', async () => {
    const { transport } = await runtime();
    await send(transport, 5, snapshot);
    await transport.send(desired, { protocolVersion: 1, revision: '3', contentHash: hash(snapshot), snapshot });
    expect(lastReport(transport).errors.map((error) => error.code)).toContain('invalid_revision');
  });

  it('subscribes each topic with its size cap', async () => {
    const { transport } = await runtime(undefined, undefined, async () => undefined);
    const prefix = 'attraccess/wago/v1/controllers/cc100-1';
    expect(transport.subscriptions.get(desired)).toEqual({ maxBytes: MAX_DESIRED_BYTES });
    expect(transport.subscriptions.get(commands)).toEqual({ maxBytes: MAX_COMMAND_BYTES });
    expect(transport.subscriptions.get(`${prefix}/credentials/rotate`)).toEqual({ maxBytes: MAX_ROTATION_BYTES });
    expect([MAX_COMMAND_BYTES, MAX_ROTATION_BYTES]).toEqual([64 * 1024, 64 * 1024]);
    expect(MAX_DESIRED_BYTES).toBe(1024 * 1024);
  });

  it('caps the rejection report it publishes with worst-case error text', async () => {
    const device = Object.assign(new MemoryDeviceAdapter(), {
      validate: (): ValidationError[] => Array.from({ length: 5000 }, (_, index) => worstError(index)),
    });
    const { transport } = await runtime(undefined, device);
    await send(transport, 1, snapshot);
    const report = transport.published.filter((item) => item.topic === reported).at(-1)?.payload as {
      errors: unknown[];
      omittedErrors: number;
    };
    expect(bytes(report)).toBeLessThanOrEqual(MAX_REPORT_BYTES);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors.length).toBeLessThanOrEqual(MAX_REPORT_ERRORS);
    expect(report.omittedErrors).toBe(5000 - report.errors.length);
  });

  it('keeps readiness errors in the status message within 8 KiB and counts the rest', async () => {
    class FailingReads extends MemoryDeviceAdapter {
      async read(): Promise<boolean> {
        throw new Error('😀'.repeat(5000));
      }
    }
    const { transport } = await runtime(undefined, new FailingReads());
    const configuration = channels(20);
    // Accepting the configuration publishes the status message.
    await send(transport, 1, configuration);
    const state = transport.published.filter((item) => item.topic.endsWith('/state')).at(-1)?.payload as {
      readiness: { errors: unknown[]; omittedErrors: number };
    };
    expect(state.readiness.errors.length).toBeGreaterThan(0);
    expect(bytes(state.readiness.errors)).toBeLessThanOrEqual(MAX_READINESS_ERROR_BYTES);
    expect(state.readiness.omittedErrors).toBe(20 - state.readiness.errors.length);
  });

  it('publishes a state message within the estimate when digital and output IDs are as long as the limits allow', async () => {
    class WorstCaseDevice extends MemoryDeviceAdapter {
      async checkAvailability(): Promise<void> {
        throw new Error('😀'.repeat(20_000));
      }
    }
    const meters = meterFleet(10, 11);
    const digital = (count: number, length: number, kind: 'input' | 'output'): Snapshot => {
      const value = channels(count, (index) => `${kind}-${index}-`.padEnd(length, '😀'));
      value.physicalPoints = value.physicalPoints.map((point) => ({ ...point, id: `${kind}-${point.id}` }));
      value.logicalChannels = value.logicalChannels.map((channel) => ({
        ...channel,
        physicalPointId: `${kind}-${channel.physicalPointId}`,
        capabilities: [kind],
        profile: kind === 'input' ? 'generic-monitored-input' : 'generic-digital-output',
        disconnectPolicy: { mode: kind === 'input' ? ('hold' as const) : ('immediate' as const) },
      }));
      return value;
    };
    const build = (length: number): Snapshot => {
      const outputs = digital(100, length, 'output');
      const inputs = digital(MAX_ENABLED_CHANNELS - 110 - 100, length, 'input');
      return {
        ...meters,
        physicalPoints: [...meters.physicalPoints, ...outputs.physicalPoints, ...inputs.physicalPoints],
        logicalChannels: [...meters.logicalChannels, ...outputs.logicalChannels, ...inputs.logicalChannels],
      };
    };
    // The longest IDs (in UTF-16 units of 4-byte characters) that still pass the status-report limit.
    let length = 16;
    while (length < 256 && worstCaseStatusReportBytes(build(length + 1)) <= MAX_STATUS_REPORT_BYTES) length += 1;
    const configuration = build(length);
    expect(worstCaseStatusReportBytes(build(length + 1))).toBeGreaterThan(MAX_STATUS_REPORT_BYTES);
    expect(configurationLimitViolations(configuration)).toEqual([]);

    const { transport, instance } = await runtime(undefined, new WorstCaseDevice());
    await send(transport, 1, configuration);
    expect(lastReport(transport)).toMatchObject({ revision: 1, errors: [] });
    const outputIds = configuration.logicalChannels
      .filter((channel) => channel.capabilities.includes('output'))
      .map((channel) => channel.id);
    const state = Reflect.get(instance, 'state');
    for (const id of outputIds) state.outputs[id] = true;
    state.manualOutputChannelIds = outputIds;
    await Reflect.get(instance, 'publishState').call(instance);
    const published = transport.published.filter((item) => item.topic.endsWith('/state')).at(-1)?.payload as {
      inputs: Record<string, boolean>;
      outputs: Record<string, boolean>;
      commandedOutputs: Record<string, boolean>;
      manualOutputChannelIds: string[];
    };
    expect(Object.keys(published.outputs)).toHaveLength(100);
    expect(Object.keys(published.commandedOutputs)).toHaveLength(100);
    expect(published.manualOutputChannelIds).toHaveLength(100);
    expect(Object.keys(published.inputs)).toHaveLength(MAX_ENABLED_CHANNELS - 110 - 100);
    // Meter readings never appear in the state message.
    expect(JSON.stringify(published)).not.toContain('meter-');
    expect(bytes(published)).toBeLessThanOrEqual(worstCaseStatusReportBytes(configuration));
    expect(bytes(published)).toBeLessThanOrEqual(MAX_STATUS_REPORT_BYTES);
  });

  it('caps the text of a measurement fault', async () => {
    class FailingMeasurement extends MemoryDeviceAdapter {
      async read(): Promise<number> {
        throw new Error('😀'.repeat(5000));
      }
    }
    const { transport, instance } = await runtime(undefined, new FailingMeasurement());
    const metered: Snapshot = {
      version: 1,
      physicalPoints: [{ id: 'meter', hardwareProfile: '751-9301', channel: 0 }],
      logicalChannels: [
        {
          id: 'power',
          physicalPointId: 'meter',
          profile: 'meter',
          capabilities: ['measurement'],
          disconnectPolicy: { mode: 'hold' },
          measurement: { unit: 'watt', scale: 1, offset: 0 },
        },
      ],
    };
    await send(transport, 1, metered);
    await instance.publishMeasurements();
    const fault = transport.published.filter((item) => item.topic.endsWith('/faults')).at(-1)?.payload as {
      channelId: string;
      message: string;
    };
    expect(fault.channelId).toBe('power');
    expect(Buffer.byteLength(fault.message)).toBeLessThanOrEqual(MAX_FAULT_TEXT_BYTES);
    expect(fault.message.length).toBeGreaterThan(0);
    expect(LONE_SURROGATE.test(fault.message)).toBe(false);
  });

  it('frees a command slot once the command joins its channel queue, so a slow output blocks no other', async () => {
    const opened: Array<() => void> = [];
    class SlowFirstOutput extends MemoryDeviceAdapter {
      async write(point: Snapshot['physicalPoints'][number], value: boolean, admit?: () => void): Promise<void> {
        if (point.id === 'p-0') await new Promise<void>((resolve) => opened.push(resolve));
        return super.write(point, value, admit);
      }
    }
    const { transport, instance } = await runtime(undefined, new SlowFirstOutput());
    await send(transport, 1, channels(2));
    // The same admission the MQTT transport puts in front of the command subscription.
    const admission = new SubscriptionAdmission(MAX_COMMAND_BYTES, new DropCounters(), (error) => {
      throw error;
    });
    const deliver = (command: Record<string, unknown>) =>
      admission.admit(Buffer.from(JSON.stringify(command)), (payload, slot) => instance.receiveCommand(payload, slot));
    // Fill every handling slot with commands for the slow output.
    for (let index = 0; index < 100; index += 1) deliver(validCommand({ id: `slow-${index}`, channelId: 'ch-0' }));
    deliver(validCommand({ id: 'other', channelId: 'ch-1' }));
    const acknowledgements = () =>
      transport.published
        .filter((item) => item.topic.endsWith('/acknowledgements'))
        .map((item) => item.payload as { id: string; status: string });
    for (let attempt = 0; attempt < 500 && !acknowledgements().some((item) => item.id === 'other'); attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 10));
    expect(acknowledgements()).toContainEqual(expect.objectContaining({ id: 'other', status: 'accepted' }));
    expect(acknowledgements().some((item) => item.id.startsWith('slow-'))).toBe(false);
    while (opened.length) {
      opened.shift()?.();
      await flush();
    }
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
