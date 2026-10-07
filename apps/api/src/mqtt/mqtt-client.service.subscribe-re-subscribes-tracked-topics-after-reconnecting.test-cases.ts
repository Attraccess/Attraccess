import { Logger } from '@nestjs/common';
import { SubscribeTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerSubscribeReSubscribesTrackedTopicsAfterReconnecting(scope: SubscribeTestScope): void {
  it('re-subscribes tracked topics after reconnecting', async () => {
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'error').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());

    const servicePrivate = scope.service as unknown as MqttClientServicePrivate;
    const client = await servicePrivate.getOrCreateClient(1);
    await scope.service.subscribe(1, 'devices/#');
    (client.subscribe as jest.Mock).mockClear();

    client.emit('connect');

    expect(client.subscribe).toHaveBeenCalledWith('devices/#', { qos: 0 }, expect.any(Function));
  });
}
