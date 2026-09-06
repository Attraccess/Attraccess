import { MemoryDeviceAdapter } from './adapters';
import { WagoRuntime, type RuntimeState } from './runtime';

describe('bounded discovery claim expiry', () => {
  const now = Date.parse('2026-09-06T12:00:00.000Z');
  const claim = { username: 'fixture', password: 'synthetic-only', acknowledgementToken: 'fixture-token' };
  let time: number;
  let state: RuntimeState;
  const save = jest.fn();
  const publish = jest.fn();
  const load = jest.fn();
  let runtime: WagoRuntime;
  beforeEach(() => {
    jest.clearAllMocks();
    time = now;
    jest.spyOn(Date, 'now').mockImplementation(() => time);
    state = { outputs: {}, commandIds: [] };
    load.mockImplementation(async () => structuredClone(state));
    save.mockImplementation(async (value) => {
      state = structuredClone(value);
    });
    publish.mockResolvedValue(undefined);
    runtime = new WagoRuntime({
      hardwareId: 'fixture',
      prefix: 'attraccess/wago',
      pairingCode: 'fixture',
      store: { load, save },
      transport: { publish, subscribe: async () => undefined },
      device: new MemoryDeviceAdapter(),
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([undefined, new Date(now + 30_000).toISOString()])(
    'accepts a legacy or current expiring claim (%p)',
    async (expiresAt) => {
      await expect(
        runtime.receiveDiscoveryClaim(Buffer.from(JSON.stringify({ ...claim, expiresAt }))),
      ).resolves.toEqual({ username: claim.username, password: claim.password });
      expect(state.credentials?.username).toBe('fixture');
      expect(publish).toHaveBeenCalledWith('attraccess/wago/discovery/fixture/claim/ack', {
        acknowledgementToken: 'fixture-token',
      });
      await runtime.publishDiscoveryAnnouncement();
      expect(publish).toHaveBeenCalledWith(
        'attraccess/wago/discovery/fixture',
        expect.objectContaining({ capabilities: expect.arrayContaining(['claim-expiry-v1']) }),
        { retain: true },
      );
    },
  );

  it.each([
    null,
    'tomorrow',
    '2026-02-30T12:00:00.000Z',
    new Date(now).toISOString(),
    new Date(now - 1).toISOString(),
    new Date(now + 60_001).toISOString(),
  ])('rejects invalid or expired expiry %p before persistence', async (expiresAt) => {
    await expect(
      runtime.receiveDiscoveryClaim(Buffer.from(JSON.stringify({ ...claim, expiresAt }))),
    ).resolves.toBeUndefined();
    expect(save).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('rechecks expiry after the state read before credential persistence', async () => {
    load.mockImplementation(async () => {
      time += 10_000;
      return structuredClone(state);
    });
    await expect(
      runtime.receiveDiscoveryClaim(
        Buffer.from(JSON.stringify({ ...claim, expiresAt: new Date(now + 5_000).toISOString() })),
      ),
    ).resolves.toBeUndefined();
    expect(save).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
