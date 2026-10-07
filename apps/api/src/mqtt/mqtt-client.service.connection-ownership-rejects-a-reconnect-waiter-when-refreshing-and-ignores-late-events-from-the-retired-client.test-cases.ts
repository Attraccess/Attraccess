import { ConnectionOwnershipTestScope } from './mqtt-client.service.spec';
import { MqttClientServicePrivate } from './mqtt-client.service.spec';

export function registerConnectionOwnershipRejectsAReconnectWaiterWhenRefreshingAndIgnoresLateEventsFromTheRetiredClient(
  scope: ConnectionOwnershipTestScope,
): void {
  it('rejects a reconnect waiter when refreshing and ignores late events from the retired client', async () => {
    const internal = scope.service as unknown as MqttClientServicePrivate;
    const previous = await internal.getOrCreateClient(1);
    previous.connected = false;
    const waiting = expect(internal.getOrCreateClient(1)).rejects.toThrow('replaced');

    await scope.service.refreshConnection(1);
    await waiting;
    const replacement = internal.clients.get(1);
    previous.connected = true;
    previous.emit('connect');
    expect(internal.clients.get(1)).toBe(replacement);
    expect(previous.end).toHaveBeenCalledWith(true);
  });
}
