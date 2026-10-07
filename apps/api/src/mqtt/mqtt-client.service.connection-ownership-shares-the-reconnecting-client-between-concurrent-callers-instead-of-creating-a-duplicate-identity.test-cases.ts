import * as mqtt from 'mqtt';
import { ConnectionOwnershipTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerConnectionOwnershipSharesTheReconnectingClientBetweenConcurrentCallersInsteadOfCreatingADuplicateIdentity(
  scope: ConnectionOwnershipTestScope,
): void {
  it('shares the reconnecting client between concurrent callers instead of creating a duplicate identity', async () => {
    const internal = scope.service as unknown as MqttClientServicePrivate;
    const client = await internal.getOrCreateClient(1);
    client.connected = false;
    client.emit('offline');
    (mqtt.connect as jest.Mock).mockClear();

    const first = internal.getOrCreateClient(1);
    const second = internal.getOrCreateClient(1);
    client.connected = true;
    client.emit('connect');

    await expect(first).resolves.toBe(client);
    await expect(second).resolves.toBe(client);
    expect(mqtt.connect).not.toHaveBeenCalled();
    expect(client.end).not.toHaveBeenCalled();
  });
}
