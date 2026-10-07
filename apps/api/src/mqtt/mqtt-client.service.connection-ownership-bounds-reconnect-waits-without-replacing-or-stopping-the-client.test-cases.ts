import * as mqtt from 'mqtt';
import { ConnectionOwnershipTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerConnectionOwnershipBoundsReconnectWaitsWithoutReplacingOrStoppingTheClient(
  scope: ConnectionOwnershipTestScope,
): void {
  it('bounds reconnect waits without replacing or stopping the client', async () => {
    const internal = scope.service as unknown as MqttClientServicePrivate;
    const client = await internal.getOrCreateClient(1);
    client.connected = false;
    (mqtt.connect as jest.Mock).mockClear();

    const waiting = expect(internal.getOrCreateClient(1)).rejects.toThrow('Timeout');
    await jest.advanceTimersByTimeAsync(10_000);
    await waiting;
    expect(mqtt.connect).not.toHaveBeenCalled();
    expect(client.end).not.toHaveBeenCalled();

    const retry = internal.getOrCreateClient(1);
    client.connected = true;
    client.emit('connect');
    await expect(retry).resolves.toBe(client);
  });
}
