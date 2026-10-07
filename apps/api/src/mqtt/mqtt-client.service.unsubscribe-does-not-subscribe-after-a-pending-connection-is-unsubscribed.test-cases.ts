import * as mqtt from 'mqtt';
import { UnsubscribeTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerUnsubscribeDoesNotSubscribeAfterAPendingConnectionIsUnsubscribed(
  scope: UnsubscribeTestScope,
): void {
  it('does not subscribe after a pending connection is unsubscribed', async () => {
    const mockClient = mqtt.connect({});
    let connect!: (client: mqtt.MqttClient) => void;
    const pendingClient = new Promise<mqtt.MqttClient>((resolve) => {
      connect = resolve;
    });
    jest
      .spyOn(scope.service as unknown as MqttClientServicePrivate, 'getOrCreateClient')
      .mockReturnValue(pendingClient);

    const subscribe = scope.service.subscribe(1, 'sensors/+');
    await scope.service.unsubscribe(1, 'sensors/+');
    connect(mockClient);
    await subscribe;

    expect(mockClient.subscribe).not.toHaveBeenCalled();
  });
}
