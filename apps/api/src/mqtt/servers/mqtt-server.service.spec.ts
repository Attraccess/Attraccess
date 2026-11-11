import { MqttServerChangedEvent } from '../mqtt-server-changed.event';
import { MqttServerService } from './mqtt-server.service';

const ACTOR = { id: 1, authenticationMethod: 'session' as const };
const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };

describe('MqttServerService change events', () => {
  const server = { id: 4, name: 'Broker', host: 'old', password: null };
  const repository = {
    findOne: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const emit = jest.fn();
  let service: MqttServerService;

  beforeEach(() => {
    jest.resetAllMocks();
    repository.findOne.mockImplementation(async () => ({ ...server }));
    repository.save.mockImplementation(async (value) => value);
    service = new MqttServerService(
      repository as never,
      { encrypt: (value: string) => `enc:${value}`, decryptIfEncrypted: (value: string) => value } as never,
      { mqttServersTotal: { inc: jest.fn(), dec: jest.fn() } } as never,
      { emit } as never,
      audit as never,
    );
  });

  it('announces an update after it was saved, so connections with old settings close', async () => {
    await service.update(4, { host: 'new' } as never, ACTOR);
    expect(repository.save).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(MqttServerChangedEvent.EVENT_NAME, new MqttServerChangedEvent(4));
    expect(repository.save.mock.invocationCallOrder[0]).toBeLessThan(emit.mock.invocationCallOrder[0]);
  });

  it('announces nothing for a change that keeps the connection settings', async () => {
    await service.update(4, { name: 'Renamed', defaultPublishQos: 1 } as never, ACTOR);
    expect(repository.save).toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('announces a new password', async () => {
    await service.update(4, { password: 'secret' } as never, ACTOR);
    expect(emit).toHaveBeenCalledWith(MqttServerChangedEvent.EVENT_NAME, new MqttServerChangedEvent(4));
  });

  it('announces a deletion', async () => {
    await service.remove(4, ACTOR);
    expect(repository.remove).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(MqttServerChangedEvent.EVENT_NAME, new MqttServerChangedEvent(4));
  });

  it('announces nothing when the server does not exist', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.update(9, {} as never, ACTOR)).rejects.toMatchObject({ status: 404 });
    await expect(service.remove(9, ACTOR)).rejects.toMatchObject({ status: 404 });
    expect(emit).not.toHaveBeenCalled();
  });
});
