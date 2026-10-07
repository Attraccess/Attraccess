import * as mqtt from 'mqtt';
import { SubscribeTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerSubscribePromotesASharedTopicToTheHighestRequestedQoS(scope: SubscribeTestScope): void {
  it('promotes a shared topic to the highest requested QoS', async () => {
    const mockClient = mqtt.connect({});
    jest.spyOn(scope.service as unknown as MqttClientServicePrivate, 'getOrCreateClient').mockResolvedValue(mockClient);

    await scope.service.subscribe(1, 'sensors/+', 0);
    (mockClient.subscribe as jest.Mock).mockClear();
    await scope.service.subscribe(1, 'sensors/+', 2);

    expect(mockClient.subscribe).toHaveBeenCalledWith('sensors/+', { qos: 2 }, expect.any(Function));
  });
}
