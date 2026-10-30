import { MemoryDeviceAdapter } from '../../io/adapters';
import { WagoRuntime, hash, validateSnapshot, type Snapshot } from '../../runtime';
import {
  TestTransport,
  snapshot,
  desired,
  commands,
  validCommand,
  createRuntimeFixture,
} from '../../runtime.test-utils';
import { meterFleet } from '../../../../shared/configuration-limits.test-utils';

describe('WagoRuntime', () => {
  let transport: TestTransport;
  let device: MemoryDeviceAdapter;
  let runtime: WagoRuntime;
  beforeEach(async () => {
    ({ transport, device, runtime } = await createRuntimeFixture());
  });
  it.each(['{', 'null', '{}', '{"id":"bad","channelId":"load","action":"unexpected"}'])(
    'ignores malformed command %s without performing device writes',
    async (payload) => {
      const write = jest.spyOn(device, 'write');
      const before = transport.published.length;
      await expect(runtime.receiveCommand(Buffer.from(payload))).resolves.toBeUndefined();
      expect(write).not.toHaveBeenCalled();
      expect(transport.published).toHaveLength(before);
    },
  );

  it('accepts opaque server-defined profile names', async () => {
    const serverDefined = {
      ...snapshot,
      logicalChannels: [{ ...snapshot.logicalChannels[0], profile: 'server-defined-profile' }],
    };
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(serverDefined),
      snapshot: serverDefined,
    });

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: { revision: 1, contentHash: hash(serverDefined), errors: [] },
        retain: true,
      }),
    );
  });

  it('rejects an invalid snapshot without replacing the last valid configuration', async () => {
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: 'wrong',
      snapshot: { ...snapshot, physicalPoints: [] },
    });
    await transport.send(commands, validCommand());
    expect(device.values.get('751-9301:0')).toBe(true);
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: expect.objectContaining({ revision: 2, errors: expect.any(Array) }),
      }),
    );
  });

  it('reports malformed snapshot capabilities instead of throwing', async () => {
    const malformed = {
      ...snapshot,
      logicalChannels: [{ ...snapshot.logicalChannels[0], capabilities: undefined }],
    };
    await expect(
      transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(malformed), snapshot: malformed }),
    ).resolves.toBeUndefined();
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: expect.objectContaining({
          errors: expect.arrayContaining([expect.objectContaining({ code: 'invalid_capabilities' })]),
        }),
      }),
    );
  });

  it('rejects malformed channel definitions before they can reach device control', () => {
    const errors = validateSnapshot({
      ...snapshot,
      unexpected: true,
      logicalChannels: [
        {
          ...snapshot.logicalChannels[0],
          profile: '',
          capabilities: ['output', 'output', 'unsupported'],
          feedback: { channelId: 'load', expected: 'unknown', timeoutMs: 0 },
          range: { minimum: 1, maximum: 0 },
          measurement: { unit: 'unknown', scale: Number.NaN, offset: Number.NaN },
        },
      ],
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unknown_field' }),
        expect.objectContaining({ code: 'invalid_profile' }),
        expect.objectContaining({ code: 'invalid_capabilities' }),
        expect.objectContaining({ code: 'invalid_feedback' }),
        expect.objectContaining({ code: 'invalid_range' }),
        expect.objectContaining({ code: 'invalid_measurement' }),
      ]),
    );
  });

  it.each([
    { unit: 'unknown', scale: 1, offset: 0 },
    { unit: 'watt', scale: Number.NaN, offset: 0 },
    { unit: 'watt', scale: 1, offset: Number.POSITIVE_INFINITY },
  ])('rejects invalid measurement metadata: %j', (measurement) => {
    const errors = validateSnapshot({
      ...snapshot,
      logicalChannels: [
        {
          ...snapshot.logicalChannels[0],
          capabilities: ['output', 'measurement'],
          measurement,
        },
      ],
    });

    expect(errors).toContainEqual(expect.objectContaining({ code: 'invalid_measurement' }));
  });

  it('rejects duplicate logical channel IDs', async () => {
    const duplicated = {
      ...snapshot,
      logicalChannels: [...snapshot.logicalChannels, { ...snapshot.logicalChannels[0] }],
    };
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(duplicated),
      snapshot: duplicated,
    });
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: expect.objectContaining({
          errors: expect.arrayContaining([expect.objectContaining({ path: 'snapshot.logicalChannels[0].id' })]),
        }),
      }),
    );
  });

  it('rejects feedback that references the output rather than an input channel', async () => {
    const invalid: Snapshot = {
      ...snapshot,
      logicalChannels: [
        {
          ...snapshot.logicalChannels[0],
          capabilities: ['output', 'pulse', 'feedback'],
          feedback: { channelId: 'load', expected: 'match', timeoutMs: 5 },
        },
      ],
    };
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(invalid), snapshot: invalid });

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({ path: 'snapshot.logicalChannels[0].feedback', code: 'invalid_feedback' }),
          ]),
        }),
      }),
    );
  });
});

/** `hash(snapshot)` of the shared runtime fixture, recorded before channels could be disabled. */
const STORED_SNAPSHOT_HASH = '6c006161095c1d3477e3bcbd87030fe9dd4f6e8b834614dabcc8abddd9a5610e';

describe('disabled channels', () => {
  /** Two meters with three readings each, the last one disabled, plus a digital input and output. */
  const fleet = (): Snapshot => {
    const meters = meterFleet(2, 2);
    meters.logicalChannels = meters.logicalChannels.filter((_, index) => index % 131 < 3);
    meters.physicalPoints = meters.physicalPoints.filter((_, index) => index % 131 < 3);
    return {
      ...meters,
      physicalPoints: [
        ...meters.physicalPoints,
        ...snapshot.physicalPoints,
        { id: 'input-1', hardwareProfile: '751-9301', channel: 1 },
      ],
      logicalChannels: [
        ...meters.logicalChannels,
        ...snapshot.logicalChannels,
        {
          id: 'door',
          physicalPointId: 'input-1',
          profile: 'generic-monitored-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
      ],
    };
  };
  const disabledId = meterFleet(1, 0).logicalChannels[2].id;
  const codes = (value: unknown) => validateSnapshot(value).map((error) => error.code);
  const withChannel = (index: number, change: Record<string, unknown>) => {
    const value = fleet();
    value.logicalChannels[index] = { ...value.logicalChannels[index], ...change };
    return value;
  };
  const loadIndex = 6;
  const doorIndex = 7;

  it('accepts enabled: false on a Modbus measurement channel', () => {
    expect(fleet().logicalChannels[2]).toMatchObject({ id: disabledId, enabled: false });
    expect(validateSnapshot(fleet())).toEqual([]);
    expect(validateSnapshot(withChannel(2, { capabilities: ['input', 'measurement'] }))).toEqual([]);
  });

  it.each([true, 'false', 0, null])('rejects enabled: %p', (enabled) => {
    expect(validateSnapshot(withChannel(0, { enabled }))).toContainEqual({
      path: 'snapshot.logicalChannels[0].enabled',
      code: 'invalid_enabled',
      message: 'enabled must be false or omitted',
    });
  });

  it.each([
    ['a digital output', loadIndex, {}],
    ['a digital input', doorIndex, {}],
    ['a Modbus channel with output capability', 2, { capabilities: ['measurement', 'output'] }],
  ])('rejects enabled: false on %s', (_name, index, change) => {
    expect(validateSnapshot(withChannel(index, { ...change, enabled: false }))).toContainEqual({
      path: `snapshot.logicalChannels[${index}].enabled`,
      code: 'invalid_enabled',
      message: 'only Modbus measurement channels without an action can be disabled',
    });
  });

  it('rejects enabled: false on a channel whose Modbus point is bound to an action', () => {
    const value = fleet();
    value.physicalPoints[2] = { ...value.physicalPoints[2], modbus: { deviceId: 'meter-0', actionId: 'relay' } };
    expect(codes(value)).toContain('invalid_enabled');
  });

  it.each([
    ['guard', { capabilities: ['output', 'guard'], guard: { channelId: disabledId, when: 'on' } }],
    [
      'feedback',
      { capabilities: ['output', 'feedback'], feedback: { channelId: disabledId, expected: 'match', timeoutMs: 100 } },
    ],
  ])('rejects a %s that refers to a disabled channel', (key, change) => {
    // The disabled reading is otherwise a valid guard or feedback input.
    const value = withChannel(loadIndex, change);
    value.logicalChannels[2] = { ...value.logicalChannels[2], capabilities: ['input', 'measurement'] };
    expect(validateSnapshot(value)).toEqual([
      {
        path: `snapshot.logicalChannels[${loadIndex}].${key}`,
        code: 'disabled_reference',
        message: 'a guard or feedback cannot use a disabled channel',
      },
    ]);
    // The same reference to the enabled reading is valid.
    delete value.logicalChannels[2].enabled;
    expect(validateSnapshot(value)).toEqual([]);
  });

  it('still rejects unknown channel fields', () => {
    expect(validateSnapshot(withChannel(2, { disabled: true }))).toContainEqual(
      expect.objectContaining({ path: 'snapshot.logicalChannels[2].disabled', code: 'unknown_field' }),
    );
  });

  it('keeps the content hash of a snapshot without the flag unchanged', () => {
    // Recorded before `enabled` existed; an unchanged stored snapshot must keep its hash.
    expect(hash(snapshot)).toBe(STORED_SNAPSHOT_HASH);
  });
});
