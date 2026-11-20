import { MqttServerChangedEvent } from '../mqtt-server-changed.event';
import { FakeMqttServerStore } from '../fake-mqtt-server.store';
import { MqttServerService } from './mqtt-server.service';

const ACTOR = { id: 1, authenticationMethod: 'session' as const };
const audit = { record: jest.fn() };

describe('MqttServerService change events', () => {
  const emit = jest.fn();
  let store: FakeMqttServerStore;
  let service: MqttServerService;

  beforeEach(async () => {
    jest.resetAllMocks();
    audit.record.mockResolvedValue({ status: 'recorded' });
    store = new FakeMqttServerStore();
    await store.createServer({ name: 'Broker', host: 'old', port: 1883 });
    service = new MqttServerService(
      store,
      { encrypt: (value: string) => `enc:${value}`, decryptIfEncrypted: (value: string) => value } as never,
      { mqttServersTotal: { inc: jest.fn(), dec: jest.fn() } } as never,
      { emit } as never,
      audit as never,
    );
  });

  it('announces an update after it was saved, so connections with old settings close', async () => {
    const save = jest.spyOn(store, 'updateServer');
    await service.update(1, { host: 'new' } as never, ACTOR);
    expect(save).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(MqttServerChangedEvent.EVENT_NAME, new MqttServerChangedEvent(1));
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(emit.mock.invocationCallOrder[0]);
    expect((await store.findServer(1))?.host).toBe('new');
  });

  it('announces nothing for a change that keeps the connection settings', async () => {
    await service.update(1, { name: 'Renamed', defaultPublishQos: 1 } as never, ACTOR);
    expect(await store.findServer(1)).toMatchObject({ name: 'Renamed', defaultPublishQos: 1 });
    expect(emit).not.toHaveBeenCalled();
  });

  it('announces a new password and stores it encrypted', async () => {
    await service.update(1, { password: 'secret' } as never, ACTOR);
    expect(emit).toHaveBeenCalledWith(MqttServerChangedEvent.EVENT_NAME, new MqttServerChangedEvent(1));
    expect((await store.findServer(1))?.password).toBe('enc:secret');
  });

  it('announces a deletion', async () => {
    await service.remove(1, ACTOR);
    expect(await store.findServer(1)).toBeNull();
    expect(emit).toHaveBeenCalledWith(MqttServerChangedEvent.EVENT_NAME, new MqttServerChangedEvent(1));
  });

  it('announces nothing when the server does not exist', async () => {
    await expect(service.update(9, {} as never, ACTOR)).rejects.toMatchObject({ status: 404 });
    await expect(service.remove(9, ACTOR)).rejects.toMatchObject({ status: 404 });
    expect(emit).not.toHaveBeenCalled();
  });
});
