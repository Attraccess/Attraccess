import * as mqtt from 'mqtt';
import { Logger } from '@nestjs/common';
import { SubscribeTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerSubscribeRecordsReconnectQoSOnlyAfterTheBrokerAcceptsTheSubscription(
  scope: SubscribeTestScope,
): void {
  it('records reconnect QoS only after the broker accepts the subscription', async () => {
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'error').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());

    const servicePrivate = scope.service as unknown as MqttClientServicePrivate;
    const client = await servicePrivate.getOrCreateClient(1);
    servicePrivate.subscriptions.set(1, new Map([['devices/#', { qosCounts: new Map([[0, 1]]), effectiveQos: 2 }]]));
    client.subscribe = jest.fn(
      (_topic: string, _options: mqtt.IClientSubscribeOptions, callback?: (error?: Error) => void) => {
        callback?.(new Error('Subscribe error'));
      },
    );

    client.emit('connect');

    expect(servicePrivate.subscriptions.get(1)?.get('devices/#')?.effectiveQos).toBeUndefined();
  });
}
