import * as mqtt from 'mqtt';
import { UnsubscribeTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerUnsubscribeRemovesTheTopicFromReconnectSubscriptionsAndTheActiveClient(
  scope: UnsubscribeTestScope,
): void {
  it('removes the topic from reconnect subscriptions and the active client', async () => {
    const mockClient = mqtt.connect({});
    (scope.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
    await scope.service.subscribe(1, 'sensors/+');

    await scope.service.unsubscribe(1, 'sensors/+');

    expect(mockClient.unsubscribe).toHaveBeenCalledWith('sensors/+', expect.any(Function));
  });
}
