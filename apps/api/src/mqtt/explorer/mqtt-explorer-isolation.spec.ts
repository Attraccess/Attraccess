import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventEmitter } from 'node:events';
import * as mqtt from 'mqtt';
import { MqttClientService } from '../mqtt-client.service';
import { MqttMessageEvent } from '../mqtt-message.event';
import { MqttExplorerConnectionsService } from './mqtt-explorer-connections.service';
import { MqttExplorerService } from './mqtt-explorer.service';

jest.mock('mqtt', () => ({ connect: jest.fn() }));

// The explorer must never touch the flow connection: every message there runs
// the flow trigger dispatcher, which queries the database once per message.
describe('MQTT explorer isolation from flows', () => {
  it('a # subscription causes no MqttMessageEvent and uses neither shared-client subscribe nor publish', async () => {
    const explorerClient = Object.assign(new EventEmitter(), {
      connected: true,
      subscribe: jest.fn((_f: string, _o: unknown, cb: (e?: Error) => void) => cb()),
      unsubscribe: jest.fn(),
      end: jest.fn(),
    });
    (mqtt.connect as jest.Mock).mockReturnValue(explorerClient);

    const emit = jest.fn();
    const sharedClient = new MqttClientService(
      { findOneBy: jest.fn() } as never,
      { emit } as unknown as EventEmitter2,
      {} as never,
      {} as never,
      {} as never,
    );
    const sharedSubscribe = jest.spyOn(sharedClient, 'subscribe');
    const sharedPublish = jest.spyOn(sharedClient, 'publish');

    const server = { id: 1, name: 'Broker', host: 'broker', port: 1883 };
    const repository = { findOneBy: jest.fn().mockResolvedValue(server) };
    jest.spyOn(sharedClient, 'resolveServerPassword').mockResolvedValue(null);
    const connections = new MqttExplorerConnectionsService(repository as never, sharedClient);
    const service = new MqttExplorerService(repository as never, connections, sharedClient, {
      recordAdministration: jest.fn(),
    } as never);

    const events: unknown[] = [];
    const stream = await service.subscribe({ id: 1 } as never, 1, '#');
    // Batches with messages only, not the empty one announcing the subscription.
    const viewer = stream.subscribe((event) => event.data.messages.length > 0 && events.push(event));
    await new Promise((resolve) => setImmediate(resolve));
    explorerClient.emit('connect');
    await new Promise((resolve) => setImmediate(resolve));
    explorerClient.emit('message', 'any/topic', Buffer.from('hello'));
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(events).toHaveLength(1);
    // Its own connection, never the flow connection's identity.
    expect(mqtt.connect).toHaveBeenCalledTimes(1);
    expect((mqtt.connect as jest.Mock).mock.calls[0][1].clientId).toMatch(/^attraccess-x-[0-9a-f]{10}$/);
    expect(emit).not.toHaveBeenCalledWith(MqttMessageEvent.EVENT_NAME, expect.anything());
    expect(emit).not.toHaveBeenCalled();
    expect(sharedSubscribe).not.toHaveBeenCalled();
    expect(sharedPublish).not.toHaveBeenCalled();

    viewer.unsubscribe();
    connections.onModuleDestroy();
  });
});
