import * as mqtt from 'mqtt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RefreshConnectionTestScope } from './mqtt-client.service.spec';
export function registerRefreshConnectionUsesCurrentAddressCredentialsAndTlsSettingsPreservingSharedSubscriptionsAndRejectingLate(
  scope: RefreshConnectionTestScope,
): void {
  it('uses current address, credentials and TLS settings, preserving shared subscriptions and rejecting late old-client events', async () => {
    const internal = scope.useRealConnections();
    const previous = await internal.getOrCreateClient(1);
    await scope.service.subscribe(1, 'devices/#', 2);
    (scope.mockRepository.findOneBy as jest.Mock).mockResolvedValue({
      ...scope.mockServer,
      host: 'new-broker.test',
      port: 8883,
      useTls: true,
      password: 'enc:fresh-password',
      caCert: 'public-ca',
      tlsServername: 'broker.internal',
    });
    jest.mocked(mqtt.connect).mockClear();
    await scope.service.refreshConnection(1);
    const current = internal.clients.get(1);
    expect(current).toBeDefined();
    expect(current).not.toBe(previous);
    expect(previous.end).toHaveBeenCalledWith(true);
    expect(mqtt.connect).toHaveBeenCalledWith(
      'mqtts://new-broker.test:8883',
      expect.objectContaining({
        username: 'testuser',
        password: 'fresh-password',
        ca: 'public-ca',
        servername: 'broker.internal',
      }),
    );
    expect(current?.subscribe).toHaveBeenCalledWith('devices/#', { qos: 2 }, expect.any(Function));
    jest.mocked(scope.mockEventEmitter.emit as EventEmitter2['emit']).mockClear();
    previous.emit('connect', { cmd: 'connack', sessionPresent: false, returnCode: 0 });
    previous.emit('message', 'devices/old', Buffer.from('stale'), {
      cmd: 'publish',
      topic: 'devices/old',
      payload: Buffer.from('stale'),
      qos: 0,
      dup: false,
      retain: false,
    });
    expect(internal.clients.get(1)).toBe(current);
    expect(scope.mockEventEmitter.emit).not.toHaveBeenCalled();
  });
}
