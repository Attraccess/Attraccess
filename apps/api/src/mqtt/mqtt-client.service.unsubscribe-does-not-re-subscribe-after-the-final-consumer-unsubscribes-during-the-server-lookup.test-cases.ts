import * as mqtt from 'mqtt';
import { UnsubscribeTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerUnsubscribeDoesNotReSubscribeAfterTheFinalConsumerUnsubscribesDuringTheServerLookup(
  scope: UnsubscribeTestScope,
): void {
  it('does not re-subscribe after the final consumer unsubscribes during the server lookup', async () => {
    const mockClient = mqtt.connect({});
    let resolveServerLookup!: (server: typeof scope.mockServer) => void;
    (scope.mockRepository.findOneBy as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<typeof scope.mockServer>((resolve) => {
          resolveServerLookup = resolve;
        }),
    );
    (scope.service as unknown as MqttClientServicePrivate).clients.set(1, mockClient);
    (scope.service as unknown as MqttClientServicePrivate).subscriptions.set(
      1,
      new Map([
        [
          'sensors/+',
          {
            qosCounts: new Map<0 | 1 | 2 | undefined, number>([
              [0, 1],
              [2, 1],
            ]),
            effectiveQos: 2,
          },
        ],
      ]),
    );

    const lowerQos = scope.service.unsubscribe(1, 'sensors/+', 2);
    await new Promise(setImmediate);
    const finalUnsubscribe = scope.service.unsubscribe(1, 'sensors/+', 0);
    resolveServerLookup(scope.mockServer);
    await Promise.all([lowerQos, finalUnsubscribe]);

    expect(mockClient.subscribe).not.toHaveBeenCalled();
    expect(mockClient.unsubscribe).toHaveBeenCalledWith('sensors/+', expect.any(Function));
  });
}
