import { WagoManagedAccess } from './wago-managed-access.entity';
import type { SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope } from "./wago-network-change.spec";
export function registerKeepsOldCredentialRetirementAvailableAfterSshManagementHasBeenRetired(scope: SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope): void {
it('keeps old-credential retirement available after SSH management has been retired', async () => {
    await scope.service.apply(1, { targetHost: scope.newHost, mqttServerId: 2 }, scope.principal);
    await scope.db.getRepository(WagoManagedAccess).update(1, { state: 'retired' });
    scope.revoke.mockResolvedValue(undefined);
    expect(await scope.service.retirePreviousCredentials(1, scope.principal)).toMatchObject({
      available: false,
      pendingCredentialRetirements: 0,
    });
  });
}
