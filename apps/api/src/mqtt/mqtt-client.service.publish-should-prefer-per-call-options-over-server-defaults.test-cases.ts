import * as mqtt from 'mqtt';
import { PublishTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerPublishShouldPreferPerCallOptionsOverServerDefaults(scope: PublishTestScope): void {
  it('should prefer per-call options over server defaults', async () => {
    // Arrange
    (scope.mockRepository.findOneBy as jest.Mock).mockResolvedValue({
      ...scope.mockServer,
      defaultPublishQos: 0,
      defaultPublishRetain: true,
    });
    const getOrCreateClientSpy = jest.spyOn(scope.service as unknown as MqttClientServicePrivate, 'getOrCreateClient');
    const mockClient = mqtt.connect({});
    getOrCreateClientSpy.mockResolvedValue(mockClient);

    const publishSpy = jest.spyOn(mockClient, 'publish');

    // Act
    await scope.service.publish(1, 'test/topic', 'test message', { qos: 2, retain: false });

    // Assert
    expect(publishSpy).toHaveBeenCalled();
    const args = (publishSpy.mock.calls[0] ?? []) as unknown[];
    const options = (args[2] ?? {}) as { qos?: number; retain?: boolean };
    expect(options.qos).toBe(2);
    expect(options.retain).toBe(false);
  });
}
