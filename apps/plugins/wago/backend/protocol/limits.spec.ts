import { MESSAGE_LIMITS, MessageAdmission, isIdentifier, structureLimitError } from '../../shared/protocol-limits';
import { WagoRuntime, hash, type Snapshot, validateSnapshot as validateRuntime } from '../../cc100-runtime/src/runtime';
import { parseHeartbeat, parseOperationalMessage } from './index';
import { validateSnapshot } from '../configuration/model';

describe('wire resource budgets', () => {
  it('accepts boundaries and rejects the first excessive string, collection and depth', () => {
    expect(structureLimitError('x'.repeat(MESSAGE_LIMITS.stringLength))).toBeNull();
    expect(structureLimitError('x'.repeat(MESSAGE_LIMITS.stringLength + 1))).toBeTruthy();
    expect(structureLimitError(Array(MESSAGE_LIMITS.collectionEntries).fill(0))).toBeNull();
    expect(structureLimitError(Array(MESSAGE_LIMITS.collectionEntries + 1).fill(0))).toBeTruthy();
    let value: unknown = 0;
    for (let i = 0; i < MESSAGE_LIMITS.depth; i++) value = [value];
    expect(structureLimitError(value)).toBeNull();
    expect(structureLimitError([value])).toBeTruthy();
    const shared = { value: 1 };
    expect(structureLimitError({ a: shared, b: shared })).toBeNull();
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(validateSnapshot(cyclic)).toEqual([expect.objectContaining({ code: 'message_limit' })]);
  });

  it('bounds node count and aggregate encoded string work before canonical serialization', () => {
    const tree = Array.from({ length: 4096 }, () => Array<number>(15).fill(0));
    tree[tree.length - 1].pop();
    expect(structureLimitError(tree)).toBeNull();
    tree[tree.length - 1].push(0);
    expect(structureLimitError(tree)).toContain('complexity');
    expect(structureLimitError(Array(255).fill('x'.repeat(4096)))).toBeNull();
    expect(structureLimitError(Array(256).fill('x'.repeat(4096)))).toContain('bytes');
  });

  it('rejects configurations that cannot fit a desired envelope on both sides', () => {
    const configuration = {
      version: 1,
      physicalPoints: [{ id: 'p', hardwareProfile: '879-3000', channel: 0 }],
      logicalChannels: Array.from({ length: MESSAGE_LIMITS.collectionEntries }, (_, i) => ({
        id: 'x'.repeat(123) + String(i).padStart(5, '0'),
        physicalPointId: 'p',
        profile: 'generic-digital-output',
        capabilities: ['output'],
        disconnectPolicy: { mode: 'hold' },
      })),
    };
    expect(Buffer.byteLength(JSON.stringify(configuration))).toBeGreaterThan(MESSAGE_LIMITS.configurationBytes);
    expect(validateSnapshot(configuration)[0].code).toBe('message_limit');
    expect(validateRuntime(configuration)[0].code).toBe('message_limit');
  });

  it('preserves a legitimate maximum collection configuration on both validators', () => {
    const physicalPoints = Array.from({ length: MESSAGE_LIMITS.collectionEntries }, (_, i) => ({
      id: `p${i}`,
      hardwareProfile: '879-3000',
      channel: i,
    }));
    const logicalChannels = physicalPoints.map(({ id }) => ({
      id: `c${id}`,
      physicalPointId: id,
      profile: 'generic-digital-output',
      capabilities: ['output'],
      disconnectPolicy: { mode: 'hold' },
    }));
    const configuration = { version: 1, physicalPoints, logicalChannels };
    expect(validateSnapshot(configuration)).toEqual([]);
    expect(validateRuntime(configuration)).toEqual([]);
    configuration.physicalPoints.push({ id: 'excess', hardwareProfile: '879-3000', channel: 256 });
    expect(validateSnapshot(configuration)[0].code).toBe('message_limit');
    expect(validateRuntime(configuration)[0].code).toBe('message_limit');
  });

  it.each([false, true])(
    'round-trips boundary states with read failure=%s and rejects the next channel',
    async (failReads) => {
      const count = Math.floor((MESSAGE_LIMITS.operationalBytes - MESSAGE_LIMITS.stateEnvelopeBytes) / (3 * 130 + 16));
      const configuration: Snapshot = {
        version: 1,
        physicalPoints: [{ id: 'p', hardwareProfile: '879-3000', channel: 0 }],
        logicalChannels: Array.from({ length: count }, (_, i) => ({
          id: 'x'.repeat(123) + String(i).padStart(5, '0'),
          physicalPointId: 'p',
          profile: 'generic-digital-output',
          capabilities: ['output'],
          disconnectPolicy: { mode: 'hold' },
        })),
      };
      expect(validateSnapshot(configuration)).toEqual([]);
      expect(validateRuntime(configuration)).toEqual([]);
      const outputs = Object.fromEntries(configuration.logicalChannels.map(({ id }) => [id, false]));
      const publish = jest.fn(async () => undefined);
      const runtime = new WagoRuntime({
        hardwareId: 'fixture',
        prefix: 'fixture',
        pairingCode: 'fixture',
        device: {
          read: async () => {
            if (failReads) throw new Error('unavailable'.repeat(1000));
            return false;
          },
          write: async () => undefined,
        },
        store: {
          load: async () => ({
            accepted: { revision: 1, contentHash: hash(configuration), snapshot: configuration },
            outputs,
            manualOutputChannelIds: Object.keys(outputs),
            commandIds: [],
          }),
          save: async () => undefined,
        },
        transport: { publish, subscribe: async () => undefined },
      });
      await runtime.start();
      const states = publish.mock.calls as unknown as Array<[string, unknown]>;
      const [topic, state] = states.filter(([topic]) => topic.endsWith('/state')).pop()!;
      const bytes = Buffer.from(JSON.stringify(state));
      expect(bytes.length).toBeGreaterThan(65_536);
      expect(bytes.length).toBeLessThanOrEqual(MESSAGE_LIMITS.operationalBytes);
      expect(parseOperationalMessage('fixture', topic, bytes)?.message.category).toBe('state');
      expect(state).toMatchObject({ readiness: { hardwareAvailable: !failReads, ready: !failReads } });
      configuration.logicalChannels.push({ ...configuration.logicalChannels[0], id: 'y'.repeat(128) });
      expect(validateSnapshot(configuration)[0].code).toBe('message_limit');
      expect(validateRuntime(configuration)[0].code).toBe('message_limit');
    },
  );

  it('rejects oversized bytes before JSON decoding without quoting the payload', () => {
    const parse = jest.spyOn(JSON, 'parse');
    expect(() => parseHeartbeat(Buffer.alloc(MESSAGE_LIMITS.operationalBytes + 1, 65))).toThrow('byte limit');
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it('accepts a maximum size valid wire document and rejects the next byte', () => {
    const body = JSON.stringify({ hardwareId: 'a', protocolVersion: '1.0.0', runtimeVersion: '1', capabilities: [] });
    expect(parseHeartbeat(Buffer.from(body.padEnd(MESSAGE_LIMITS.operationalBytes)))).toMatchObject({
      hardwareId: 'a',
    });
    expect(() => parseHeartbeat(Buffer.from(body.padEnd(MESSAGE_LIMITS.operationalBytes + 1)))).toThrow('byte limit');
  });

  it('rejects namespace separators, wildcards and control characters in identifiers', () => {
    expect(isIdentifier('a'.repeat(MESSAGE_LIMITS.identifierLength))).toBe(true);
    for (const id of ['a'.repeat(MESSAGE_LIMITS.identifierLength + 1), '#', '+', 'a/b', 'a\0b', ' a'])
      expect(isIdentifier(id)).toBe(false);
  });

  it('preserves synchronous callbacks and lets their own bounded queues handle bursts', () => {
    const admission = new MessageAdmission(1);
    const consume = jest.fn();
    for (let i = 0; i < 1000; i++) expect(admission.dispatch(1, 1, consume)).toBeUndefined();
    expect(consume).toHaveBeenCalledTimes(1000);
    expect(admission.pending).toBe(0);
    expect(admission.rejected).toBe(0);
  });

  it('does not retain excess work while an admitted operation is blocked, and releases on failure', async () => {
    const admission = new MessageAdmission(1);
    let release!: () => void;
    const first = admission.run(
      1,
      1,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const excess = jest.fn();
    await Promise.all(Array.from({ length: 1000 }, () => admission.run(1, 1, excess)));
    expect(excess).not.toHaveBeenCalled();
    expect(admission.pending).toBe(1);
    expect(admission.rejected).toBe(1000);
    release();
    await first;
    await expect(
      admission.run(1, 1, () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    expect(admission.pending).toBe(0);
  });
});
