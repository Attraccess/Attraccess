import * as mqtt from 'mqtt';
import { UnsubscribeTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerUnsubscribeLowersASharedSubscriptionQoSWhenItsHighestQoSConsumerUnsubscribes(
  scope: UnsubscribeTestScope,
): void {
  it('lowers a shared subscription QoS when its highest-QoS consumer unsubscribes', async () => {
    const mockClient = mqtt.connect({});
    (scope.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
    await scope.service.subscribe(1, 'sensors/+', 0);
    await scope.service.subscribe(1, 'sensors/+', 2);
    (mockClient.subscribe as jest.Mock).mockClear();

    await scope.service.unsubscribe(1, 'sensors/+', 2);

    expect(mockClient.subscribe).toHaveBeenCalledWith('sensors/+', { qos: 0 }, expect.any(Function));
    expect(
      (scope.service as unknown as MqttClientServicePrivate).subscriptions.get(1)?.get('sensors/+')?.effectiveQos,
    ).toBe(0);
  });
}
