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
  const old = { username: 'wago-controller-fixture', password: 'old-fixture', prefix: 'attraccess/wago' };
  const next = { ...old, password: 'new-fixture' };
  const topic = 'attraccess/wago/v1/controllers/fixture/credentials/rotate';
  const input = { username: next.username, password: next.password, revision: 1, token: 'a'.repeat(43) };
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
      { revision: 1, token: input.token, status: 'reconnected' },
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
});
