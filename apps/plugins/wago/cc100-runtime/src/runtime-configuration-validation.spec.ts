import { MemoryDeviceAdapter } from './adapters';
import { WagoRuntime, hash, validateSnapshot, type Snapshot } from './runtime';
import { TestTransport, snapshot, desired, commands, validCommand, createRuntimeFixture } from './runtime.test-utils';

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
