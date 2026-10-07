import * as mqtt from 'mqtt';
import { UnsubscribeTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerUnsubscribePreservesTheBrokerQoSWhenLoweringTheSubscriptionIsRejected(
  scope: UnsubscribeTestScope,
): void {
  it('preserves the broker QoS when lowering the subscription is rejected', async () => {
    const mockClient = mqtt.connect({});
    (scope.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
    await scope.service.subscribe(1, 'sensors/+', 0);
    await scope.service.subscribe(1, 'sensors/+', 2);
    mockClient.subscribe = jest.fn(
      (_topic: string, _options: mqtt.IClientSubscribeOptions, callback?: (error?: Error) => void) => {
        callback?.(new Error('Subscribe error'));
      },
    );

    await expect(scope.service.unsubscribe(1, 'sensors/+', 2)).rejects.toThrow('Subscribe error');

    expect(
      (scope.service as unknown as MqttClientServicePrivate).subscriptions.get(1)?.get('sensors/+')?.effectiveQos,
    ).toBe(2);
  });
}
