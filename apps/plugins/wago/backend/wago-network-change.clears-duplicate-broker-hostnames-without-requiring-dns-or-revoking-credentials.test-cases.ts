import { lookup } from 'node:dns/promises';
import type { SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope } from "./wago-network-change.spec";
export function registerClearsDuplicateBrokerHostnamesWithoutRequiringDnsOrRevokingCredentials(scope: SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope): void {
it('clears duplicate broker hostnames without requiring DNS or revoking credentials', async () => {
    scope.brokerHost = 'unreachable-old.test';
    await scope.service.apply(1, { targetHost: scope.newHost, mqttServerId: 2 }, scope.principal);
    jest.mocked(lookup).mockRejectedValue(new Error('DNS unavailable'));
    expect(await scope.service.retirePreviousCredentials(1, scope.principal)).toMatchObject({ pendingCredentialRetirements: 0 });
    expect(scope.revoke).not.toHaveBeenCalled();
  });
}
