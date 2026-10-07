import { runtimeVersion } from '../manifest.json';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimePublishesTheRequiredRetainedDiscoveryAnnouncementAndPersistsAValidClaim(
  scope: WagoRuntimeTestScope,
): void {
  it('publishes the required retained discovery announcement and persists a valid claim', async () => {
    await scope.runtime.publishDiscoveryAnnouncement(1);
    expect(scope.transport.published).toContainEqual({
      topic: 'attraccess/wago/discovery/cc100-1',
      payload: expect.objectContaining({
        hardwareId: 'cc100-1',
        pairingCode: '482931',
        enrollmentSecret: 'enrollment-secret',
        protocolVersion: '1.0.0',
        runtimeVersion,
        capabilities: expect.arrayContaining(['claim', 'heartbeat', 'configuration-v1']),
        sequence: expect.any(Number),
      }),
      retain: true,
    });
    await expect(
      scope.runtime.receiveDiscoveryClaim(
        Buffer.from(
          '{"username":"controller","password":"secret","configuration":{"namespace":"customer/wago"},"acknowledgementToken":"claim-token"}',
        ),
      ),
    ).resolves.toEqual({ username: 'controller', password: 'secret', prefix: 'customer/wago' });
    expect(scope.transport.published).toContainEqual({
      topic: 'attraccess/wago/discovery/cc100-1/claim/ack',
      payload: { acknowledgementToken: 'claim-token' },
      retain: undefined,
    });
    await expect(
      scope.runtime.receiveDiscoveryClaim(Buffer.from('{"username":"controller"}')),
    ).resolves.toBeUndefined();
  });
}
