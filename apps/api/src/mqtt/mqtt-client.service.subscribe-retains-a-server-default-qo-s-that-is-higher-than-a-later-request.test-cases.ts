import * as mqtt from 'mqtt';
import { SubscribeTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerSubscribeRetainsAServerDefaultQoSThatIsHigherThanALaterRequest(
  scope: SubscribeTestScope,
): void {
  it('retains a server default QoS that is higher than a later request', async () => {
    (scope.mockRepository.findOneBy as jest.Mock).mockResolvedValue({ ...scope.mockServer, defaultSubscribeQos: 2 });
    const mockClient = mqtt.connect({});
    jest.spyOn(scope.service as unknown as MqttClientServicePrivate, 'getOrCreateClient').mockResolvedValue(mockClient);

    await scope.service.subscribe(1, 'sensors/+');
    (mockClient.subscribe as jest.Mock).mockClear();
    await scope.service.subscribe(1, 'sensors/+', 1);

    expect(mockClient.subscribe).not.toHaveBeenCalled();
    expect(
      (scope.service as unknown as MqttClientServicePrivate).subscriptions.get(1)?.get('sensors/+')?.effectiveQos,
    ).toBe(2);
  });
}
