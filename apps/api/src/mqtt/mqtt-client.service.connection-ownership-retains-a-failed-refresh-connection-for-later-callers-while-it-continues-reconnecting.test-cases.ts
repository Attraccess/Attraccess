import * as mqtt from 'mqtt';
import { EventEmitter } from 'node:events';
import { ConnectionOwnershipTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerConnectionOwnershipRetainsAFailedRefreshConnectionForLaterCallersWhileItContinuesReconnecting(
  scope: ConnectionOwnershipTestScope,
): void {
  it('retains a failed refresh connection for later callers while it continues reconnecting', async () => {
    const unreachable = Object.assign(new EventEmitter(), { connected: false, end: jest.fn() });
    (mqtt.connect as jest.Mock).mockImplementationOnce(() => unreachable);
    const refresh = expect(scope.service.refreshConnection(1)).rejects.toThrow('Timeout');
    await jest.advanceTimersByTimeAsync(10_000);
    await refresh;
    (mqtt.connect as jest.Mock).mockClear();

    const retry = (scope.service as unknown as MqttClientServicePrivate).getOrCreateClient(1);
    unreachable.connected = true;
    unreachable.emit('connect');
    await expect(retry).resolves.toBe(unreachable);
    expect(mqtt.connect).not.toHaveBeenCalled();
  });
}
