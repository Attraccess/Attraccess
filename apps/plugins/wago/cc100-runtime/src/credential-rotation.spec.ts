import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryDeviceAdapter } from './adapters';
import { JsonStateStore, WagoRuntime, type DiscoveryClaim, type Transport } from './runtime';

describe('runtime credential rotation persistence and reconnect acknowledgement', () => {
  let directory: string;
  let store: JsonStateStore;
  let runtime: WagoRuntime;
  const listeners = new Map<string, (payload: Buffer) => void | Promise<void>>();
  const publish = jest.fn();
  const reconnect = jest.fn();
  const credentialEpoch = '11111111-1111-4111-8111-111111111111';
  const old = {
    credentialEpoch,
    username: 'wago-controller-fixture',
    password: 'old-fixture',
    prefix: 'attraccess/wago',
  };
  const next = { ...old, password: 'new-fixture' };
  const topic = 'attraccess/wago/v1/controllers/fixture/credentials/rotate';
  const input = {
    username: next.username,
    password: next.password,
    revision: 1,
    token: 'a'.repeat(43),
    credentialEpoch,
    expiresAt: '',
  };
  const transport: Transport = {
    publish,
    subscribe: async (name, listener) => {
      listeners.set(name, listener);
    },
  };
  const create = () =>
    new WagoRuntime({
      hardwareId: 'fixture',
      prefix: old.prefix,
      pairingCode: 'fixture',
      store,
      transport,
      device: new MemoryDeviceAdapter(),
      reconnectCredentials: reconnect,
    });
  const send = async (value: unknown) => {
    await listeners.get(topic)?.(Buffer.from(JSON.stringify(value)));
  };

  beforeEach(async () => {
    input.expiresAt = new Date(Date.now() + 30_000).toISOString();
    jest.clearAllMocks();
    listeners.clear();
    directory = await mkdtemp(join(tmpdir(), 'wago-rotation-fixture-'));
    store = new JsonStateStore(join(directory, 'state.json'));
    await store.save({ credentials: old, outputs: {}, commandIds: [] });
    publish.mockResolvedValue(undefined);
    reconnect.mockResolvedValue(undefined);
    runtime = create();
    await runtime.start();
    publish.mockClear();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it('persists before reconnect and never acknowledges on the old authenticated connection', async () => {
    reconnect.mockImplementation(async (credentials: DiscoveryClaim) => {
      expect((await store.load()).credentials).toEqual(next);
      expect(credentials).toEqual(next);
      await runtime.acknowledgeCredentialRotation(old);
    });
    await send(input);
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalledWith(`${topic}/ack`, expect.anything(), expect.anything());
    await runtime.acknowledgeCredentialRotation(next);
    expect(publish).toHaveBeenCalledWith(
      `${topic}/ack`,
      { revision: 1, token: input.token, credentialEpoch, status: 'reconnected' },
      { retain: true },
    );
  });

  it('replays its completion after process restart and rejects superseded credential handoffs', async () => {
    await send(input);
    runtime = create();
    await runtime.start();
    await runtime.acknowledgeCredentialRotation(next);
    expect(publish).toHaveBeenCalledWith(`${topic}/ack`, expect.objectContaining({ token: input.token }), {
      retain: true,
    });
    await send({ ...input, revision: 2, token: 'b'.repeat(43), password: 'third-fixture' });
    const saved = await store.load();
    reconnect.mockClear();
    await send(input);
    await send({ ...input, revision: 2 });
    expect(reconnect).not.toHaveBeenCalled();
    expect(await store.load()).toEqual(saved);
  });

  it('retries the same handoff after persistence failure without prematurely reconnecting', async () => {
    const save = jest.spyOn(store, 'save').mockRejectedValueOnce(new Error('fixture_disk_full'));
    await expect(send(input)).rejects.toThrow('fixture_disk_full');
    expect(reconnect).not.toHaveBeenCalled();
    await send(input);
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect((await store.load()).credentials).toEqual(next);
    save.mockRestore();
  });

  it.each([{ revision: 0 }, { username: 'another-controller' }, { token: 'short' }, { password: '' }])(
    'ignores invalid rotation %j',
    async (change) => {
      await send({ ...input, ...change });
      expect(reconnect).not.toHaveBeenCalled();
      expect((await store.load()).credentials).toEqual(old);
    },
  );

  it('binds revisions to a fresh enrollment epoch without accepting old-epoch replay', async () => {
    await send({ ...input, revision: 2 });
    const nextEpoch = '22222222-2222-4222-8222-222222222222';
    await expect(
      runtime.receiveDiscoveryClaim(
        Buffer.from(
          JSON.stringify({
            username: old.username,
            password: 'fresh-claim',
            credentialEpoch: nextEpoch,
            configuration: { namespace: old.prefix },
            expiresAt: input.expiresAt,
          }),
        ),
      ),
    ).resolves.toMatchObject({ credentialEpoch: nextEpoch });
    expect((await store.load()).credentialRotation).toBeUndefined();
    await send({ ...input, credentialEpoch: nextEpoch, password: 'fresh-rotation' });
    expect((await store.load()).credentialRotation?.revision).toBe(1);
    reconnect.mockClear();
    await send({ ...input, revision: 3 });
    expect(reconnect).not.toHaveBeenCalled();
    expect((await store.load()).credentials?.password).toBe('fresh-rotation');
  });

  it('does not downgrade an enrolled epoch or reset a rotation with a replayed same-epoch claim', async () => {
    await send(input);
    await expect(
      runtime.receiveDiscoveryClaim(
        Buffer.from(JSON.stringify({ username: old.username, password: old.password, credentialEpoch })),
      ),
    ).resolves.toBeUndefined();
    await expect(
      runtime.receiveDiscoveryClaim(Buffer.from(JSON.stringify({ username: old.username, password: old.password }))),
    ).resolves.toBeUndefined();
    expect((await store.load()).credentials).toEqual(next);
    expect((await store.load()).credentialRotation?.revision).toBe(1);
  });

  it.each([undefined, 'invalid', new Date(0).toISOString()])(
    'rejects missing or invalid rotation expiry %p',
    async (expiresAt) => {
      await send({ ...input, expiresAt });
      expect(reconnect).not.toHaveBeenCalled();
      expect((await store.load()).credentials).toEqual(old);
    },
  );

  it('rejects a rotation that expires while queued behind another disk write', async () => {
    let time = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => time);
    let finish!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const save = store.save.bind(store);
    jest.spyOn(store, 'save').mockImplementationOnce(async (value) => {
      entered();
      await pending;
      await save(value);
    });
    const prior = runtime.receiveClaim(old);
    await started;
    const handoff = send(input);
    await new Promise((resolve) => setImmediate(resolve));
    time += 30_001;
    finish();
    await Promise.all([prior, handoff]);
    expect(reconnect).not.toHaveBeenCalled();
    expect((await store.load()).credentials).toEqual(old);
  });

  it('continues core startup when rotation ACL is missing and advertises rotation only after retry succeeds', async () => {
    let permitted = false;
    const runtime = new WagoRuntime({
      hardwareId: 'fixture',
      prefix: old.prefix,
      pairingCode: 'fixture',
      store,
      device: new MemoryDeviceAdapter(),
      reconnectCredentials: reconnect,
      transport: {
        publish,
        subscribe: async (name, listener) => {
          if (name === topic && !permitted) throw new Error('fixture_acl_denied');
          listeners.set(name, listener);
        },
      },
    });
    publish.mockClear();
    await expect(runtime.start()).resolves.toBeUndefined();
    expect(publish.mock.calls.find(([name]) => name.endsWith('/heartbeat'))?.[1].capabilities).not.toContain(
      'credential-rotation-v1',
    );
    permitted = true;
    await runtime.retryCredentialRotationSubscription();
    publish.mockClear();
    await runtime.publishHeartbeat();
    expect(publish.mock.calls.find(([name]) => name.endsWith('/heartbeat'))?.[1].capabilities).toContain(
      'credential-rotation-v1',
    );
  });
});
