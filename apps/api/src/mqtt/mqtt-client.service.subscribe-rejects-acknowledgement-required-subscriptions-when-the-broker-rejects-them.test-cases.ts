import * as mqtt from 'mqtt';
import { SubscribeTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerSubscribeRejectsAcknowledgementRequiredSubscriptionsWhenTheBrokerRejectsThem(
  scope: SubscribeTestScope,
): void {
  it('rejects acknowledgement-required subscriptions when the broker rejects them', async () => {
    const mockClient = mqtt.connect({});
    mockClient.subscribe = jest.fn(
      (_topic: string, _options: mqtt.IClientSubscribeOptions, callback?: (error?: Error) => void) => {
        callback?.(new Error('Subscribe error'));
      },
    );
    jest.spyOn(scope.service as unknown as MqttClientServicePrivate, 'getOrCreateClient').mockResolvedValue(mockClient);

    await expect(scope.service.subscribe(1, 'sensors/+', undefined, true)).rejects.toThrow('Subscribe error');
  });
}
