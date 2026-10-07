import * as mqtt from 'mqtt';
import { PublishTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerPublishShouldUseServerDefaultsWhenNoOptionsAreProvided(scope: PublishTestScope): void {
  it('should use server defaults when no options are provided', async () => {
    // Arrange
    (scope.mockRepository.findOneBy as jest.Mock).mockResolvedValue({
      ...scope.mockServer,
      defaultPublishQos: 1,
      defaultPublishRetain: true,
    });
    const getOrCreateClientSpy = jest.spyOn(scope.service as unknown as MqttClientServicePrivate, 'getOrCreateClient');
    const mockClient = mqtt.connect({});
    getOrCreateClientSpy.mockResolvedValue(mockClient);

    // Spy on publish call args
    const publishSpy = jest.spyOn(mockClient, 'publish');

    // Act
    await scope.service.publish(1, 'test/topic', 'test message');

    // Assert
    expect(publishSpy).toHaveBeenCalled();
    const args = (publishSpy.mock.calls[0] ?? []) as unknown[];
    const options = (args[2] ?? {}) as { qos?: number; retain?: boolean };
    expect(options.qos).toBe(1);
    expect(options.retain).toBe(true);
  });
}
