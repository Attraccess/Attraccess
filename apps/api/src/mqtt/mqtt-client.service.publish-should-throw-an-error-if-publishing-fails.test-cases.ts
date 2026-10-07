import * as mqtt from 'mqtt';
import { PublishTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerPublishShouldThrowAnErrorIfPublishingFails(scope: PublishTestScope): void {
  it('should throw an error if publishing fails', async () => {
    // Arrange - mock the client to throw an error on publish
    const getOrCreateClientSpy = jest.spyOn(scope.service as unknown as MqttClientServicePrivate, 'getOrCreateClient');
    const mockClient = mqtt.connect({});
    getOrCreateClientSpy.mockResolvedValue(mockClient);

    // Make publish callback throw an error
    mockClient.publish = jest
      .fn()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((topic: string, message: string, optionsOrCb?: any, cb?: (err?: Error) => void) => {
        const callback = typeof optionsOrCb === 'function' ? optionsOrCb : cb;
        if (typeof callback === 'function') {
          callback(new Error('Publish error'));
        }
      });

    // Act & Assert
    await expect(scope.service.publish(1, 'test/topic', 'test message')).rejects.toThrow('Publish error');
  });
}
