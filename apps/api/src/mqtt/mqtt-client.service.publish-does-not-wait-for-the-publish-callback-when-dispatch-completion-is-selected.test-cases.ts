import * as mqtt from 'mqtt';
import { PublishTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerPublishDoesNotWaitForThePublishCallbackWhenDispatchCompletionIsSelected(
  scope: PublishTestScope,
): void {
  it('does not wait for the publish callback when dispatch completion is selected', async () => {
    const getOrCreateClientSpy = jest.spyOn(scope.service as unknown as MqttClientServicePrivate, 'getOrCreateClient');
    const mockClient = mqtt.connect({});
    getOrCreateClientSpy.mockResolvedValue(mockClient);
    mockClient.publish = jest.fn();

    await expect(
      scope.service.publish(1, 'test/topic', 'test message', undefined, { awaitAcknowledgement: false }),
    ).resolves.toBeUndefined();

    expect(scope.mockExternalCallTimer.time).toHaveBeenCalledWith('mqtt', 'publish', expect.any(Function));
    expect(mockClient.publish).toHaveBeenCalledWith(
      'test/topic',
      'test message',
      expect.any(Object),
      expect.any(Function),
    );
  });
}
