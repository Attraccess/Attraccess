import { EventEmitter } from 'node:events';
import * as mqtt from 'mqtt';
import { MqttExplorerConnectionsService } from './mqtt-explorer-connections.service';
import { CONNECTION_GRACE_MS } from './mqtt-explorer.constants';

jest.mock('mqtt', () => ({ connect: jest.fn() }));

class FakeClient extends EventEmitter {
  connected = false;
  subscribe = jest.fn((_filter: string, _options: unknown, callback: (error?: Error) => void) => callback());
  unsubscribe = jest.fn((_filter: string, callback: (error?: Error) => void) => callback());
  end = jest.fn();
  connect() {
    this.connected = true;
    this.emit('connect');
  }
}

describe('MqttExplorerConnectionsService', () => {
  const findOneBy = jest.fn();
  const resolveServerPassword = jest.fn();
  const clients: FakeClient[] = [];
  let service: MqttExplorerConnectionsService;

  const flush = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    clients.length = 0;
    findOneBy.mockResolvedValue({
      id: 1,
      name: 'Broker',
      host: 'broker',
      port: 1883,
      username: 'u',
      clientId: 'flows',
    });
    resolveServerPassword.mockResolvedValue('secret');
    (mqtt.connect as jest.Mock).mockImplementation(() => {
      const client = new FakeClient();
      clients.push(client);
      return client;
    });
    service = new MqttExplorerConnectionsService({ findOneBy } as never, { resolveServerPassword } as never);
  });
  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  const open = async (filter = '#', handler = jest.fn()) => {
    const pending = service.subscribe(1, filter, handler);
    await flush();
    clients[0].connect();
    return { subscription: await pending, handler };
  };

  it('connects with its own short clean-session client id, not the flow connection identity', async () => {
    await open();
    const [url, options] = (mqtt.connect as jest.Mock).mock.calls[0];
    expect(url).toBe('mqtt://broker:1883');
    expect(options.clientId).toMatch(/^attraccess-x-[0-9a-f]{10}$/);
    expect(options.clientId.length).toBeLessThanOrEqual(23);
    expect(options).toMatchObject({ clean: true, username: 'u', password: 'secret' });
  });

  it('opens one connection for concurrent viewers and subscribes each filter once', async () => {
    const first = service.subscribe(1, 'a/#', jest.fn());
    const second = service.subscribe(1, 'a/#', jest.fn());
    const third = service.subscribe(1, 'b/#', jest.fn());
    await flush();
    clients[0].connect();
    await Promise.all([first, second, third]);
    expect(mqtt.connect).toHaveBeenCalledTimes(1);
    expect(clients[0].subscribe.mock.calls.map(([filter]) => filter)).toEqual(['a/#', 'b/#']);
    expect(service.openConnectionCount).toBe(1);
  });

  it('routes a message to the handlers whose filters match it', async () => {
    const all = jest.fn();
    const only = jest.fn();
    const pendingAll = service.subscribe(1, '#', all);
    const pendingOnly = service.subscribe(1, 'a/b', only);
    await flush();
    clients[0].connect();
    await Promise.all([pendingAll, pendingOnly]);
    clients[0].emit('message', 'a/b', Buffer.from('1'));
    clients[0].emit('message', 'x/y', Buffer.from('2'));
    expect(all).toHaveBeenCalledTimes(2);
    expect(only).toHaveBeenCalledTimes(1);
    expect(only).toHaveBeenCalledWith('a/b', Buffer.from('1'));
  });

  it('closes after the grace period once the last viewer left, and not before', async () => {
    const { subscription } = await open();
    subscription.unsubscribe();
    expect(clients[0].unsubscribe).toHaveBeenCalledWith('#', expect.any(Function));
    jest.advanceTimersByTime(CONNECTION_GRACE_MS - 1);
    expect(clients[0].end).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(clients[0].end).toHaveBeenCalledWith(true);
    expect(service.openConnectionCount).toBe(0);
  });

  it('keeps the connection when a viewer returns within the grace period', async () => {
    const { subscription } = await open();
    subscription.unsubscribe();
    jest.advanceTimersByTime(CONNECTION_GRACE_MS / 2);
    const again = service.subscribe(1, '#', jest.fn());
    await again;
    jest.advanceTimersByTime(CONNECTION_GRACE_MS * 2);
    expect(mqtt.connect).toHaveBeenCalledTimes(1);
    expect(clients[0].end).not.toHaveBeenCalled();
  });

  it('closes only after every viewer left', async () => {
    const { subscription } = await open('a');
    const other = await service.subscribe(1, 'b', jest.fn());
    subscription.unsubscribe();
    jest.advanceTimersByTime(CONNECTION_GRACE_MS * 2);
    expect(clients[0].end).not.toHaveBeenCalled();
    other.unsubscribe();
    jest.advanceTimersByTime(CONNECTION_GRACE_MS);
    expect(clients[0].end).toHaveBeenCalled();
  });

  it('subscribes again after a reconnect, because the session is clean', async () => {
    await open('a/#');
    clients[0].subscribe.mockClear();
    clients[0].emit('connect');
    expect(clients[0].subscribe).toHaveBeenCalledWith('a/#', { qos: 0 }, expect.any(Function));
  });

  it('fails the viewer, drops the connection and retries fresh when the broker is unreachable', async () => {
    const failing = service.subscribe(1, '#', jest.fn());
    const failure = failing.catch((error: Error) => error);
    await flush();
    jest.advanceTimersByTime(10_000);
    expect(await failure).toBeInstanceOf(Error);
    expect(clients[0].end).toHaveBeenCalledWith(true);
    expect(service.openConnectionCount).toBe(0);

    const retry = service.subscribe(1, '#', jest.fn());
    await flush();
    clients[1].connect();
    await retry;
    expect(mqtt.connect).toHaveBeenCalledTimes(2);
  });

  it('fails when the server does not exist, without opening a connection', async () => {
    findOneBy.mockResolvedValue(null);
    await expect(service.subscribe(9, '#', jest.fn())).rejects.toThrow();
    expect(mqtt.connect).not.toHaveBeenCalled();
    expect(service.openConnectionCount).toBe(0);
  });

  it('fails the viewer and releases the filter when the broker refuses the subscription', async () => {
    const pending = service.subscribe(1, '#', jest.fn());
    await flush();
    clients[0].subscribe.mockImplementationOnce((_f, _o, callback: (error?: Error) => void) =>
      callback(new Error('no')),
    );
    clients[0].connect();
    await expect(pending).rejects.toThrow('no');
    jest.advanceTimersByTime(CONNECTION_GRACE_MS);
    expect(clients[0].end).toHaveBeenCalled();
  });

  it('closes every connection on shutdown', async () => {
    await open();
    service.onModuleDestroy();
    expect(clients[0].end).toHaveBeenCalledWith(true);
    expect(service.openConnectionCount).toBe(0);
  });
});
