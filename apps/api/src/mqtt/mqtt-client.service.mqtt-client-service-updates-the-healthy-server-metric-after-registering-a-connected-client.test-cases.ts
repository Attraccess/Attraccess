import { Logger } from '@nestjs/common';
import { MqttClientServiceTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerMqttClientServiceUpdatesTheHealthyServerMetricAfterRegisteringAConnectedClient(
  scope: MqttClientServiceTestScope,
): void {
  it('updates the healthy server metric after registering a connected client', async () => {
    // Arrange
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'error').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());

    const servicePrivate = scope.service as unknown as MqttClientServicePrivate;

    // Act
    await servicePrivate.getOrCreateClient(1);

    // Assert
    expect(servicePrivate.clients.get(1)?.connected).toBe(true);
    expect(scope.mockMetricsService.mqttServersHealthy.set).toHaveBeenCalledWith(1);
  });
}
