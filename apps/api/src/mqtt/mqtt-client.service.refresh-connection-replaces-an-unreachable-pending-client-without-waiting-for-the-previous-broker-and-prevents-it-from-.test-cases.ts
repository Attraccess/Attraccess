import * as mqtt from 'mqtt';
import { EventEmitter } from 'node:events';
import { RefreshConnectionTestScope } from './mqtt-client.service.spec';
export function registerRefreshConnectionReplacesAnUnreachablePendingClientWithoutWaitingForThePreviousBrokerAndPreventsItFrom(
  scope: RefreshConnectionTestScope,
): void {
  it('replaces an unreachable pending client without waiting for the previous broker and prevents it from reconnecting', async () => {
    const internal = scope.useRealConnections();
    const previous = Object.assign(new EventEmitter(), {
      connected: false,
      end: jest.fn(),
    }) as unknown as mqtt.MqttClient;
    jest.mocked(mqtt.connect).mockReturnValueOnce(previous);
    const pending = internal.getOrCreateClient(1, true);
    const rejected = pending.catch((error) => error);
    await new Promise(setImmediate);
    (scope.mockRepository.findOneBy as jest.Mock).mockResolvedValue({ ...scope.mockServer, host: 'new-broker.test' });
    await scope.service.refreshConnection(1);
    expect((await rejected).message).toBe('MQTT connection was replaced');
    expect(previous.end).toHaveBeenCalledWith(true);
    const current = internal.clients.get(1);
    previous.emit('connect', { cmd: 'connack', sessionPresent: false, returnCode: 0 });
    expect(internal.clients.get(1)).toBe(current);
    expect(mqtt.connect).toHaveBeenLastCalledWith('mqtt://new-broker.test:1883', expect.anything());
  });
}
