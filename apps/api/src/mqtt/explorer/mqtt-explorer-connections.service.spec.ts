import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import * as mqtt from 'mqtt';
import { MqttServerChangedEvent } from '../mqtt-server-changed.event';
import {
  ExplorerConnectionReset,
  ExplorerViewer,
  MqttExplorerConnectionsService,
} from './mqtt-explorer-connections.service';
import { CONNECT_TIMEOUT_MS, CONNECTION_GRACE_MS } from './mqtt-explorer.constants';

jest.mock('mqtt', () => ({ connect: jest.fn() }));

class FakeClient extends EventEmitter {
  connected = false;
  reconnectSuppressed = false;
  subscribe = jest.fn((_filter: string, _options: unknown, callback: (error?: Error) => void) => callback());
  end = jest.fn();
  connect() {
    this.connected = true;
    this.emit('connect');
  }
}

const viewer = (): jest.Mocked<ExplorerViewer> => ({ onMessage: jest.fn(), onError: jest.fn() });

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
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    clients.length = 0;
    findOneBy.mockImplementation(async ({ id }: { id: number }) => ({
      id,
      name: 'Broker',
      host: 'broker',
      port: 1883,
      username: 'u',
      clientId: 'flows',
    }));
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

  const open = async (filter = '#', watcher = viewer(), serverId = 1) => {
    const pending = service.subscribe(serverId, filter, watcher);
    await flush();
    clients[clients.length - 1].connect();
    return { subscription: await pending, watcher, client: clients[clients.length - 1] };
  };

  it('connects with its own short clean-session client id, not the flow connection identity', async () => {
    await open();
    const [url, options] = (mqtt.connect as jest.Mock).mock.calls[0];
    expect(url).toBe('mqtt://broker:1883');
    expect(options.clientId).toMatch(/^attraccess-x-[0-9a-f]{10}$/);
    expect(options.clientId.length).toBeLessThanOrEqual(23);
    // The service subscribes on every connect itself; mqtt.js must not do it a second time.
    expect(options).toMatchObject({ clean: true, resubscribe: false, username: 'u', password: 'secret' });
  });

  it('opens one connection per filter, shared by the viewers of that filter', async () => {
    const first = service.subscribe(1, 'a/#', viewer());
    const second = service.subscribe(1, 'a/#', viewer());
    const third = service.subscribe(1, 'b/#', viewer());
    await flush();
    clients.forEach((client) => client.connect());
    await Promise.all([first, second, third]);
    expect(mqtt.connect).toHaveBeenCalledTimes(2);
    expect(clients[0].subscribe.mock.calls.map(([filter]) => filter)).toEqual(['a/#']);
    expect(clients[1].subscribe.mock.calls.map(([filter]) => filter)).toEqual(['b/#']);
    const ids = (mqtt.connect as jest.Mock).mock.calls.map(([, options]) => options.clientId);
    expect(new Set(ids).size).toBe(2);
    expect(service.openConnectionCount).toBe(2);
  });

  it('keeps the same filter on different servers apart', async () => {
    await open('#', viewer(), 1);
    await open('#', viewer(), 2);
    expect(mqtt.connect).toHaveBeenCalledTimes(2);
    expect(service.openConnectionCount).toBe(2);
  });

  it('delivers a connection’s messages to its viewers only, and drops topics outside the filter', async () => {
    const all = await open('#');
    const only = await open('a/b');
    all.client.emit('message', 'a/b', Buffer.from('1'));
    only.client.emit('message', 'a/b', Buffer.from('1'));
    // A broker should never send this, but the filter still guards the viewers.
    only.client.emit('message', 'x/y', Buffer.from('2'));
    expect(all.watcher.onMessage).toHaveBeenCalledTimes(1);
    expect(only.watcher.onMessage).toHaveBeenCalledTimes(1);
    expect(only.watcher.onMessage).toHaveBeenCalledWith('a/b', Buffer.from('1'));
  });

  it('delivers messages that arrive before the subscription resolved (retained messages)', async () => {
    const watcher = viewer();
    const pending = service.subscribe(1, 'a', watcher);
    await flush();
    clients[0].subscribe.mockImplementationOnce((_f, _o, callback: (error?: Error) => void) => {
      clients[0].emit('message', 'a', Buffer.from('retained'));
      callback();
    });
    clients[0].connect();
    await pending;
    expect(watcher.onMessage).toHaveBeenCalledWith('a', Buffer.from('retained'));
  });

  it('closes after the grace period once the last viewer left, and not before', async () => {
    const { subscription, client } = await open();
    subscription.unsubscribe();
    subscription.unsubscribe();
    jest.advanceTimersByTime(CONNECTION_GRACE_MS - 1);
    expect(client.end).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(client.end).toHaveBeenCalledWith(true);
    expect(service.openConnectionCount).toBe(0);
  });

  it('keeps the connection when a viewer returns within the grace period', async () => {
    const { subscription } = await open();
    subscription.unsubscribe();
    jest.advanceTimersByTime(CONNECTION_GRACE_MS / 2);
    await service.subscribe(1, '#', viewer());
    jest.advanceTimersByTime(CONNECTION_GRACE_MS * 2);
    expect(mqtt.connect).toHaveBeenCalledTimes(1);
    expect(clients[0].end).not.toHaveBeenCalled();
    // An existing broker subscription: no second SUBSCRIBE.
    expect(clients[0].subscribe).toHaveBeenCalledTimes(1);
  });

  it('closes only after every viewer of the filter left', async () => {
    const { subscription, client } = await open('a');
    const other = await service.subscribe(1, 'a', viewer());
    subscription.unsubscribe();
    jest.advanceTimersByTime(CONNECTION_GRACE_MS * 2);
    expect(client.end).not.toHaveBeenCalled();
    other.unsubscribe();
    jest.advanceTimersByTime(CONNECTION_GRACE_MS);
    expect(client.end).toHaveBeenCalled();
  });

  it('subscribes again after a reconnect, because the session is clean', async () => {
    const { client } = await open('a/#');
    client.subscribe.mockClear();
    client.emit('connect');
    expect(client.subscribe).toHaveBeenCalledTimes(1);
    expect(client.subscribe).toHaveBeenCalledWith('a/#', { qos: 0 }, expect.any(Function));
  });

  it('fails the viewers when the broker refuses the subscription after a reconnect', async () => {
    const { client, watcher } = await open('a/#');
    client.subscribe.mockImplementationOnce((_f, _o, callback: (error?: Error) => void) => callback(new Error('no')));
    client.emit('connect');
    await flush();
    expect(watcher.onError).toHaveBeenCalledWith('failed');
    expect(client.end).toHaveBeenCalledWith(true);
    expect(service.openConnectionCount).toBe(0);
  });

  it('fails every viewer for good when mqtt.js stops reconnecting after a refused CONNACK', async () => {
    const { client, watcher } = await open('a/#');
    const second = viewer();
    await service.subscribe(1, 'a/#', second);
    client.reconnectSuppressed = true;
    client.emit('close');
    expect(watcher.onError).toHaveBeenCalledWith('failed');
    expect(second.onError).toHaveBeenCalledWith('failed');
    expect(client.end).toHaveBeenCalledWith(true);
    expect(service.openConnectionCount).toBe(0);
  });

  it('fails a pending viewer at once when the first CONNACK is refused', async () => {
    const pending = service.subscribe(1, '#', viewer());
    await flush();
    clients[0].reconnectSuppressed = true;
    clients[0].emit('close');
    await expect(pending).rejects.toThrow('refused');
  });

  it('keeps the viewers on a connection drop that mqtt.js will reconnect', async () => {
    const { client, watcher } = await open('a/#');
    client.emit('close');
    expect(watcher.onError).not.toHaveBeenCalled();
    expect(service.openConnectionCount).toBe(1);
  });

  it('fails the viewer, drops the connection and retries fresh when the broker is unreachable', async () => {
    const failing = service.subscribe(1, '#', viewer());
    const failure = failing.catch((error: Error) => error);
    await flush();
    jest.advanceTimersByTime(CONNECT_TIMEOUT_MS);
    expect(await failure).toBeInstanceOf(Error);
    expect(clients[0].end).toHaveBeenCalledWith(true);
    expect(service.openConnectionCount).toBe(0);

    const retry = service.subscribe(1, '#', viewer());
    await flush();
    clients[1].connect();
    await retry;
    expect(mqtt.connect).toHaveBeenCalledTimes(2);
  });

  it('fails when the server does not exist, without opening a connection', async () => {
    findOneBy.mockResolvedValue(null);
    await expect(service.subscribe(9, '#', viewer())).rejects.toThrow();
    expect(mqtt.connect).not.toHaveBeenCalled();
    expect(service.openConnectionCount).toBe(0);
  });

  it('fails every viewer that joined a pending subscription the broker then refused', async () => {
    const first = viewer();
    const second = viewer();
    const pendingFirst = service.subscribe(1, '#', first);
    const pendingSecond = service.subscribe(1, '#', second);
    await flush();
    clients[0].subscribe.mockImplementationOnce((_f, _o, callback: (error?: Error) => void) =>
      callback(new Error('no')),
    );
    clients[0].connect();
    await expect(pendingFirst).rejects.toThrow('no');
    await expect(pendingSecond).rejects.toThrow('no');
    expect(clients[0].subscribe).toHaveBeenCalledTimes(1);
    expect(clients[0].end).toHaveBeenCalledWith(true);
    expect(service.openConnectionCount).toBe(0);

    // The next viewer starts fresh.
    await open('#');
    expect(mqtt.connect).toHaveBeenCalledTimes(2);
  });

  it('a viewer joining after the subscription succeeded is not failed by an earlier error', async () => {
    const { watcher } = await open('#');
    const late = viewer();
    await expect(service.subscribe(1, '#', late)).resolves.toBeDefined();
    expect(watcher.onError).not.toHaveBeenCalled();
    expect(late.onError).not.toHaveBeenCalled();
  });

  it('resets a server: closes its connections and fails their viewers, leaving other servers alone', async () => {
    const one = await open('a', viewer(), 1);
    const other = await open('a', viewer(), 2);
    const pending = service.subscribe(1, 'b', viewer());
    await flush();
    service.onServerChanged(new MqttServerChangedEvent(1));
    expect(one.watcher.onError).toHaveBeenCalledWith('reset');
    expect(one.client.end).toHaveBeenCalledWith(true);
    await expect(pending).rejects.toBeInstanceOf(ExplorerConnectionReset);
    expect(other.watcher.onError).not.toHaveBeenCalled();
    expect(other.client.end).not.toHaveBeenCalled();
    expect(service.openConnectionCount).toBe(1);

    // The next viewer connects again (with the current settings).
    await open('a', viewer(), 1);
    expect(service.openConnectionCount).toBe(2);
  });

  it('closes every connection on shutdown', async () => {
    const { client } = await open();
    service.onModuleDestroy();
    expect(client.end).toHaveBeenCalledWith(true);
    expect(service.openConnectionCount).toBe(0);
  });
});
