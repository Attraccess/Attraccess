import * as mqtt from 'mqtt';
import { EventEmitter } from 'node:events';
import { RefreshConnectionTestScope } from './mqtt-client.service.spec';
export function registerRefreshConnectionKeepsReconnectingAfterRefreshTimesOutAndRestoresExistingSubscriptionsWhenTheBrokerRecov(
  scope: RefreshConnectionTestScope,
): void {
  it('keeps reconnecting after refresh times out and restores existing subscriptions when the broker recovers', async () => {
    const internal = scope.useRealConnections();
    await internal.getOrCreateClient(1);
    await scope.service.subscribe(1, 'devices/#', 2);
    const replacement = Object.assign(new EventEmitter(), {
      connected: false,
      end: jest.fn(),
      subscribe: jest.fn((_topic, _options, done) => done()),
    }) as unknown as mqtt.MqttClient;
    jest.mocked(mqtt.connect).mockReturnValueOnce(replacement);
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const refresh = scope.service.refreshConnection(1);
      const failure = expect(refresh).rejects.toThrow('Timeout connecting');
      await new Promise(setImmediate);
      await jest.advanceTimersByTimeAsync(10_000);
      await failure;
      expect(scope.mockMetricsService.mqttServersHealthy.set).toHaveBeenLastCalledWith(0);
      expect(replacement.end).not.toHaveBeenCalled();
      replacement.connected = true;
      replacement.emit('connect');
      expect(internal.clients.get(1)).toBe(replacement);
      expect(replacement.subscribe).toHaveBeenCalledWith('devices/#', { qos: 2 }, expect.any(Function));
      expect(scope.mockMetricsService.mqttServersHealthy.set).toHaveBeenLastCalledWith(1);
    } finally {
      jest.useRealTimers();
    }
  });
}
