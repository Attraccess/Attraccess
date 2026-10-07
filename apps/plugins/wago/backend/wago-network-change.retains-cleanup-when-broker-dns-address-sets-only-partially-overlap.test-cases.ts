import { lookup } from 'node:dns/promises';
import type { SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope } from "./wago-network-change.spec";
export function registerRetainsCleanupWhenBrokerDnsAddressSetsOnlyPartiallyOverlap(scope: SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope): void {
it('retains cleanup when broker DNS address sets only partially overlap', async () => {
    await scope.service.apply(1, { targetHost: scope.newHost, mqttServerId: 2 }, scope.principal);
    jest.mocked(lookup).mockImplementation(
      async (host: string) =>
        [
          { address: '192.168.4.10', family: 4 },
          { address: host === 'unreachable-old.test' ? '192.168.3.10' : '192.168.5.10', family: 4 },
        ] as never,
    );
    await expect(scope.service.retirePreviousCredentials(1, scope.principal)).rejects.toThrow('could not be retired');
    expect(scope.revoke).not.toHaveBeenCalled();
    expect((await scope.service.status(1)).pendingCredentialRetirements).toBe(1);
  });
}
