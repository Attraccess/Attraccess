import * as mqtt from 'mqtt';
import { PublishTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerPublishShouldSuccessfullyPublishAMessage(scope: PublishTestScope): void {
  it('should successfully publish a message', async () => {
    // Arrange - mock the internal methods to avoid actual connections
    const getOrCreateClientSpy = jest.spyOn(scope.service as unknown as MqttClientServicePrivate, 'getOrCreateClient');
    const mockClient = mqtt.connect({});
    getOrCreateClientSpy.mockResolvedValue(mockClient);

    // Act
    await scope.service.publish(1, 'test/topic', 'test message');

    // Assert
    expect(getOrCreateClientSpy).toHaveBeenCalledWith(1);
    expect(mockClient.publish).toHaveBeenCalled();
  }, 10000);
}
