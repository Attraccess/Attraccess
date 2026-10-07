import * as mqtt from 'mqtt';
import { UnsubscribeTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerUnsubscribeReconcilesAHigherQoSSubscriberAddedWhileALowerQoSUpdateIsPending(
  scope: UnsubscribeTestScope,
): void {
  it('reconciles a higher QoS subscriber added while a lower QoS update is pending', async () => {
    const mockClient = mqtt.connect({});
    (scope.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
    jest.spyOn(scope.service as unknown as MqttClientServicePrivate, 'getOrCreateClient').mockResolvedValue(mockClient);
    await scope.service.subscribe(1, 'sensors/+', 0);
    await scope.service.subscribe(1, 'sensors/+', 2);
    (mockClient.subscribe as jest.Mock).mockClear();

    let finishLowerQos!: () => void;
    mockClient.subscribe = jest.fn(
      (_topic: string, options: mqtt.IClientSubscribeOptions, callback?: (error?: Error) => void) => {
        if (options.qos === 0) {
          finishLowerQos = () => callback?.();
        } else {
          callback?.();
        }
      },
    );

    const lowerQos = scope.service.unsubscribe(1, 'sensors/+', 2);
    await new Promise(setImmediate);
    const raiseQos = scope.service.subscribe(1, 'sensors/+', 2);
    finishLowerQos();
    await Promise.all([lowerQos, raiseQos]);

    expect(mockClient.subscribe).toHaveBeenNthCalledWith(1, 'sensors/+', { qos: 0 }, expect.any(Function));
    expect(mockClient.subscribe).toHaveBeenNthCalledWith(2, 'sensors/+', { qos: 2 }, expect.any(Function));
    expect(
      (scope.service as unknown as MqttClientServicePrivate).subscriptions.get(1)?.get('sensors/+')?.effectiveQos,
    ).toBe(2);
  });
}
